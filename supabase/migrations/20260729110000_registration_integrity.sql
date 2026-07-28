-- Cross-feature integrity: prevent duplicate entries and enforce server-side modes/capacity.

drop index if exists public.os_registration_email_tier_unique;
create unique index if not exists os_registration_email_event_active_unique
  on public.os_registrations(event_id,lower(email))
  where status in ('reserved','pending','confirmed','cancel_requested');
create unique index if not exists os_registration_user_event_active_unique
  on public.os_registrations(event_id,participant_user_id)
  where participant_user_id is not null
    and status in ('reserved','pending','confirmed','cancel_requested');

drop index if exists public.os_waitlist_email_tier_unique;
create unique index if not exists os_waitlist_email_event_active_unique
  on public.os_waitlist(event_id,lower(email))
  where status in ('waiting','invited');

create unique index if not exists os_lottery_email_event_unique
  on public.os_lottery_applications(event_id,lower(email));

-- All online registrations, including free entries, must pass through the
-- server-side reservation functions. This closes the old direct-insert path.
drop policy if exists "participants create registrations" on public.os_registrations;

-- Limit browser-authenticated updates to fields the organizer UI legitimately
-- edits. Payment ownership and Stripe capability fields remain service-only.
revoke update on table public.os_registrations from authenticated;
grant update(first_name,last_name,email,emergency_contact,bib_number,organizer_notes,status)
  on table public.os_registrations to authenticated;
revoke update on table public.os_profiles from authenticated;
grant update(display_name) on table public.os_profiles to authenticated;
revoke update on table public.os_lottery_applications from authenticated;
grant update(status,review_notes,bonus_tickets,reviewed_at,reviewed_by)
  on table public.os_lottery_applications to authenticated;

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
    if exists(
      select 1 from public.os_registrations registration
      where registration.event_id=new.event_id and lower(registration.email)=new.email
        and registration.id<>new.id
        and registration.status in ('reserved','pending','confirmed','cancel_requested')
    ) then raise exception 'This participant is already registered for this event'; end if;
    if new.participant_user_id is not null and exists(
      select 1 from public.os_registrations registration
      where registration.event_id=new.event_id
        and registration.participant_user_id=new.participant_user_id
        and registration.id<>new.id
        and registration.status in ('reserved','pending','confirmed','cancel_requested')
    ) then raise exception 'This account already has a registration for this event'; end if;
    update public.os_waitlist set status='registered'
    where event_id=new.event_id and lower(email)=new.email and status in ('waiting','invited');
  end if;
  return new;
end;
$$;

drop trigger if exists os_guard_registration_integrity on public.os_registrations;
drop trigger if exists os_10_guard_registration_integrity on public.os_registrations;
create trigger os_10_guard_registration_integrity
before insert or update of event_id,tier_id,email,participant_user_id,status
on public.os_registrations
for each row execute function public.os_guard_registration_integrity();
revoke all on function public.os_guard_registration_integrity() from public,anon,authenticated;

create or replace function public.os_enforce_tier_capacity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tier public.os_event_tiers%rowtype;
  v_reserved integer;
begin
  if new.status not in ('reserved','pending','confirmed','cancel_requested') then return new; end if;
  if tg_op='UPDATE' and new.tier_id is not distinct from old.tier_id
    and new.status is not distinct from old.status then return new; end if;
  select * into v_tier from public.os_event_tiers where id=new.tier_id for update;
  if not found or v_tier.event_id<>new.event_id then raise exception 'Registration option does not belong to this event'; end if;
  select count(*) into v_reserved from public.os_registrations registration
  where registration.tier_id=new.tier_id and registration.id<>new.id
    and (
      registration.status in ('pending','confirmed','cancel_requested')
      or (registration.status='reserved' and registration.reservation_expires_at>now())
    );
  if v_reserved>=v_tier.capacity then raise exception 'This registration option is sold out'; end if;
  return new;
end;
$$;

drop trigger if exists os_enforce_tier_capacity on public.os_registrations;
drop trigger if exists os_20_enforce_tier_capacity on public.os_registrations;
create trigger os_20_enforce_tier_capacity
before insert or update of tier_id,status,event_id on public.os_registrations
for each row execute function public.os_enforce_tier_capacity();
revoke all on function public.os_enforce_tier_capacity() from public,anon,authenticated;

