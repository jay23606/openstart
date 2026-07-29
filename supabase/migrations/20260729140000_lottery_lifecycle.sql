-- Auditable weighted lottery draws, expiring offers, and automatic promotion.

alter table public.os_events
  add column if not exists lottery_invitation_hours integer not null default 48
    check (lottery_invitation_hours between 1 and 168);

alter table public.os_lottery_applications
  add column if not exists invitation_status text not null default 'none'
    check (invitation_status in ('none','offered','checkout','accepted','expired','declined')),
  add column if not exists invited_at timestamptz,
  add column if not exists invitation_expires_at timestamptz,
  add column if not exists waitlist_position integer check (waitlist_position is null or waitlist_position > 0),
  add column if not exists registration_id uuid references public.os_registrations(id) on delete set null;

alter table public.os_registrations
  add column if not exists lottery_application_id uuid unique
    references public.os_lottery_applications(id) on delete set null;

alter table public.os_registrations drop constraint if exists os_registrations_registration_source_check;
alter table public.os_registrations add constraint os_registrations_registration_source_check
  check (registration_source in ('online','manual','import','lottery'));

create table if not exists public.os_lottery_draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.os_events(id) on delete cascade,
  algorithm_version text not null default 'weighted-exponential-v1',
  seed text not null,
  seed_hash text not null,
  available_spots integer not null check (available_spots > 0),
  eligible_count integer not null check (eligible_count >= 0),
  selected_count integer not null check (selected_count >= 0),
  drawn_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.os_lottery_draw_entries (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.os_lottery_draws(id) on delete cascade,
  application_id uuid not null unique references public.os_lottery_applications(id) on delete cascade,
  ticket_count integer not null check (ticket_count > 0),
  weighted_score numeric(30,18) not null,
  draw_rank integer not null check (draw_rank > 0),
  selected boolean not null,
  created_at timestamptz not null default now(),
  unique(draw_id,draw_rank)
);

create or replace function public.os_guard_registration_integrity()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_event public.os_events%rowtype;
  v_user_email text;
begin
  new.email:=left(lower(trim(coalesce(new.email,''))),320);
  if position('@' in new.email)<=1 then raise exception 'A valid participant email is required'; end if;
  select * into v_event from public.os_events where id=new.event_id for update;
  if not found then raise exception 'Event was not found'; end if;
  if not exists(select 1 from public.os_event_tiers where id=new.tier_id and event_id=new.event_id) then
    raise exception 'Registration option does not belong to this event';
  end if;
  if tg_op='INSERT' and new.registration_source='online' and v_event.registration_mode<>'open' then
    raise exception 'This event is not accepting open registration';
  end if;
  if tg_op='INSERT' and new.registration_source='lottery' and (
    v_event.registration_mode<>'lottery' or new.lottery_application_id is null
    or not exists(
      select 1 from public.os_lottery_applications application
      where application.id=new.lottery_application_id and application.event_id=new.event_id
        and application.tier_id=new.tier_id and application.applicant_user_id=new.participant_user_id
        and application.status='selected' and application.invitation_status in ('offered','checkout')
        and application.invitation_expires_at>now()
    )
  ) then raise exception 'A valid lottery invitation is required'; end if;
  if new.status='confirmed' and new.payment_status not in ('paid','not_required') then
    raise exception 'An unpaid registration cannot be confirmed';
  end if;
  if new.participant_user_id is not null
    and (tg_op='INSERT' or new.participant_user_id is distinct from old.participant_user_id or new.email is distinct from old.email) then
    select lower(email) into v_user_email from auth.users where id=new.participant_user_id;
    if v_user_email is null or v_user_email<>new.email then
      raise exception 'Participant account must match the registration email';
    end if;
  end if;
  if new.status in ('reserved','pending','confirmed','cancel_requested') then
    if exists(select 1 from public.os_registrations registration
      where registration.event_id=new.event_id and lower(registration.email)=new.email
        and registration.id<>new.id and registration.status in ('reserved','pending','confirmed','cancel_requested'))
    then raise exception 'This participant is already registered for this event'; end if;
    if new.participant_user_id is not null and exists(select 1 from public.os_registrations registration
      where registration.event_id=new.event_id and registration.participant_user_id=new.participant_user_id
        and registration.id<>new.id and registration.status in ('reserved','pending','confirmed','cancel_requested'))
    then raise exception 'This account already has a registration for this event'; end if;
    update public.os_waitlist set status='registered'
    where event_id=new.event_id and lower(email)=new.email and status in ('waiting','invited');
  end if;
  return new;
