alter table public.os_events
  add column if not exists results_published_at timestamptz;

create table if not exists public.os_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  tier_id uuid not null references public.os_event_tiers(id) on delete cascade,
  registration_id uuid not null unique references public.os_registrations(id) on delete cascade,
  bib_number text,
  first_name text not null,
  last_name text not null,
  division text,
  status text not null default 'finisher'
    check (status in ('finisher','dnf','dns','dq')),
  gun_time_ms bigint check (gun_time_ms is null or gun_time_ms >= 0),
  chip_time_ms bigint check (chip_time_ms is null or chip_time_ms >= 0),
  splits jsonb not null default '[]'::jsonb,
  note text not null default '',
  published boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists os_results_event_tier_idx
  on public.os_results(event_id,tier_id,status,chip_time_ms);

alter table public.os_results enable row level security;

create policy "published results are public"
on public.os_results for select
using (
  published and exists (
    select 1 from public.os_events event
    where event.id=event_id and event.results_published_at is not null
  )
);

create policy "organizers manage results"
on public.os_results for all to authenticated
using (
  exists (
    select 1 from public.os_events event
    where event.id=event_id and event.organizer_id=auth.uid()
  )
)
with check (
  exists (
    select 1 from public.os_events event
    where event.id=event_id and event.organizer_id=auth.uid()
  )
);

create policy "runners read own results"
on public.os_results for select to authenticated
using (
  exists (
    select 1 from public.os_registrations registration
    where registration.id=registration_id
      and registration.participant_user_id=auth.uid()
  )
);