create or replace function public.os_join_waitlist(
  p_event_id uuid,p_tier_id uuid,p_first_name text,p_last_name text,p_email text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_event public.os_events%rowtype;
  v_tier public.os_event_tiers%rowtype;
  v_reserved integer;
  v_email text:=left(lower(trim(coalesce(p_email,''))),320);
begin
  if position('@' in v_email)<=1 then raise exception 'A valid email is required'; end if;
  select * into v_event from public.os_events where id=p_event_id for update;
  if not found or v_event.status<>'published' or v_event.registration_mode<>'open' then
    raise exception 'Event is not available';
  end if;
  select * into v_tier from public.os_event_tiers where id=p_tier_id and event_id=p_event_id;
  if not found then raise exception 'Registration option was not found'; end if;
  select count(*) into v_reserved from public.os_registrations
  where tier_id=p_tier_id and (
    status in ('pending','confirmed','cancel_requested')
    or (status='reserved' and reservation_expires_at>now())
  );
  if v_reserved<v_tier.capacity then raise exception 'Registration is still available'; end if;
  if exists(
    select 1 from public.os_registrations
    where event_id=p_event_id and lower(email)=v_email
      and status in ('reserved','pending','confirmed','cancel_requested')
  ) then raise exception 'This participant is already registered'; end if;
  insert into public.os_waitlist(event_id,tier_id,first_name,last_name,email)
  values(p_event_id,p_tier_id,left(trim(p_first_name),100),left(trim(p_last_name),100),v_email)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.os_join_waitlist(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.os_join_waitlist(uuid,uuid,text,text,text) to service_role;

create or replace function public.os_enforce_team_capacity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team public.os_teams%rowtype;
  v_members integer;
begin
  if new.team_id is null or new.status not in ('reserved','pending','confirmed','cancel_requested') then return new; end if;
  if tg_op='UPDATE' and new.team_id is not distinct from old.team_id
    and new.status is not distinct from old.status then return new; end if;
  select * into v_team from public.os_teams where id=new.team_id for update;
  if not found or v_team.event_id<>new.event_id then raise exception 'Team does not belong to this event'; end if;
  if v_team.max_members is not null then
    select count(*) into v_members from public.os_registrations
    where team_id=new.team_id and id<>new.id
      and status in ('reserved','pending','confirmed','cancel_requested');
    if v_members>=v_team.max_members then raise exception 'This team is full'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists os_enforce_team_capacity on public.os_registrations;
drop trigger if exists os_30_enforce_team_capacity on public.os_registrations;
create trigger os_30_enforce_team_capacity
before insert or update of team_id,status,event_id on public.os_registrations
for each row execute function public.os_enforce_team_capacity();
revoke all on function public.os_enforce_team_capacity() from public,anon,authenticated;

create or replace function public.os_protect_event_financial_settings()
returns trigger
language plpgsql
set search_path=public,auth
as $$
begin
  if new.platform_fee_bps is distinct from old.platform_fee_bps
    and coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Platform fee settings are service-managed';
  end if;
  return new;
end;
$$;

drop trigger if exists os_protect_event_financial_settings on public.os_events;
create trigger os_protect_event_financial_settings
before update of platform_fee_bps on public.os_events
for each row execute function public.os_protect_event_financial_settings();
revoke all on function public.os_protect_event_financial_settings() from public,anon,authenticated;

create or replace function public.os_expire_reservations()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.os_registrations
  set status='expired',payment_status='failed'
  where status='reserved' and reservation_expires_at<=now();
  get diagnostics v_count=row_count;
  update public.os_orders customer_order set status='expired'
  where customer_order.status='reserved'
    and exists(select 1 from public.os_registrations registration where registration.order_id=customer_order.id)
    and not exists(
      select 1 from public.os_registrations registration
      where registration.order_id=customer_order.id
        and registration.status in ('reserved','pending','confirmed','cancel_requested')
    );
  return v_count;
end;
$$;
revoke all on function public.os_expire_reservations() from public,anon,authenticated;
grant execute on function public.os_expire_reservations() to service_role;
