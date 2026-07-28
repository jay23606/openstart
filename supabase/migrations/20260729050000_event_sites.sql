alter table public.os_events
  add column if not exists logo_url text,
  add column if not exists banner_url text,
  add column if not exists primary_color text not null default '#0f6b4f',
  add column if not exists contact_email text,
  add column if not exists website_published boolean not null default false;

create table if not exists public.os_event_sections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  section_type text not null default 'text'
    check (section_type in ('text','schedule','location','course','packet_pickup','faq','downloads')),
  title text not null,
  content text not null default '',
  link_url text,
  link_label text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.os_event_sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  name text not null,
  logo_url text,
  website_url text,
  sponsor_level text not null default 'Sponsor',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists os_event_sections_order_idx on public.os_event_sections(event_id,sort_order);
create index if not exists os_event_sponsors_order_idx on public.os_event_sponsors(event_id,sort_order);
alter table public.os_event_sections enable row level security;
alter table public.os_event_sponsors enable row level security;

create policy "published event sections are public" on public.os_event_sections for select
using (
  published and exists (
    select 1 from public.os_events event
    where event.id=event_id and event.status='published' and event.website_published
  )
);
create policy "organizers manage event sections" on public.os_event_sections for all to authenticated
using (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()))
with check (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()));

create policy "published event sponsors are public" on public.os_event_sponsors for select
using (exists (
  select 1 from public.os_events event
  where event.id=event_id and event.status='published' and event.website_published
));
create policy "organizers manage event sponsors" on public.os_event_sponsors for all to authenticated
using (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()))
with check (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('os-event-assets','os-event-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml','application/pdf'])
on conflict(id) do update set public=true,file_size_limit=5242880,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "event assets are public" on storage.objects for select
using (bucket_id='os-event-assets');
create policy "organizers upload event assets" on storage.objects for insert to authenticated
with check (
  bucket_id='os-event-assets'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (
    select 1 from public.os_events event
    where event.id::text=(storage.foldername(name))[2] and event.organizer_id=auth.uid()
  )
);
create policy "organizers update event assets" on storage.objects for update to authenticated
using (bucket_id='os-event-assets' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='os-event-assets' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "organizers delete event assets" on storage.objects for delete to authenticated
using (bucket_id='os-event-assets' and (storage.foldername(name))[1]=auth.uid()::text);
