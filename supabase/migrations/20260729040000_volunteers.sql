create table if not exists public.os_volunteer_roles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  name text not null,
  description text not null default '',
  requirements text not null default '',
  waiver_text text not null default '',
  minimum_age integer check (minimum_age is null or minimum_age >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.os_volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.os_volunteer_roles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  capacity integer not null check (capacity > 0),
  instructions text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.os_volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.os_volunteer_shifts(id) on delete cascade,
  volunteer_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null default '',
  emergency_contact text not null default '',
  notes text not null default '',
  status text not null default 'confirmed'
    check (status in ('confirmed','waitlisted','cancelled','completed','no_show')),
  waiver_accepted_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  hours_worked numeric(6,2) check (hours_worked is null or hours_worked >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists os_volunteer_signup_email_shift_unique
  on public.os_volunteer_signups(shift_id,lower(email))
  where status <> 'cancelled';
create index if not exists os_volunteer_roles_event_idx on public.os_volunteer_roles(event_id);
create index if not exists os_volunteer_shifts_role_idx on public.os_volunteer_shifts(role_id,starts_at);

alter table public.os_volunteer_roles enable row level security;
alter table public.os_volunteer_shifts enable row level security;
alter table public.os_volunteer_signups enable row level security;

create policy "volunteer roles follow event visibility" on public.os_volunteer_roles for select
using (exists (
  select 1 from public.os_events event
  where event.id=event_id and (event.status='published' or event.organizer_id=auth.uid())
));
create policy "organizers manage volunteer roles" on public.os_volunteer_roles for all to authenticated
using (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()))
with check (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()));

create policy "volunteer shifts follow role visibility" on public.os_volunteer_shifts for select
using (exists (
  select 1 from public.os_volunteer_roles role
  join public.os_events event on event.id=role.event_id
  where role.id=role_id and (event.status='published' or event.organizer_id=auth.uid())
));
create policy "organizers manage volunteer shifts" on public.os_volunteer_shifts for all to authenticated
using (exists (
  select 1 from public.os_volunteer_roles role join public.os_events event on event.id=role.event_id
  where role.id=role_id and event.organizer_id=auth.uid()
))
with check (exists (
  select 1 from public.os_volunteer_roles role join public.os_events event on event.id=role.event_id
  where role.id=role_id and event.organizer_id=auth.uid()
));

create policy "organizers manage volunteer signups" on public.os_volunteer_signups for all to authenticated
using (exists (
  select 1 from public.os_volunteer_shifts shift
  join public.os_volunteer_roles role on role.id=shift.role_id
  join public.os_events event on event.id=role.event_id
  where shift.id=shift_id and event.organizer_id=auth.uid()
))
with check (exists (
  select 1 from public.os_volunteer_shifts shift
  join public.os_volunteer_roles role on role.id=shift.role_id
  join public.os_events event on event.id=role.event_id
  where shift.id=shift_id and event.organizer_id=auth.uid()
));
create policy "volunteers read own signups" on public.os_volunteer_signups for select to authenticated
using (volunteer_user_id=auth.uid() or lower(email)=lower(coalesce(auth.jwt()->>'email','')));

create or replace function public.os_join_volunteer_shift(
  p_shift_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text default '',
  p_emergency_contact text default '',
  p_notes text default '',
  p_waiver_accepted boolean default false
) returns table(signup_id uuid,status text)
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_shift public.os_volunteer_shifts%rowtype;
  v_role public.os_volunteer_roles%rowtype;
  v_event public.os_events%rowtype;
  v_count integer;
  v_status text;
  v_id uuid;
begin
  select * into v_shift from public.os_volunteer_shifts where id=p_shift_id for update;
  if not found then raise exception 'Volunteer shift was not found'; end if;
  select * into v_role from public.os_volunteer_roles where id=v_shift.role_id;
  select * into v_event from public.os_events where id=v_role.event_id;
  if v_event.status <> 'published' then raise exception 'Volunteer signup is not open'; end if;
  if trim(coalesce(p_first_name,''))='' or trim(coalesce(p_last_name,''))='' or position('@' in p_email)=0 then
    raise exception 'Name and a valid email are required';
  end if;
  if v_role.waiver_text<>'' and not p_waiver_accepted then raise exception 'The volunteer waiver must be accepted'; end if;
  select count(*) into v_count from public.os_volunteer_signups
    where shift_id=p_shift_id and status in ('confirmed','completed');
  v_status:=case when v_count < v_shift.capacity then 'confirmed' else 'waitlisted' end;
  insert into public.os_volunteer_signups(
    shift_id,volunteer_user_id,first_name,last_name,email,phone,emergency_contact,notes,status,waiver_accepted_at
  ) values (
    p_shift_id,auth.uid(),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),
    trim(coalesce(p_phone,'')),trim(coalesce(p_emergency_contact,'')),trim(coalesce(p_notes,'')),v_status,
    case when p_waiver_accepted then now() else null end
  ) returning id into v_id;
  return query select v_id,v_status;
end;
$$;

revoke all on function public.os_join_volunteer_shift(uuid,text,text,text,text,text,text,boolean) from public;
grant execute on function public.os_join_volunteer_shift(uuid,text,text,text,text,text,text,boolean) to anon,authenticated;
