-- Race-day staff access, packet pickup, check-in, and auditable state.

create table if not exists public.os_event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  email text not null,
  role text not null default 'scanner'
    check (role in ('admin','registration','packet_pickup','scanner')),
  created_at timestamptz not null default now()
);
create unique index if not exists os_event_staff_email_unique
  on public.os_event_staff(event_id, lower(email));

alter table public.os_registrations
  add column if not exists packet_picked_up_at timestamptz,
  add column if not exists packet_picked_up_by uuid references auth.users(id) on delete set null,
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references auth.users(id) on delete set null;
create index if not exists os_registrations_checkin_idx
  on public.os_registrations(event_id, checked_in_at);

alter table public.os_event_staff enable row level security;
create policy "organizers manage event staff" on public.os_event_staff for all to authenticated
using (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()))
with check (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()));
create policy "staff read own assignments" on public.os_event_staff for select to authenticated
using (lower(email)=lower(coalesce(auth.jwt()->>'email','')));

create policy "staff read event registrations" on public.os_registrations for select to authenticated
using (exists (
  select 1 from public.os_event_staff staff
  where staff.event_id=os_registrations.event_id
    and lower(staff.email)=lower(coalesce(auth.jwt()->>'email',''))
));

create policy "staff read assigned events" on public.os_events for select to authenticated
using (exists (
  select 1 from public.os_event_staff staff
  where staff.event_id=os_events.id
    and lower(staff.email)=lower(coalesce(auth.jwt()->>'email',''))
));
