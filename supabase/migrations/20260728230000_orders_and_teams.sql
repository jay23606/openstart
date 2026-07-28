-- Orders, multi-person checkout, and event teams.

create table if not exists public.os_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  purchaser_user_id uuid references auth.users(id) on delete set null,
  purchaser_email text not null,
  status text not null default 'reserved'
    check (status in ('reserved','paid','cancelled','expired','partially_refunded','refunded')),
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents integer not null default 0,
  idempotency_key uuid not null unique,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.os_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  category text not null default 'club'
    check (category in ('club','corporate','family','relay')),
  captain_user_id uuid references auth.users(id) on delete set null,
  join_code_hash text,
  max_members integer check (max_members is null or max_members > 0),
  created_at timestamptz not null default now()
);
create unique index if not exists os_teams_event_name_unique on public.os_teams(event_id, lower(name));

alter table public.os_registrations
  add column if not exists order_id uuid references public.os_orders(id) on delete set null,
  add column if not exists team_id uuid references public.os_teams(id) on delete set null,
  add column if not exists team_role text check (team_role in ('captain','member')),
  add column if not exists relay_leg text;
create index if not exists os_registrations_order_idx on public.os_registrations(order_id);
create index if not exists os_registrations_team_idx on public.os_registrations(team_id);

alter table public.os_orders enable row level security;
alter table public.os_teams enable row level security;

drop policy if exists "purchasers and organizers read orders" on public.os_orders;
create policy "purchasers and organizers read orders" on public.os_orders for select to authenticated
using (
  purchaser_user_id = auth.uid() or exists (
    select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()
  )
);
drop policy if exists "teams follow event visibility" on public.os_teams;
create policy "teams follow event visibility" on public.os_teams for select
using (exists (
  select 1 from public.os_events event
  where event.id = event_id and (event.status = 'published' or event.organizer_id = auth.uid())
));
drop policy if exists "organizers manage teams" on public.os_teams;
create policy "organizers manage teams" on public.os_teams for all to authenticated
using (exists (select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()))
with check (exists (select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()));
drop policy if exists "captains update teams" on public.os_teams;
create policy "captains update teams" on public.os_teams for update to authenticated
using (captain_user_id = auth.uid()) with check (captain_user_id = auth.uid());

create or replace function public.os_reserve_order(
  p_event_id uuid,
  p_purchaser_user_id uuid,
  p_purchaser_email text,
  p_idempotency_key uuid,
  p_participants jsonb,
  p_promo_code text default null
) returns table (
  order_id uuid, registration_ids uuid[], total_cents integer,
  event_name text, stripe_account_id text, platform_fee_bps integer
) language plpgsql security definer set search_path = public
as $$
declare
  v_order public.os_orders%rowtype;
  v_event public.os_events%rowtype;
  v_profile public.os_profiles%rowtype;
  v_person jsonb;
  v_reserved record;
  v_ids uuid[] := '{}';
  v_subtotal integer := 0;
  v_total integer := 0;
begin
  if jsonb_array_length(coalesce(p_participants,'[]'::jsonb)) < 1
    or jsonb_array_length(p_participants) > 10 then
    raise exception 'An order must contain between 1 and 10 participants';
  end if;
  select * into v_order from public.os_orders where idempotency_key = p_idempotency_key;
  if found then
    select * into v_event from public.os_events where id = v_order.event_id;
    select * into v_profile from public.os_profiles where id = v_event.organizer_id;
    select array_agg(id) into v_ids from public.os_registrations where os_registrations.order_id = v_order.id;
    return query select v_order.id,v_ids,v_order.total_cents,v_event.name,v_profile.stripe_account_id,v_event.platform_fee_bps;
    return;
  end if;
  select * into v_event from public.os_events where id=p_event_id and status='published';
  if not found then raise exception 'Event is not open for registration'; end if;
  select * into v_profile from public.os_profiles where id=v_event.organizer_id;
  insert into public.os_orders(event_id,purchaser_user_id,purchaser_email,idempotency_key)
  values(p_event_id,p_purchaser_user_id,left(lower(trim(p_purchaser_email)),320),p_idempotency_key)
  returning * into v_order;

  for v_person in select * from jsonb_array_elements(p_participants) loop
    select * into v_reserved from public.os_reserve_registration(
      p_event_id,
      (v_person->>'tierId')::uuid,
      v_person->>'firstName',v_person->>'lastName',v_person->>'email',
      v_person->>'emergencyContact',
      case when lower(v_person->>'email')=lower(coalesce(p_purchaser_email,'')) then p_purchaser_user_id else null end,
      (v_person->>'idempotencyKey')::uuid,
      p_promo_code
    );
    update public.os_registrations set order_id=v_order.id where id=v_reserved.registration_id;
    v_ids := array_append(v_ids,v_reserved.registration_id);
    select base_amount_cents,amount_cents into strict v_subtotal,v_total
      from public.os_registrations where id=v_reserved.registration_id;
    update public.os_orders as target set subtotal_cents=target.subtotal_cents+v_subtotal,
      discount_cents=target.discount_cents+(v_subtotal-v_total),total_cents=target.total_cents+v_total
      where target.id=v_order.id returning target.* into v_order;
  end loop;
  return query select v_order.id,v_ids,v_order.total_cents,v_event.name,v_profile.stripe_account_id,v_event.platform_fee_bps;
end;
$$;
revoke all on function public.os_reserve_order(uuid,uuid,text,uuid,jsonb,text) from public;
grant execute on function public.os_reserve_order(uuid,uuid,text,uuid,jsonb,text) to service_role;