end;
$$;

alter table public.os_lottery_draws enable row level security;
alter table public.os_lottery_draw_entries enable row level security;

drop policy if exists "organizers read lottery draws" on public.os_lottery_draws;
create policy "organizers read lottery draws" on public.os_lottery_draws for select to authenticated
using (exists(select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()));
drop policy if exists "organizers and applicants read draw entries" on public.os_lottery_draw_entries;
create policy "organizers and applicants read draw entries" on public.os_lottery_draw_entries for select to authenticated
using (
  exists(select 1 from public.os_lottery_applications application where application.id=application_id and application.applicant_user_id=auth.uid())
  or exists(
    select 1 from public.os_lottery_draws draw join public.os_events event on event.id=draw.event_id
    where draw.id=draw_id and event.organizer_id=auth.uid()
  )
);

create or replace function public.os_run_lottery_draw(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_event public.os_events%rowtype;
  v_draw uuid;
  v_seed text := encode(extensions.gen_random_bytes(32),'hex');
  v_eligible integer;
  v_selected integer;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into v_event from public.os_events
  where id=p_event_id and organizer_id=auth.uid() for update;
  if not found then raise exception 'Event was not found'; end if;
  if v_event.registration_mode<>'lottery' then raise exception 'This event is not configured as a lottery'; end if;
  if v_event.lottery_closes_at is null or now()<v_event.lottery_closes_at then
    raise exception 'The application period must close before the draw';
  end if;
  if v_event.lottery_spots is null then raise exception 'Lottery spots are not configured'; end if;
  if exists(select 1 from public.os_lottery_draws where event_id=p_event_id) then
    raise exception 'This lottery draw is already finalized';
  end if;

  select count(*) into v_eligible from public.os_lottery_applications
  where event_id=p_event_id and status='qualified';
  if v_eligible=0 then raise exception 'Qualify at least one application before drawing'; end if;
  v_selected := least(v_event.lottery_spots,v_eligible);

  insert into public.os_lottery_draws(
    event_id,seed,seed_hash,available_spots,eligible_count,selected_count,drawn_by
  ) values(
    p_event_id,v_seed,encode(extensions.digest(v_seed,'sha256'),'hex'),
    v_event.lottery_spots,v_eligible,v_selected,auth.uid()
  ) returning id into v_draw;

  insert into public.os_lottery_draw_entries(
    draw_id,application_id,ticket_count,weighted_score,draw_rank,selected
  )
  select v_draw,ranked.id,ranked.tickets,ranked.score,ranked.rank,ranked.rank<=v_selected
  from (
    select scored.*,
      row_number() over(order by score,id)::integer as rank
    from (
      select application.id,
        application.base_tickets+application.bonus_tickets as tickets,
        (
          -ln(
            ((('x'||substr(encode(extensions.digest(v_seed||application.id::text,'sha256'),'hex'),1,15))::bit(60)::bigint+1)::numeric)
            /1152921504606846977::numeric
          )/(application.base_tickets+application.bonus_tickets)
        )::numeric(30,18) as score
      from public.os_lottery_applications application
      where application.event_id=p_event_id and application.status='qualified'
    ) scored
  ) ranked;

  update public.os_lottery_applications application set
    status=case when entry.selected then 'selected' else 'waitlisted' end,
    invitation_status=case when entry.selected then 'offered' else 'none' end,
    invited_at=case when entry.selected then now() else null end,
    invitation_expires_at=case when entry.selected then now()+make_interval(hours=>v_event.lottery_invitation_hours) else null end,
    waitlist_position=case when entry.selected then null else entry.draw_rank-v_selected end,
    updated_at=now()
  from public.os_lottery_draw_entries entry
  where entry.draw_id=v_draw and application.id=entry.application_id;

  return v_draw;
end;
$$;

create or replace function public.os_review_lottery_application(
  p_application_id uuid,p_status text,p_bonus_tickets integer,p_review_notes text
) returns void
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if p_status not in ('submitted','qualified','disqualified') then raise exception 'Review status is invalid'; end if;
  if p_bonus_tickets<0 then raise exception 'Bonus tickets cannot be negative'; end if;
  update public.os_lottery_applications application set
    status=p_status,bonus_tickets=p_bonus_tickets,review_notes=trim(coalesce(p_review_notes,'')),
    reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
  where application.id=p_application_id
    and exists(select 1 from public.os_events event where event.id=application.event_id and event.organizer_id=auth.uid())
    and not exists(select 1 from public.os_lottery_draws draw where draw.event_id=application.event_id)
    and application.status in ('submitted','qualified','disqualified');
  if not found then raise exception 'This application can no longer be reviewed'; end if;
end;
$$;

create or replace function public.os_reserve_lottery_registration(
  p_application_id uuid,
  p_emergency_contact text,
  p_idempotency_key uuid
) returns table(
  registration_id uuid,amount_cents integer,event_name text,tier_name text,
  stripe_account_id text,platform_fee_bps integer,invitation_expires_at timestamptz
)
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_application public.os_lottery_applications%rowtype;
  v_event public.os_events%rowtype;
  v_tier public.os_event_tiers%rowtype;
  v_profile public.os_profiles%rowtype;
  v_registration public.os_registrations%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into v_application from public.os_lottery_applications
  where id=p_application_id and applicant_user_id=auth.uid() for update;
  if not found then raise exception 'Lottery invitation was not found'; end if;
  if v_application.status<>'selected' or v_application.invitation_status not in ('offered','checkout')
    or v_application.invitation_expires_at<=now() then raise exception 'This lottery invitation is no longer available'; end if;
  if nullif(trim(p_emergency_contact),'') is null then raise exception 'Emergency contact is required'; end if;
  select * into v_event from public.os_events where id=v_application.event_id for update;
  select * into v_tier from public.os_event_tiers where id=v_application.tier_id and event_id=v_event.id;
  select * into v_profile from public.os_profiles where id=v_event.organizer_id;

  select * into v_registration from public.os_registrations
  where lottery_application_id=v_application.id;
  if not found then
    insert into public.os_registrations(
      event_id,tier_id,participant_user_id,first_name,last_name,email,emergency_contact,
      status,payment_status,amount_cents,base_amount_cents,idempotency_key,
      reservation_expires_at,registration_source,lottery_application_id
    ) values(
      v_event.id,v_tier.id,v_application.applicant_user_id,v_application.first_name,v_application.last_name,
      v_application.email,trim(p_emergency_contact),
      case when v_tier.price_cents=0 then 'confirmed' else 'reserved' end,
      case when v_tier.price_cents=0 then 'not_required' else 'pending' end,
      v_tier.price_cents,v_tier.price_cents,p_idempotency_key,
      case when v_tier.price_cents=0 then null else v_application.invitation_expires_at end,
      'lottery',v_application.id
    ) returning * into v_registration;
    update public.os_lottery_applications set
      registration_id=v_registration.id,
      invitation_status=case when v_tier.price_cents=0 then 'accepted' else 'checkout' end,
      updated_at=now()
    where id=v_application.id;
  elsif v_registration.status in ('expired','cancelled') then
    update public.os_registrations set
      status='reserved',payment_status='pending',idempotency_key=p_idempotency_key,
      reservation_expires_at=v_application.invitation_expires_at,
      stripe_checkout_session_id=null
    where id=v_registration.id
    returning * into v_registration;
  end if;

  return query select v_registration.id,v_registration.amount_cents,v_event.name,v_tier.name,
    v_profile.stripe_account_id,v_event.platform_fee_bps,v_application.invitation_expires_at;
end;
$$;

create or replace function public.os_lock_finalized_lottery_settings()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if exists(select 1 from public.os_lottery_draws where event_id=new.id) and (
    new.registration_mode is distinct from old.registration_mode
    or new.lottery_opens_at is distinct from old.lottery_opens_at
    or new.lottery_closes_at is distinct from old.lottery_closes_at
    or new.lottery_spots is distinct from old.lottery_spots
    or new.lottery_invitation_hours is distinct from old.lottery_invitation_hours
    or new.qualifier_required is distinct from old.qualifier_required
    or new.qualifier_instructions is distinct from old.qualifier_instructions
  ) then raise exception 'Lottery settings are locked after the final draw'; end if;
  return new;
end;
$$;

drop trigger if exists os_lock_finalized_lottery_settings on public.os_events;
create trigger os_lock_finalized_lottery_settings before update on public.os_events
for each row execute function public.os_lock_finalized_lottery_settings();

create or replace function public.os_confirm_lottery_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.os_lottery_applications application set invitation_status='accepted',updated_at=now()
  from public.os_registrations registration
  where registration.id=p_registration_id
    and registration.lottery_application_id=application.id;
end;
$$;

create or replace function public.os_process_lottery_expirations()
returns table(application_id uuid,event_id uuid,email text,first_name text,event_name text,invitation_expires_at timestamptz)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expired record;
  v_promoted public.os_lottery_applications%rowtype;
  v_event public.os_events%rowtype;
begin
  for v_expired in
    select application.* from public.os_lottery_applications application
    where application.status='selected'
      and application.invitation_status in ('offered','checkout')
      and application.invitation_expires_at<=now()
    order by application.invitation_expires_at
    for update skip locked
  loop
    select * into v_event from public.os_events where id=v_expired.event_id for update;
    update public.os_registrations set status='expired',payment_status='failed'
    where lottery_application_id=v_expired.id and status in ('reserved','pending');
    update public.os_lottery_applications set
      status='waitlisted',invitation_status='expired',invitation_expires_at=null,updated_at=now()
    where id=v_expired.id;

    select application.* into v_promoted from public.os_lottery_applications application
    where application.event_id=v_expired.event_id
      and application.status='waitlisted' and application.invitation_status='none'
    order by application.waitlist_position,application.id for update skip locked limit 1;
    if found then
      update public.os_lottery_applications set
        status='selected',invitation_status='offered',invited_at=now(),
        invitation_expires_at=now()+make_interval(hours=>v_event.lottery_invitation_hours),
        updated_at=now()
      where id=v_promoted.id
      returning * into v_promoted;
      return query select v_promoted.id,v_promoted.event_id,v_promoted.email,v_promoted.first_name,
        v_event.name,v_promoted.invitation_expires_at;
    end if;
  end loop;
end;
$$;

revoke all on function public.os_run_lottery_draw(uuid) from public,anon;
revoke all on function public.os_review_lottery_application(uuid,text,integer,text) from public,anon;
revoke all on function public.os_reserve_lottery_registration(uuid,text,uuid) from public,anon;
revoke all on function public.os_confirm_lottery_registration(uuid) from public,anon,authenticated;
revoke all on function public.os_process_lottery_expirations() from public,anon,authenticated;
revoke all on function public.os_lock_finalized_lottery_settings() from public,anon,authenticated;
grant execute on function public.os_run_lottery_draw(uuid) to authenticated;
grant execute on function public.os_review_lottery_application(uuid,text,integer,text) to authenticated;
grant execute on function public.os_reserve_lottery_registration(uuid,text,uuid) to authenticated;
grant execute on function public.os_confirm_lottery_registration(uuid) to service_role;
grant execute on function public.os_process_lottery_expirations() to service_role;

revoke update on table public.os_lottery_applications from authenticated;

drop trigger if exists os_audit_changes on public.os_lottery_draws;
create trigger os_audit_changes after insert on public.os_lottery_draws
for each row execute function public.os_capture_audit();

drop trigger if exists os_audit_changes on public.os_lottery_draw_entries;
create trigger os_audit_changes after insert on public.os_lottery_draw_entries
for each row execute function public.os_capture_audit();
