-- Public athlete profiles: opt-in runner pages that aggregate a runner's
-- published results across every event, with per-race placement.
--
-- Only runners who create a profile (and keep it public) are exposed, and only
-- their already-public results. Cross-event linkage uses
-- os_registrations.participant_user_id, which is not itself publicly readable,
-- so the aggregation runs through a security-definer function rather than a view.

create table if not exists public.os_athlete_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique
    check (handle ~ '^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$'),
  display_name text not null default '' check (char_length(display_name) <= 80),
  location text not null default '' check (char_length(location) <= 80),
  bio text not null default '' check (char_length(bio) <= 400),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.os_athlete_profiles enable row level security;

-- Owners fully manage their own row (including while private).
drop policy if exists "athletes manage own profile" on public.os_athlete_profiles;
create policy "athletes manage own profile" on public.os_athlete_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Anyone may resolve a public profile by handle (name/location/bio only).
drop policy if exists "public athlete profiles are readable" on public.os_athlete_profiles;
create policy "public athlete profiles are readable" on public.os_athlete_profiles
  for select
  using (is_public);

-- Aggregated, public race history for one athlete handle. Placement is computed
-- across all published finishers in each event+tier, then joined back to the
-- athlete's own results (finishers get a place; DNF/DNS/DQ return null place).
create or replace function public.os_athlete_results(p_handle text)
returns table (
  event_id uuid,
  event_slug text,
  event_name text,
  starts_at timestamptz,
  location_name text,
  tier_name text,
  distance_label text,
  division text,
  status text,
  chip_time_ms bigint,
  gun_time_ms bigint,
  overall_place integer,
  division_place integer,
  tier_finishers integer
)
language sql
stable
security definer
set search_path = public
as $$
  with athlete as (
    select user_id
    from public.os_athlete_profiles
    where handle = lower(p_handle) and is_public
  ),
  athlete_regs as (
    select reg.id as registration_id
    from public.os_registrations reg
    join athlete on athlete.user_id = reg.participant_user_id
  ),
  finisher_ranks as (
    select
      r.id as result_id,
      rank() over (
        partition by r.event_id, r.tier_id
        order by coalesce(r.chip_time_ms, r.gun_time_ms)
      ) as overall_place,
      rank() over (
        partition by r.event_id, r.tier_id, coalesce(r.division, '')
        order by coalesce(r.chip_time_ms, r.gun_time_ms)
      ) as division_place,
      count(*) over (partition by r.event_id, r.tier_id) as tier_finishers
    from public.os_results r
    join public.os_events e on e.id = r.event_id
    where r.published
      and r.status = 'finisher'
      and e.results_published_at is not null
      and coalesce(r.chip_time_ms, r.gun_time_ms) is not null
  )
  select
    e.id, e.slug, e.name, e.starts_at, e.location_name,
    t.name, t.distance_label, res.division, res.status,
    res.chip_time_ms, res.gun_time_ms,
    fr.overall_place::int, fr.division_place::int, fr.tier_finishers::int
  from athlete_regs ar
  join public.os_results res on res.registration_id = ar.registration_id
  join public.os_events e on e.id = res.event_id
  join public.os_event_tiers t on t.id = res.tier_id
  left join finisher_ranks fr on fr.result_id = res.id
  where res.published and e.results_published_at is not null
  order by e.starts_at desc;
$$;

revoke all on function public.os_athlete_results(text) from public;
grant execute on function public.os_athlete_results(text) to anon, authenticated;
