create table if not exists public.os_audit_log (
  id bigint generated always as identity primary key,
  event_id uuid references public.os_events(id) on delete set null,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists os_audit_log_event_created_idx on public.os_audit_log(event_id,created_at desc);
alter table public.os_audit_log enable row level security;
create policy "organizers read event audit log" on public.os_audit_log for select to authenticated
using (
  actor_id=auth.uid() or exists (
    select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()
  )
);

create or replace function public.os_capture_audit()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_old jsonb:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_new jsonb:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_row jsonb:=coalesce(v_new,v_old);
  v_event_id uuid;
begin
  if tg_table_name='os_events' then v_event_id:=(v_row->>'id')::uuid;
  elsif v_row ? 'event_id' then v_event_id:=(v_row->>'event_id')::uuid;
  elsif tg_table_name='os_volunteer_signups' then
    select role.event_id into v_event_id
    from public.os_volunteer_shifts shift join public.os_volunteer_roles role on role.id=shift.role_id
    where shift.id=(v_row->>'shift_id')::uuid;
  end if;
  insert into public.os_audit_log(event_id,actor_id,action,table_name,record_id,old_data,new_data)
  values(v_event_id,auth.uid(),lower(tg_op),tg_table_name,v_row->>'id',v_old,v_new);
  return coalesce(new,old);
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['os_events','os_registrations','os_results','os_campaigns','os_volunteer_signups','os_waves']
  loop
    execute format('drop trigger if exists os_audit_changes on public.%I',v_table);
    execute format('create trigger os_audit_changes after insert or update or delete on public.%I for each row execute function public.os_capture_audit()',v_table);
  end loop;
end $$;

create table if not exists public.os_rate_limits (
  scope_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null
);
alter table public.os_rate_limits enable row level security;

create or replace function public.os_check_rate_limit(
  p_scope_key text,p_limit integer,p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  insert into public.os_rate_limits(scope_key,window_started_at,request_count)
  values(p_scope_key,now(),1)
  on conflict(scope_key) do update set
    window_started_at=case when public.os_rate_limits.window_started_at < now()-make_interval(secs=>p_window_seconds) then now() else public.os_rate_limits.window_started_at end,
    request_count=case when public.os_rate_limits.window_started_at < now()-make_interval(secs=>p_window_seconds) then 1 else public.os_rate_limits.request_count+1 end
  returning request_count into v_count;
  return v_count<=p_limit;
end;
$$;
revoke all on function public.os_check_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.os_check_rate_limit(text,integer,integer) to service_role;
