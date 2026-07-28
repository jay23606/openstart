-- OpenStart initial schema
-- Apply this file to a new Supabase project, then configure Auth redirect URLs.

create extension if not exists pgcrypto;

create table if not exists public.os_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.os_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '',
  starts_at timestamptz not null,
  location_name text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.os_event_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  name text not null,
  distance_label text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  capacity integer not null check (capacity > 0),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.os_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  tier_id uuid not null references public.os_event_tiers(id) on delete restrict,
  participant_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  emergency_contact text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'refunded', 'failed')),
  payment_reference text,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists os_events_organizer_idx on public.os_events(organizer_id);
create index if not exists os_events_status_starts_idx on public.os_events(status, starts_at);
create index if not exists os_tiers_event_idx on public.os_event_tiers(event_id);
create index if not exists os_registrations_event_idx on public.os_registrations(event_id);
create unique index if not exists os_registration_email_tier_unique
  on public.os_registrations(tier_id, lower(email))
  where status <> 'cancelled';

alter table public.os_profiles enable row level security;
alter table public.os_events enable row level security;
alter table public.os_event_tiers enable row level security;
alter table public.os_registrations enable row level security;

create policy "profiles are self readable"
  on public.os_profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles are self editable"
  on public.os_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "published events are public"
  on public.os_events for select
  using (status = 'published' or organizer_id = auth.uid());
create policy "organizers create events"
  on public.os_events for insert to authenticated
  with check (organizer_id = auth.uid());
create policy "organizers update events"
  on public.os_events for update to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "organizers delete events"
  on public.os_events for delete to authenticated
  using (organizer_id = auth.uid());

create policy "tiers follow event visibility"
  on public.os_event_tiers for select
  using (exists (
    select 1 from public.os_events event
    where event.id = event_id
      and (event.status = 'published' or event.organizer_id = auth.uid())
  ));
create policy "organizers manage tiers"
  on public.os_event_tiers for all to authenticated
  using (exists (
    select 1 from public.os_events event
    where event.id = event_id and event.organizer_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.os_events event
    where event.id = event_id and event.organizer_id = auth.uid()
  ));

create policy "participants create registrations"
  on public.os_registrations for insert
  with check (
    status = 'pending'
    and payment_status in ('not_required', 'pending')
    and exists (
      select 1
      from public.os_events event
      join public.os_event_tiers tier on tier.event_id = event.id
      where event.id = event_id and tier.id = tier_id and event.status = 'published'
    )
  );
create policy "participants read own registrations"
  on public.os_registrations for select to authenticated
  using (
    participant_user_id = auth.uid()
    or exists (
      select 1 from public.os_events event
      where event.id = event_id and event.organizer_id = auth.uid()
    )
  );
create policy "organizers update registrations"
  on public.os_registrations for update to authenticated
  using (exists (
    select 1 from public.os_events event
    where event.id = event_id and event.organizer_id = auth.uid()
  ));

-- Payment status must ultimately be updated by a server-side function using the
-- service role after verifying a provider webhook. Never trust the browser.
