-- Organizer campaigns, templates, delivery tracking, and suppression.

create table if not exists public.os_email_templates (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  html_body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.os_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  html_body text not null,
  audience jsonb not null default '{"type":"confirmed"}'::jsonb,
  message_type text not null default 'transactional' check (message_type in ('transactional','marketing')),
  status text not null default 'draft' check (status in ('draft','scheduled','sending','completed','cancelled','failed')),
  scheduled_at timestamptz,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.os_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.os_campaigns(id) on delete cascade,
  registration_id uuid references public.os_registrations(id) on delete set null,
  email text not null,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','bounced','complained','failed','suppressed')),
  provider_message_id text unique,
  error_message text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(campaign_id,email)
);
create table if not exists public.os_email_suppressions (
  email text primary key,
  reason text not null check (reason in ('unsubscribe','bounce','complaint','manual')),
  created_at timestamptz not null default now()
);
create index if not exists os_campaigns_due_idx on public.os_campaigns(status,scheduled_at);
create index if not exists os_campaign_deliveries_campaign_idx on public.os_campaign_deliveries(campaign_id,status);

alter table public.os_email_templates enable row level security;
alter table public.os_campaigns enable row level security;
alter table public.os_campaign_deliveries enable row level security;
alter table public.os_email_suppressions enable row level security;
create policy "organizers manage templates" on public.os_email_templates for all to authenticated
using (organizer_id=auth.uid()) with check (organizer_id=auth.uid());
create policy "organizers manage campaigns" on public.os_campaigns for all to authenticated
using (organizer_id=auth.uid()) with check (
  organizer_id=auth.uid() and exists (
    select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()
  )
);
create policy "organizers read campaign deliveries" on public.os_campaign_deliveries for select to authenticated
using (exists (select 1 from public.os_campaigns campaign where campaign.id=campaign_id and campaign.organizer_id=auth.uid()));
