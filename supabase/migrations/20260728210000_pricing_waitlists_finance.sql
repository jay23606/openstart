-- Scheduled pricing, promotion codes, waitlists, and auditable registration totals.

create table if not exists public.os_tier_prices (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.os_event_tiers(id) on delete cascade,
  name text not null default 'Scheduled price',
  price_cents integer not null check (price_cents >= 0),
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tier_id, starts_at)
);

create table if not exists public.os_promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('fixed', 'percent')),
  discount_value integer not null check (discount_value > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists os_promo_codes_event_code_unique
  on public.os_promo_codes(event_id, upper(code));

create table if not exists public.os_waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  tier_id uuid not null references public.os_event_tiers(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'invited', 'registered', 'removed')),
  created_at timestamptz not null default now(),
  invited_at timestamptz
);
create unique index if not exists os_waitlist_email_tier_unique
  on public.os_waitlist(tier_id, lower(email))
  where status in ('waiting', 'invited');

alter table public.os_registrations
  add column if not exists base_amount_cents integer not null default 0,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists promo_code_id uuid references public.os_promo_codes(id) on delete set null,
  add column if not exists stripe_fee_cents integer;

update public.os_registrations
set base_amount_cents = amount_cents
where base_amount_cents = 0 and amount_cents > 0;

alter table public.os_tier_prices enable row level security;
alter table public.os_promo_codes enable row level security;
alter table public.os_waitlist enable row level security;

create policy "scheduled prices follow tier visibility" on public.os_tier_prices for select
using (exists (
  select 1 from public.os_event_tiers tier join public.os_events event on event.id = tier.event_id
  where tier.id = tier_id and (event.status = 'published' or event.organizer_id = auth.uid())
));
create policy "organizers manage scheduled prices" on public.os_tier_prices for all to authenticated
using (exists (
  select 1 from public.os_event_tiers tier join public.os_events event on event.id = tier.event_id
  where tier.id = tier_id and event.organizer_id = auth.uid()
)) with check (exists (
  select 1 from public.os_event_tiers tier join public.os_events event on event.id = tier.event_id
  where tier.id = tier_id and event.organizer_id = auth.uid()
));

create policy "organizers read promo codes" on public.os_promo_codes for select to authenticated
using (exists (select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()));
create policy "organizers manage promo codes" on public.os_promo_codes for all to authenticated
using (exists (select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()))
with check (exists (select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()));

create policy "organizers manage waitlists" on public.os_waitlist for all to authenticated
using (exists (select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()))
with check (exists (select 1 from public.os_events event where event.id = event_id and event.organizer_id = auth.uid()));

