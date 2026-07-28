-- Runner self-service, transfers, refunds, and an immutable registration audit trail.

alter table public.os_events
  add column if not exists participant_edits_close_at timestamptz,
  add column if not exists transfers_close_at timestamptz,
  add column if not exists refunds_close_at timestamptz,
  add column if not exists allow_transfers boolean not null default true,
  add column if not exists allow_refund_requests boolean not null default true;

alter table public.os_registrations drop constraint if exists os_registrations_status_check;
alter table public.os_registrations add constraint os_registrations_status_check
  check (status in ('reserved','pending','confirmed','cancel_requested','cancelled','expired'));

alter table public.os_registrations
  add column if not exists transfer_token uuid unique,
  add column if not exists transfer_expires_at timestamptz,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists stripe_refund_id text unique;

create table if not exists public.os_registration_activity (
  id bigint generated always as identity primary key,
  registration_id uuid not null references public.os_registrations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists os_registration_activity_registration_idx
  on public.os_registration_activity(registration_id, created_at desc);
alter table public.os_registration_activity enable row level security;

create policy "registration activity follows registration access"
on public.os_registration_activity for select to authenticated
using (exists (
  select 1 from public.os_registrations registration
  join public.os_events event on event.id = registration.event_id
  where registration.id = registration_id
    and (registration.participant_user_id = auth.uid() or event.organizer_id = auth.uid())
));

create or replace function public.os_log_registration_activity(
  p_registration_id uuid, p_actor_user_id uuid, p_action text, p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public
as $$
  insert into public.os_registration_activity(registration_id,actor_user_id,action,details)
  values(p_registration_id,p_actor_user_id,left(p_action,80),coalesce(p_details,'{}'::jsonb));
$$;
revoke all on function public.os_log_registration_activity(uuid,uuid,text,jsonb) from public;
grant execute on function public.os_log_registration_activity(uuid,uuid,text,jsonb) to service_role;
