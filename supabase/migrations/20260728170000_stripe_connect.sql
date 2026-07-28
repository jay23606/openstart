-- Stripe Connect, atomic capacity reservations, and idempotent payment state.

alter table public.os_profiles
  add column if not exists stripe_account_id text unique,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled boolean not null default false;

alter table public.os_events
  add column if not exists platform_fee_bps integer not null default 500
    check (platform_fee_bps between 0 and 10000);

alter table public.os_registrations
  drop constraint if exists os_registrations_status_check;

alter table public.os_registrations
  add constraint os_registrations_status_check
    check (status in ('reserved', 'pending', 'confirmed', 'cancelled', 'expired')),
  add column if not exists idempotency_key uuid unique,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id text;

drop policy if exists "participants create registrations" on public.os_registrations;

create or replace function public.os_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.os_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists os_auth_user_created on auth.users;
create trigger os_auth_user_created
  after insert on auth.users
  for each row execute function public.os_create_profile();

insert into public.os_profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (id) do nothing;

create or replace function public.os_reserve_registration(
  p_event_id uuid,
  p_tier_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_emergency_contact text,
  p_participant_user_id uuid,
  p_idempotency_key uuid
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.os_events%rowtype;
  v_tier public.os_event_tiers%rowtype;
  v_profile public.os_profiles%rowtype;
  v_registration public.os_registrations%rowtype;
  v_reserved integer;
begin
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required';
  end if;

  select * into v_registration
  from public.os_registrations
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_event from public.os_events where id = v_registration.event_id;
    select * into v_tier from public.os_event_tiers where id = v_registration.tier_id;
    select * into v_profile from public.os_profiles where id = v_event.organizer_id;
    return query select
      v_registration.id,
      v_registration.amount_cents,
      v_event.name,
      v_tier.name,
      v_profile.stripe_account_id,
      v_event.platform_fee_bps,
      v_registration.payment_status;
    return;
  end if;

  select * into v_event
  from public.os_events
  where id = p_event_id and status = 'published'
  for update;
  if not found then raise exception 'Event is not open for registration'; end if;

  select * into v_tier
  from public.os_event_tiers
  where id = p_tier_id and event_id = p_event_id;
  if not found then raise exception 'Registration option was not found'; end if;

  select count(*) into v_reserved
  from public.os_registrations
  where tier_id = p_tier_id
    and (
      status in ('pending', 'confirmed')
      or (status = 'reserved' and reservation_expires_at > now())
    );

  if v_reserved >= v_tier.capacity then
    raise exception 'This registration option is sold out';
  end if;

  select * into v_profile
  from public.os_profiles
  where id = v_event.organizer_id;

  insert into public.os_registrations (
    event_id, tier_id, participant_user_id, first_name, last_name, email,
    emergency_contact, status, payment_status, amount_cents, idempotency_key,
    reservation_expires_at
  ) values (
    p_event_id,
    p_tier_id,
    p_participant_user_id,
    left(trim(p_first_name), 100),
    left(trim(p_last_name), 100),
    left(lower(trim(p_email)), 320),
    left(trim(p_emergency_contact), 300),
    case when v_tier.price_cents = 0 then 'confirmed' else 'reserved' end,
    case when v_tier.price_cents = 0 then 'not_required' else 'pending' end,
    v_tier.price_cents,
    p_idempotency_key,
    case when v_tier.price_cents = 0 then null else now() + interval '30 minutes' end
  )
  returning * into v_registration;

  return query select
    v_registration.id,
    v_tier.price_cents,
    v_event.name,
    v_tier.name,
    v_profile.stripe_account_id,
    v_event.platform_fee_bps,
    v_registration.payment_status;
end;
$$;

revoke all on function public.os_reserve_registration(
  uuid, uuid, text, text, text, text, uuid, uuid
) from public;
grant execute on function public.os_reserve_registration(
  uuid, uuid, text, text, text, text, uuid, uuid
) to service_role;

create or replace function public.os_expire_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.os_registrations
  set status = 'expired'
  where status = 'reserved' and reservation_expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.os_expire_reservations() from public;
