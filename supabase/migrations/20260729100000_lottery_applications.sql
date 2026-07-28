-- Lottery applications and qualifier review. The auditable draw follows separately.

alter table public.os_events
  add column if not exists registration_mode text not null default 'open'
    check (registration_mode in ('open','lottery','closed')),
  add column if not exists lottery_opens_at timestamptz,
  add column if not exists lottery_closes_at timestamptz,
  add column if not exists lottery_spots integer
    check (lottery_spots is null or lottery_spots > 0),
  add column if not exists qualifier_required boolean not null default false,
  add column if not exists qualifier_instructions text not null default '';

create table if not exists public.os_lottery_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  tier_id uuid not null references public.os_event_tiers(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  email text not null,
  qualifier_name text,
  qualifier_date date,
  qualifier_result text,
  qualifier_url text,
  qualifier_notes text not null default '',
  status text not null default 'submitted'
    check (status in ('submitted','qualified','disqualified','withdrawn','selected','waitlisted')),
  review_notes text not null default '',
  base_tickets integer not null default 1 check (base_tickets > 0),
  bonus_tickets integer not null default 0 check (bonus_tickets >= 0),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,applicant_user_id)
);

create index if not exists os_lottery_applications_event_status_idx
  on public.os_lottery_applications(event_id,status,created_at);
create index if not exists os_lottery_applications_applicant_idx
  on public.os_lottery_applications(applicant_user_id,created_at desc);

alter table public.os_lottery_applications enable row level security;

drop policy if exists "applicants and organizers read lottery applications" on public.os_lottery_applications;
create policy "applicants and organizers read lottery applications"
  on public.os_lottery_applications for select to authenticated
  using (
    applicant_user_id=auth.uid()
    or exists (
      select 1 from public.os_events event
      where event.id=event_id and event.organizer_id=auth.uid()
    )
  );

drop policy if exists "organizers review lottery applications" on public.os_lottery_applications;
create policy "organizers review lottery applications"
  on public.os_lottery_applications for update to authenticated
  using (exists (
    select 1 from public.os_events event
    where event.id=event_id and event.organizer_id=auth.uid()
  ))
  with check (exists (
    select 1 from public.os_events event
    where event.id=event_id and event.organizer_id=auth.uid()
  ) and status in ('submitted','qualified','disqualified'));

create or replace function public.os_submit_lottery_application(
  p_event_id uuid,
  p_tier_id uuid,
  p_first_name text,
  p_last_name text,
  p_qualifier_name text default null,
  p_qualifier_date date default null,
  p_qualifier_result text default null,
  p_qualifier_url text default null,
  p_qualifier_notes text default ''
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_event public.os_events%rowtype;
  v_application_id uuid;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Sign in before applying'; end if;
  select * into v_event from public.os_events where id=p_event_id and status='published';
  if not found or v_event.registration_mode<>'lottery' then raise exception 'This lottery is not available'; end if;
  if v_event.lottery_opens_at is not null and now()<v_event.lottery_opens_at then raise exception 'The lottery is not open yet'; end if;
  if v_event.lottery_closes_at is not null and now()>v_event.lottery_closes_at then raise exception 'The lottery application period has closed'; end if;
  if not exists(select 1 from public.os_event_tiers where id=p_tier_id and event_id=p_event_id) then raise exception 'Race option was not found'; end if;
  if v_event.qualifier_required and (
    nullif(trim(coalesce(p_qualifier_name,'')),'') is null
    or p_qualifier_date is null
    or nullif(trim(coalesce(p_qualifier_result,'')),'') is null
  ) then raise exception 'Qualifying race, date, and result are required'; end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null then raise exception 'First and last name are required'; end if;
  select email into v_email from auth.users where id=auth.uid();

  insert into public.os_lottery_applications(
    event_id,applicant_user_id,tier_id,first_name,last_name,email,
    qualifier_name,qualifier_date,qualifier_result,qualifier_url,qualifier_notes
  ) values (
    p_event_id,auth.uid(),p_tier_id,trim(p_first_name),trim(p_last_name),v_email,
    nullif(trim(coalesce(p_qualifier_name,'')),''),
    p_qualifier_date,
    nullif(trim(coalesce(p_qualifier_result,'')),''),
    nullif(trim(coalesce(p_qualifier_url,'')),''),
    trim(coalesce(p_qualifier_notes,''))
  )
  on conflict(event_id,applicant_user_id) do update set
    tier_id=excluded.tier_id,
    first_name=excluded.first_name,
    last_name=excluded.last_name,
    qualifier_name=excluded.qualifier_name,
    qualifier_date=excluded.qualifier_date,
    qualifier_result=excluded.qualifier_result,
    qualifier_url=excluded.qualifier_url,
    qualifier_notes=excluded.qualifier_notes,
    status='submitted',
    review_notes='',
    reviewed_at=null,
    reviewed_by=null,
    updated_at=now()
  where public.os_lottery_applications.status in ('submitted','qualified','disqualified','withdrawn')
  returning id into v_application_id;
  if v_application_id is null then raise exception 'This application can no longer be changed'; end if;
  return v_application_id;
end;
$$;

create or replace function public.os_withdraw_lottery_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  update public.os_lottery_applications
  set status='withdrawn',updated_at=now()
  where id=p_application_id and applicant_user_id=auth.uid()
    and status in ('submitted','qualified','disqualified');
  if not found then raise exception 'Application cannot be withdrawn'; end if;
end;
$$;

revoke all on function public.os_submit_lottery_application(uuid,uuid,text,text,text,date,text,text,text) from public,anon;
grant execute on function public.os_submit_lottery_application(uuid,uuid,text,text,text,date,text,text,text) to authenticated;
revoke all on function public.os_withdraw_lottery_application(uuid) from public,anon;
grant execute on function public.os_withdraw_lottery_application(uuid) to authenticated;

drop trigger if exists os_audit_changes on public.os_lottery_applications;
create trigger os_audit_changes
after insert or update or delete on public.os_lottery_applications
for each row execute function public.os_capture_audit();
