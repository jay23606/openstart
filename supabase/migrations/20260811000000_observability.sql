-- Privacy-safe operational telemetry. Raw browser payloads never reach tables;
-- the ingestion Edge Function normalizes and redacts them first.

create table if not exists public.os_observability_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('browser','edge','health')),
  severity text not null check (severity in ('info','warning','error','fatal')),
  fingerprint text not null,
  message text not null,
  route text not null default '/',
  release text not null default 'unknown',
  environment text not null default 'production',
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create index if not exists os_observability_recent_idx
  on public.os_observability_events(received_at desc);
create index if not exists os_observability_fingerprint_idx
  on public.os_observability_events(fingerprint,received_at desc);

alter table public.os_observability_events enable row level security;
revoke all on public.os_observability_events from anon,authenticated;

create or replace function public.os_prune_observability_events(p_retention_days integer default 30)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  delete from public.os_observability_events
  where received_at < now() - make_interval(days=>greatest(7,least(coalesce(p_retention_days,30),365)));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.os_prune_observability_events(integer) from public,anon,authenticated;
