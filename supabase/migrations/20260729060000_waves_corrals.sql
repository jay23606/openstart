create table if not exists public.os_waves (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  tier_id uuid not null references public.os_event_tiers(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  sort_order integer not null default 0,
  self_select boolean not null default true,
  selection_closes_at timestamptz,
  min_pace_seconds integer check (min_pace_seconds is null or min_pace_seconds > 0),
  max_pace_seconds integer check (max_pace_seconds is null or max_pace_seconds > 0),
  bib_start integer check (bib_start is null or bib_start > 0),
  bib_end integer check (bib_end is null or bib_end >= bib_start),
  gun_started_at timestamptz,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.os_registrations
  add column if not exists wave_id uuid references public.os_waves(id) on delete set null,
  add column if not exists estimated_pace_seconds integer check (estimated_pace_seconds is null or estimated_pace_seconds > 0);

alter table public.os_results
  add column if not exists wave_id uuid references public.os_waves(id) on delete set null;

create index if not exists os_waves_event_order_idx on public.os_waves(event_id,tier_id,sort_order);
create index if not exists os_registrations_wave_idx on public.os_registrations(wave_id);
alter table public.os_waves enable row level security;

create policy "published waves are public" on public.os_waves for select
using (published and exists (
  select 1 from public.os_events event where event.id=event_id and event.status='published'
));
create policy "organizers manage waves" on public.os_waves for all to authenticated
using (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()))
with check (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()));

create or replace function public.os_assign_registration_wave(
  p_registration_id uuid,
  p_wave_id uuid,
  p_estimated_pace_seconds integer default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_registration public.os_registrations%rowtype;
  v_wave public.os_waves%rowtype;
  v_count integer;
begin
  select * into v_registration from public.os_registrations where id=p_registration_id for update;
  if not found then raise exception 'Registration was not found'; end if;
  select * into v_wave from public.os_waves where id=p_wave_id and event_id=v_registration.event_id and tier_id=v_registration.tier_id for update;
  if not found then raise exception 'That start wave is not available for this entry'; end if;
  select count(*) into v_count from public.os_registrations
    where wave_id=p_wave_id and id<>p_registration_id and status in ('reserved','pending','confirmed');
  if v_count>=v_wave.capacity then raise exception 'That start wave is full'; end if;
  update public.os_registrations set wave_id=p_wave_id,estimated_pace_seconds=p_estimated_pace_seconds
    where id=p_registration_id;
end;
$$;
revoke all on function public.os_assign_registration_wave(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.os_assign_registration_wave(uuid,uuid,integer) to service_role;