create or replace function public.os_reserve_registration(
  p_event_id uuid,
  p_tier_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_emergency_contact text,
  p_participant_user_id uuid,
  p_idempotency_key uuid,
  p_promo_code text default null
)
returns table (
  registration_id uuid,
  amount_cents integer,
  event_name text,
  tier_name text,
  stripe_account_id text,
  platform_fee_bps integer,
  payment_status text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.os_events%rowtype;
  v_tier public.os_event_tiers%rowtype;
  v_profile public.os_profiles%rowtype;
  v_registration public.os_registrations%rowtype;
  v_promo public.os_promo_codes%rowtype;
  v_reserved integer;
  v_base integer;
  v_discount integer := 0;
  v_redemptions integer;
begin
  if p_idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  select * into v_registration from public.os_registrations where idempotency_key = p_idempotency_key;
  if found then
    select * into v_event from public.os_events where id = v_registration.event_id;
    select * into v_tier from public.os_event_tiers where id = v_registration.tier_id;
    select * into v_profile from public.os_profiles where id = v_event.organizer_id;
    return query select v_registration.id, v_registration.amount_cents, v_event.name,
      v_tier.name, v_profile.stripe_account_id, v_event.platform_fee_bps, v_registration.payment_status;
    return;
  end if;

  select * into v_event from public.os_events
  where id = p_event_id and status = 'published' for update;
  if not found then raise exception 'Event is not open for registration'; end if;
  select * into v_tier from public.os_event_tiers
  where id = p_tier_id and event_id = p_event_id;
  if not found then raise exception 'Registration option was not found'; end if;
  if v_tier.registration_opens_at is not null and v_tier.registration_opens_at > now() then
    raise exception 'Registration has not opened yet';
  end if;
  if v_tier.registration_closes_at is not null and v_tier.registration_closes_at <= now() then
    raise exception 'Registration is closed';
  end if;

  select count(*) into v_reserved from public.os_registrations
  where tier_id = p_tier_id and (
    status in ('pending', 'confirmed') or (status = 'reserved' and reservation_expires_at > now())
  );
  if v_reserved >= v_tier.capacity then raise exception 'SOLD_OUT'; end if;

  select coalesce((
    select price_cents from public.os_tier_prices
    where tier_id = p_tier_id and starts_at <= now()
    order by starts_at desc limit 1
  ), v_tier.price_cents) into v_base;

  if nullif(trim(p_promo_code), '') is not null then
    select * into v_promo from public.os_promo_codes
    where event_id = p_event_id and upper(code) = upper(trim(p_promo_code))
      and active and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at > now())
    for update;
    if not found then raise exception 'Promo code is invalid or expired'; end if;
    select count(*) into v_redemptions from public.os_registrations
    where promo_code_id = v_promo.id and status in ('reserved', 'pending', 'confirmed');
    if v_promo.max_redemptions is not null and v_redemptions >= v_promo.max_redemptions then
      raise exception 'Promo code has reached its usage limit';
    end if;
    v_discount := case when v_promo.discount_type = 'percent'
      then round(v_base * least(v_promo.discount_value, 10000) / 10000.0)
      else least(v_promo.discount_value, v_base) end;
  end if;

  select * into v_profile from public.os_profiles where id = v_event.organizer_id;
  insert into public.os_registrations (
    event_id, tier_id, participant_user_id, first_name, last_name, email,
    emergency_contact, status, payment_status, amount_cents, base_amount_cents,
    discount_cents, promo_code_id, idempotency_key, reservation_expires_at
  ) values (
    p_event_id, p_tier_id, p_participant_user_id, left(trim(p_first_name),100),
    left(trim(p_last_name),100), left(lower(trim(p_email)),320),
    left(trim(p_emergency_contact),300),
    case when v_base - v_discount = 0 then 'confirmed' else 'reserved' end,
    case when v_base - v_discount = 0 then 'not_required' else 'pending' end,
    v_base - v_discount, v_base, v_discount, v_promo.id, p_idempotency_key,
    case when v_base - v_discount = 0 then null else now() + interval '30 minutes' end
  ) returning * into v_registration;

  return query select v_registration.id, v_registration.amount_cents, v_event.name,
    v_tier.name, v_profile.stripe_account_id, v_event.platform_fee_bps, v_registration.payment_status;
end;
$$;
revoke all on function public.os_reserve_registration(uuid,uuid,text,text,text,text,uuid,uuid,text) from public;
grant execute on function public.os_reserve_registration(uuid,uuid,text,text,text,text,uuid,uuid,text) to service_role;

create or replace function public.os_join_waitlist(
  p_event_id uuid, p_tier_id uuid, p_first_name text, p_last_name text, p_email text
) returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.os_event_tiers tier join public.os_events event on event.id = tier.event_id
    where tier.id = p_tier_id and event.id = p_event_id and event.status = 'published'
  ) then raise exception 'Event is not available'; end if;
  insert into public.os_waitlist(event_id,tier_id,first_name,last_name,email)
  values (p_event_id,p_tier_id,left(trim(p_first_name),100),left(trim(p_last_name),100),left(lower(trim(p_email)),320))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.os_join_waitlist(uuid,uuid,text,text,text) from public;
grant execute on function public.os_join_waitlist(uuid,uuid,text,text,text) to service_role;
