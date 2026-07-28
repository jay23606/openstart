create table if not exists public.os_series (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text not null default '',
  logo_url text,
  banner_url text,
  primary_color text not null default '#0f6b4f',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  minimum_events integer not null default 1 check (minimum_events > 0),
  points_schedule jsonb not null default '[100,90,80,70,60,50,45,40,35,30]'::jsonb,
  participation_points integer not null default 5 check (participation_points >= 0),
  tie_breaker text not null default 'most_wins'
    check (tie_breaker in ('most_wins','best_finish','most_events')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.os_series_events (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.os_series(id) on delete cascade,
  event_id uuid not null references public.os_events(id) on delete cascade,
  points_multiplier numeric(6,2) not null default 1 check (points_multiplier > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(series_id,event_id)
);

create index if not exists os_series_organizer_idx on public.os_series(organizer_id);
create index if not exists os_series_events_order_idx on public.os_series_events(series_id,sort_order);
alter table public.os_series enable row level security;
alter table public.os_series_events enable row level security;

create policy "published series are public" on public.os_series for select
using (status='published' or organizer_id=auth.uid());
create policy "organizers manage series" on public.os_series for all to authenticated
using (organizer_id=auth.uid()) with check (organizer_id=auth.uid());

create policy "series events follow series visibility" on public.os_series_events for select
using (exists (
  select 1 from public.os_series series
  where series.id=series_id and (series.status='published' or series.organizer_id=auth.uid())
));
create policy "organizers manage series events" on public.os_series_events for all to authenticated
using (exists (select 1 from public.os_series series where series.id=series_id and series.organizer_id=auth.uid()))
with check (
  exists (select 1 from public.os_series series where series.id=series_id and series.organizer_id=auth.uid())
  and exists (
    select 1 from public.os_events event
    join public.os_series series on series.id=series_id
    where event.id=event_id and event.organizer_id=auth.uid()
  )
);

