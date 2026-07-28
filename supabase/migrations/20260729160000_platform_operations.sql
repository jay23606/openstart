-- Private platform operations, incident controls, and provider reconciliation.

create table if not exists public.os_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'support' check (role in ('owner','finance','support')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.os_platform_settings (
  singleton boolean primary key default true check (singleton),
  default_platform_fee_bps integer not null default 500
    check (default_platform_fee_bps between 0 and 2500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.os_platform_settings(singleton) values(true) on conflict(singleton) do nothing;

alter table public.os_events
  add column if not exists platform_suspended_at timestamptz,
  add column if not exists platform_suspension_reason text;

create table if not exists public.os_platform_support_notes (
  id bigint generated always as identity primary key,
  organizer_id uuid references auth.users(id) on delete cascade,
  event_id uuid references public.os_events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now(),
  check (organizer_id is not null or event_id is not null)
);
create index if not exists os_platform_support_notes_created_idx
  on public.os_platform_support_notes(created_at desc);

create table if not exists public.os_provider_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('stripe','resend','system')),
  provider_event_id text,
  event_type text not null,
  status text not null check (status in ('processing','processed','ignored','failed')),
  related_id text,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,provider_event_id)
);
create index if not exists os_provider_events_status_received_idx
  on public.os_provider_events(status,received_at desc);

alter table public.os_platform_admins enable row level security;
alter table public.os_platform_settings enable row level security;
alter table public.os_platform_support_notes enable row level security;
alter table public.os_provider_events enable row level security;

revoke all on public.os_platform_admins from anon,authenticated;
revoke all on public.os_platform_settings from anon,authenticated;
revoke all on public.os_platform_support_notes from anon,authenticated;
revoke all on public.os_provider_events from anon,authenticated;

drop policy if exists "published events are public" on public.os_events;
create policy "published events are public"
  on public.os_events for select
  using (
    (status='published' and platform_suspended_at is null)
    or organizer_id=auth.uid()
  );

create or replace function public.os_apply_platform_event_defaults()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  select default_platform_fee_bps into new.platform_fee_bps
  from public.os_platform_settings where singleton=true;
  return new;
end;
$$;
drop trigger if exists os_apply_platform_event_defaults on public.os_events;
create trigger os_apply_platform_event_defaults
before insert on public.os_events
for each row execute function public.os_apply_platform_event_defaults();

create or replace function public.os_block_suspended_event_registration()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if exists (
    select 1 from public.os_events
    where id=new.event_id and platform_suspended_at is not null
  ) then
    raise exception 'Registration is unavailable while this event is suspended';
  end if;
  return new;
end;
$$;
drop trigger if exists os_block_suspended_event_registration on public.os_registrations;
create trigger os_block_suspended_event_registration
before insert or update of event_id on public.os_registrations
for each row execute function public.os_block_suspended_event_registration();

create or replace function public.os_capture_platform_operation()
returns trigger language plpgsql security definer set search_path=public,auth
as $$
declare v_row jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.os_audit_log(event_id,actor_id,action,table_name,record_id,old_data,new_data)
  values(
    case when v_row ? 'event_id' then (v_row->>'event_id')::uuid else null end,
    auth.uid(),lower(tg_op),tg_table_name,coalesce(v_row->>'id',v_row->>'user_id'),
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new,old);
end;
$$;

drop trigger if exists os_platform_settings_audit on public.os_platform_settings;
create trigger os_platform_settings_audit after update on public.os_platform_settings
for each row execute function public.os_capture_platform_operation();
drop trigger if exists os_platform_notes_audit on public.os_platform_support_notes;
create trigger os_platform_notes_audit after insert or delete on public.os_platform_support_notes
for each row execute function public.os_capture_platform_operation();

revoke all on function public.os_apply_platform_event_defaults() from public,anon,authenticated;
revoke all on function public.os_block_suspended_event_registration() from public,anon,authenticated;
revoke all on function public.os_capture_platform_operation() from public,anon,authenticated;

