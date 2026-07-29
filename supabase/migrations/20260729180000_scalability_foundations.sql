-- Scalability foundations: narrow contention, atomic counters, server-side
-- discovery, worker-safe queues, and hot-path indexes.

begin;

alter table public.os_event_tiers
  add column if not exists reserved_count integer not null default 0
    check (reserved_count >= 0);
alter table public.os_teams
  add column if not exists active_member_count integer not null default 0
    check (active_member_count >= 0);
alter table public.os_waves
  add column if not exists assigned_count integer not null default 0
    check (assigned_count >= 0);
alter table public.os_promo_codes
  add column if not exists redeemed_count integer not null default 0
    check (redeemed_count >= 0);
alter table public.os_volunteer_shifts
  add column if not exists confirmed_count integer not null default 0
    check (confirmed_count >= 0);
alter table public.os_product_variants
  add column if not exists reserved_quantity integer not null default 0
    check (reserved_quantity >= 0);

update public.os_event_tiers tier set reserved_count=(
  select count(*) from public.os_registrations registration
  where registration.tier_id=tier.id
    and registration.status in ('reserved','pending','confirmed','cancel_requested')
);
update public.os_teams team set active_member_count=(
  select count(*) from public.os_registrations registration
  where registration.team_id=team.id
    and registration.status in ('reserved','pending','confirmed','cancel_requested')
);
update public.os_waves wave set assigned_count=(
  select count(*) from public.os_registrations registration
  where registration.wave_id=wave.id
    and registration.status in ('reserved','pending','confirmed','cancel_requested')
);
update public.os_promo_codes promo set redeemed_count=(
  select count(*) from public.os_registrations registration
  where registration.promo_code_id=promo.id
    and registration.status in ('reserved','pending','confirmed')
);
update public.os_volunteer_shifts shift set confirmed_count=(
  select count(*) from public.os_volunteer_signups signup
  where signup.shift_id=shift.id and signup.status in ('confirmed','completed')
);
update public.os_product_variants variant set reserved_quantity=(
  select coalesce(sum(item.quantity),0) from public.os_order_items item
  join public.os_orders customer_order on customer_order.id=item.order_id
  where item.variant_id=variant.id
    and customer_order.status in ('reserved','paid','partially_refunded')
);

create index if not exists os_registrations_tier_active_idx
  on public.os_registrations(tier_id,status,reservation_expires_at);
create index if not exists os_registrations_promo_active_idx
  on public.os_registrations(promo_code_id,status) where promo_code_id is not null;
create index if not exists os_waitlist_tier_status_created_idx
  on public.os_waitlist(tier_id,status,created_at);
create index if not exists os_registrations_event_created_idx
  on public.os_registrations(event_id,created_at desc);
create index if not exists os_registrations_event_payment_idx
  on public.os_registrations(event_id,payment_status,status);
create index if not exists os_registrations_reservation_due_idx
  on public.os_registrations(reservation_expires_at)
  where status='reserved';
create index if not exists os_order_items_variant_idx
  on public.os_order_items(variant_id) where variant_id is not null;
create index if not exists os_campaign_deliveries_claim_idx
  on public.os_campaign_deliveries(campaign_id,status,updated_at);
create index if not exists os_events_public_discovery_idx
  on public.os_events(starts_at,id)
  where status='published' and platform_suspended_at is null;

-- Cascaded child deletes run after the parent event is gone. Preserve their
-- audit records without violating the audit log's optional event foreign key.
create or replace function public.os_capture_audit()
returns trigger language plpgsql security definer set search_path=public,auth
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
  if v_event_id is not null and not exists(select 1 from public.os_events where id=v_event_id) then
    v_event_id:=null;
  end if;
  insert into public.os_audit_log(event_id,actor_id,action,table_name,record_id,old_data,new_data)
  values(v_event_id,auth.uid(),lower(tg_op),tg_table_name,v_row->>'id',v_old,v_new);
  return coalesce(new,old);
end;
$$;

create or replace function public.os_registration_capacity_counters()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  v_old_active boolean:=tg_op<>'INSERT' and old.status in ('reserved','pending','confirmed','cancel_requested');
  v_new_active boolean:=tg_op<>'DELETE' and new.status in ('reserved','pending','confirmed','cancel_requested');
  v_old_promo boolean:=tg_op<>'INSERT' and old.promo_code_id is not null
    and old.status in ('reserved','pending','confirmed');
  v_new_promo boolean:=tg_op<>'DELETE' and new.promo_code_id is not null
    and new.status in ('reserved','pending','confirmed');
begin
  if v_old_active and (
    not v_new_active or old.tier_id is distinct from new.tier_id
  ) then
    update public.os_event_tiers set reserved_count=greatest(0,reserved_count-1) where id=old.tier_id;
  end if;
  if v_new_active and (
    not v_old_active or new.tier_id is distinct from old.tier_id
  ) then
    update public.os_event_tiers
      set reserved_count=reserved_count+1
      where id=new.tier_id and event_id=new.event_id and reserved_count<capacity;
    if not found then raise exception 'This registration option is sold out'; end if;
  end if;

  if v_old_active and old.team_id is not null and (
    not v_new_active or old.team_id is distinct from new.team_id
  ) then
    update public.os_teams set active_member_count=greatest(0,active_member_count-1) where id=old.team_id;
  end if;
  if v_new_active and new.team_id is not null and (
    not v_old_active or new.team_id is distinct from old.team_id
  ) then
    update public.os_teams set active_member_count=active_member_count+1
      where id=new.team_id and event_id=new.event_id
        and (max_members is null or active_member_count<max_members);
    if not found then raise exception 'This team is full'; end if;
  end if;

  if v_old_active and old.wave_id is not null and (
    not v_new_active or old.wave_id is distinct from new.wave_id
  ) then
    update public.os_waves set assigned_count=greatest(0,assigned_count-1) where id=old.wave_id;
  end if;
  if v_new_active and new.wave_id is not null and (
    not v_old_active or new.wave_id is distinct from old.wave_id
  ) then
    update public.os_waves set assigned_count=assigned_count+1
      where id=new.wave_id and event_id=new.event_id and tier_id=new.tier_id
        and assigned_count<capacity;
    if not found then raise exception 'That start wave is full'; end if;
  end if;

  if v_old_promo and (
    not v_new_promo or old.promo_code_id is distinct from new.promo_code_id
  ) then
    update public.os_promo_codes set redeemed_count=greatest(0,redeemed_count-1)
      where id=old.promo_code_id;
  end if;
  if v_new_promo and (
    not v_old_promo or new.promo_code_id is distinct from old.promo_code_id
  ) then
    update public.os_promo_codes set redeemed_count=redeemed_count+1
      where id=new.promo_code_id
        and (max_redemptions is null or redeemed_count<max_redemptions);
    if not found then raise exception 'Promo code has reached its usage limit'; end if;
  end if;
  return coalesce(new,old);
end;
$$;

drop trigger if exists os_20_enforce_tier_capacity on public.os_registrations;
drop trigger if exists os_30_enforce_team_capacity on public.os_registrations;
drop trigger if exists os_capacity_counters on public.os_registrations;
create trigger os_capacity_counters
before insert or update of event_id,tier_id,team_id,wave_id,promo_code_id,status or delete
on public.os_registrations
for each row execute function public.os_registration_capacity_counters();

create or replace function public.os_guard_registration_integrity()
returns trigger language plpgsql security definer set search_path=public,auth
as $$
declare
  v_event public.os_events%rowtype;
  v_user_email text;
begin
  new.email:=left(lower(trim(coalesce(new.email,''))),320);
  if position('@' in new.email)<=1 then raise exception 'A valid participant email is required'; end if;
  select * into v_event from public.os_events where id=new.event_id;
  if not found then raise exception 'Event was not found'; end if;
  if tg_op='INSERT' and v_event.platform_suspended_at is not null then
    raise exception 'Registration is unavailable while this event is suspended';
  end if;
  if not exists(select 1 from public.os_event_tiers where id=new.tier_id and event_id=new.event_id) then
    raise exception 'Registration option does not belong to this event';
  end if;
  if tg_op='INSERT' and new.registration_source='online' and v_event.registration_mode<>'open' then
    raise exception 'This event is not accepting open registration';
  end if;
  if tg_op='INSERT' and new.registration_source='lottery' and (
    v_event.registration_mode<>'lottery' or new.lottery_application_id is null
    or not exists(
      select 1 from public.os_lottery_applications application
      where application.id=new.lottery_application_id and application.event_id=new.event_id
        and application.tier_id=new.tier_id and application.applicant_user_id=new.participant_user_id
        and application.status='selected' and application.invitation_status in ('offered','checkout')
        and application.invitation_expires_at>now()
    )
  ) then raise exception 'A valid lottery invitation is required'; end if;
  if new.status='confirmed' and new.payment_status not in ('paid','not_required') then
    raise exception 'An unpaid registration cannot be confirmed';
  end if;
  if new.participant_user_id is not null
    and (tg_op='INSERT' or new.participant_user_id is distinct from old.participant_user_id or new.email is distinct from old.email) then
    select lower(email) into v_user_email from auth.users where id=new.participant_user_id;
    if v_user_email is null or v_user_email<>new.email then
      raise exception 'Participant account must match the registration email';
    end if;
  end if;
  if new.status in ('reserved','pending','confirmed','cancel_requested') then
    if exists(select 1 from public.os_registrations registration
      where registration.event_id=new.event_id and lower(registration.email)=new.email
        and registration.id<>new.id and registration.status in ('reserved','pending','confirmed','cancel_requested'))
    then raise exception 'This participant is already registered for this event'; end if;
    if new.participant_user_id is not null and exists(select 1 from public.os_registrations registration
      where registration.event_id=new.event_id and registration.participant_user_id=new.participant_user_id
        and registration.id<>new.id and registration.status in ('reserved','pending','confirmed','cancel_requested'))
    then raise exception 'This account already has a registration for this event'; end if;
    update public.os_waitlist set status='registered'
      where event_id=new.event_id and lower(email)=new.email and status in ('waiting','invited');
  end if;
  return new;
end;
$$;

create or replace function public.os_reserve_registration(
  p_event_id uuid,p_tier_id uuid,p_first_name text,p_last_name text,p_email text,
  p_emergency_contact text,p_participant_user_id uuid,p_idempotency_key uuid,
  p_promo_code text default null
) returns table (
  registration_id uuid,amount_cents integer,event_name text,tier_name text,
  stripe_account_id text,platform_fee_bps integer,payment_status text
) language plpgsql security definer set search_path=public
as $$
declare
  v_event public.os_events%rowtype;
  v_tier public.os_event_tiers%rowtype;
  v_profile public.os_profiles%rowtype;
  v_registration public.os_registrations%rowtype;
  v_promo public.os_promo_codes%rowtype;
  v_base integer;
  v_discount integer:=0;
begin
  if p_idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  select * into v_registration from public.os_registrations where idempotency_key=p_idempotency_key;
  if found then
    select * into v_event from public.os_events where id=v_registration.event_id;
    select * into v_tier from public.os_event_tiers where id=v_registration.tier_id;
    select * into v_profile from public.os_profiles where id=v_event.organizer_id;
    return query select v_registration.id,v_registration.amount_cents,v_event.name,
      v_tier.name,v_profile.stripe_account_id,v_event.platform_fee_bps,v_registration.payment_status;
    return;
  end if;
  select * into v_event from public.os_events
    where id=p_event_id and status='published' and platform_suspended_at is null;
  if not found then raise exception 'Event is not open for registration'; end if;
  select * into v_tier from public.os_event_tiers where id=p_tier_id and event_id=p_event_id;
  if not found then raise exception 'Registration option was not found'; end if;
  if v_tier.registration_opens_at is not null and v_tier.registration_opens_at>now() then
    raise exception 'Registration has not opened yet';
  end if;
  if v_tier.registration_closes_at is not null and v_tier.registration_closes_at<=now() then
    raise exception 'Registration is closed';
  end if;
  select coalesce((select price_cents from public.os_tier_prices
    where tier_id=p_tier_id and starts_at<=now() order by starts_at desc limit 1),v_tier.price_cents)
    into v_base;
  if nullif(trim(p_promo_code),'') is not null then
    select * into v_promo from public.os_promo_codes
      where event_id=p_event_id and upper(code)=upper(trim(p_promo_code))
        and active and (starts_at is null or starts_at<=now())
        and (expires_at is null or expires_at>now());
    if not found then raise exception 'Promo code is invalid or expired'; end if;
    v_discount:=case when v_promo.discount_type='percent'
      then round(v_base*least(v_promo.discount_value,10000)/10000.0)
      else least(v_promo.discount_value,v_base) end;
  end if;
  select * into v_profile from public.os_profiles where id=v_event.organizer_id;
  insert into public.os_registrations(
    event_id,tier_id,participant_user_id,first_name,last_name,email,emergency_contact,
    status,payment_status,amount_cents,base_amount_cents,discount_cents,promo_code_id,
    idempotency_key,reservation_expires_at
  ) values (
    p_event_id,p_tier_id,p_participant_user_id,left(trim(p_first_name),100),
    left(trim(p_last_name),100),left(lower(trim(p_email)),320),
    left(trim(p_emergency_contact),300),
    case when v_base-v_discount=0 then 'confirmed' else 'reserved' end,
    case when v_base-v_discount=0 then 'not_required' else 'pending' end,
    v_base-v_discount,v_base,v_discount,v_promo.id,p_idempotency_key,
    case when v_base-v_discount=0 then null else now()+interval '30 minutes' end
  ) returning * into v_registration;
  return query select v_registration.id,v_registration.amount_cents,v_event.name,
    v_tier.name,v_profile.stripe_account_id,v_event.platform_fee_bps,v_registration.payment_status;
end;
$$;

create or replace function public.os_assign_registration_wave(
  p_registration_id uuid,p_wave_id uuid,p_estimated_pace_seconds integer default null
) returns void language plpgsql security definer set search_path=public
as $$
declare v_registration public.os_registrations%rowtype;
begin
  select * into v_registration from public.os_registrations where id=p_registration_id for update;
  if not found then raise exception 'Registration was not found'; end if;
  if not exists(select 1 from public.os_waves where id=p_wave_id
    and event_id=v_registration.event_id and tier_id=v_registration.tier_id)
  then raise exception 'That start wave is not available for this entry'; end if;
  update public.os_registrations set wave_id=p_wave_id,
    estimated_pace_seconds=p_estimated_pace_seconds where id=p_registration_id;
end;
$$;

create or replace function public.os_join_waitlist(
  p_event_id uuid,p_tier_id uuid,p_first_name text,p_last_name text,p_email text
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid; v_email text:=left(lower(trim(coalesce(p_email,''))),320);
begin
  if position('@' in v_email)<=1 then raise exception 'A valid email is required'; end if;
  if not exists(select 1 from public.os_event_tiers tier
    join public.os_events event on event.id=tier.event_id
    where tier.id=p_tier_id and event.id=p_event_id and event.status='published'
      and event.registration_mode='open' and event.platform_suspended_at is null
      and tier.reserved_count>=tier.capacity)
  then raise exception 'Registration is still available'; end if;
  if exists(select 1 from public.os_registrations where event_id=p_event_id
    and lower(email)=v_email and status in ('reserved','pending','confirmed','cancel_requested'))
  then raise exception 'This participant is already registered'; end if;
  insert into public.os_waitlist(event_id,tier_id,first_name,last_name,email)
    values(p_event_id,p_tier_id,left(trim(p_first_name),100),left(trim(p_last_name),100),v_email)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.os_volunteer_capacity_counters()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  v_old boolean:=tg_op<>'INSERT' and old.status in ('confirmed','completed');
  v_new boolean:=tg_op<>'DELETE' and new.status in ('confirmed','completed');
begin
  if v_old and (not v_new or old.shift_id is distinct from new.shift_id) then
    update public.os_volunteer_shifts set confirmed_count=greatest(0,confirmed_count-1)
      where id=old.shift_id;
  end if;
  if v_new and (not v_old or new.shift_id is distinct from old.shift_id) then
    update public.os_volunteer_shifts set confirmed_count=confirmed_count+1
      where id=new.shift_id and confirmed_count<capacity;
    if not found then raise exception 'This volunteer shift is full'; end if;
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists os_volunteer_capacity_counters on public.os_volunteer_signups;
create trigger os_volunteer_capacity_counters
before insert or update of shift_id,status or delete on public.os_volunteer_signups
for each row execute function public.os_volunteer_capacity_counters();

create or replace function public.os_join_volunteer_shift(
  p_shift_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text default '',
  p_emergency_contact text default '',p_notes text default '',p_waiver_accepted boolean default false
) returns table(signup_id uuid,status text)
language plpgsql security definer set search_path=public,auth
as $$
declare
  v_shift public.os_volunteer_shifts%rowtype;
  v_role public.os_volunteer_roles%rowtype;
  v_event public.os_events%rowtype;
  v_status text; v_id uuid;
begin
  select * into v_shift from public.os_volunteer_shifts where id=p_shift_id for update;
  if not found then raise exception 'Volunteer shift was not found'; end if;
  select * into v_role from public.os_volunteer_roles where id=v_shift.role_id;
  select * into v_event from public.os_events where id=v_role.event_id;
  if v_event.status<>'published' or v_event.platform_suspended_at is not null then
    raise exception 'Volunteer signup is not open';
  end if;
  if trim(coalesce(p_first_name,''))='' or trim(coalesce(p_last_name,''))=''
    or position('@' in p_email)=0 then raise exception 'Name and a valid email are required'; end if;
  if v_role.waiver_text<>'' and not p_waiver_accepted then
    raise exception 'The volunteer waiver must be accepted';
  end if;
  v_status:=case when v_shift.confirmed_count<v_shift.capacity then 'confirmed' else 'waitlisted' end;
  insert into public.os_volunteer_signups(
    shift_id,volunteer_user_id,first_name,last_name,email,phone,emergency_contact,
    notes,status,waiver_accepted_at
  ) values (
    p_shift_id,auth.uid(),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),
    trim(coalesce(p_phone,'')),trim(coalesce(p_emergency_contact,'')),trim(coalesce(p_notes,'')),
    v_status,case when p_waiver_accepted then now() else null end
  ) returning id into v_id;
  return query select v_id,v_status;
end;
$$;

create or replace function public.os_order_item_inventory_counters()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  v_old_active boolean:=false; v_new_active boolean:=false;
begin
  if tg_op<>'INSERT' and old.variant_id is not null then
    select status in ('reserved','paid','partially_refunded') into v_old_active
      from public.os_orders where id=old.order_id;
  end if;
  if tg_op<>'DELETE' and new.variant_id is not null then
    select status in ('reserved','paid','partially_refunded') into v_new_active
      from public.os_orders where id=new.order_id;
  end if;
  if v_old_active and (not v_new_active or old.variant_id is distinct from new.variant_id
    or old.quantity is distinct from new.quantity or old.order_id is distinct from new.order_id) then
    update public.os_product_variants
      set reserved_quantity=greatest(0,reserved_quantity-old.quantity) where id=old.variant_id;
  end if;
  if v_new_active and (not v_old_active or new.variant_id is distinct from old.variant_id
    or new.quantity is distinct from old.quantity or new.order_id is distinct from old.order_id) then
    update public.os_product_variants set reserved_quantity=reserved_quantity+new.quantity
      where id=new.variant_id and (inventory is null or reserved_quantity+new.quantity<=inventory);
    if not found then raise exception 'Product option is sold out'; end if;
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists os_order_item_inventory_counters on public.os_order_items;
create trigger os_order_item_inventory_counters
before insert or update of order_id,variant_id,quantity or delete on public.os_order_items
for each row execute function public.os_order_item_inventory_counters();

create or replace function public.os_order_status_inventory_counters()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_item record;
  v_old_active boolean:=old.status in ('reserved','paid','partially_refunded');
  v_new_active boolean:=new.status in ('reserved','paid','partially_refunded');
begin
  if v_old_active=v_new_active then return new; end if;
  for v_item in select variant_id,sum(quantity)::integer quantity
    from public.os_order_items where order_id=new.id and variant_id is not null group by variant_id
  loop
    if v_old_active then
      update public.os_product_variants
        set reserved_quantity=greatest(0,reserved_quantity-v_item.quantity) where id=v_item.variant_id;
    else
      update public.os_product_variants set reserved_quantity=reserved_quantity+v_item.quantity
        where id=v_item.variant_id and (inventory is null or reserved_quantity+v_item.quantity<=inventory);
      if not found then raise exception 'Product option is sold out'; end if;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists os_order_status_inventory_counters on public.os_orders;
create trigger os_order_status_inventory_counters
before update of status on public.os_orders
for each row execute function public.os_order_status_inventory_counters();

create or replace function public.os_add_order_extras(
  p_order_id uuid,p_items jsonb,p_donation_cents integer,
  p_dedication text default null,p_anonymous boolean default false
) returns table(extras_cents integer,total_cents integer)
language plpgsql security definer set search_path=public
as $$
declare
  v_order public.os_orders%rowtype; v_item jsonb;
  v_variant public.os_product_variants%rowtype; v_product public.os_products%rowtype;
  v_quantity integer; v_extras integer:=0;
begin
  select * into v_order from public.os_orders where id=p_order_id and status='reserved' for update;
  if not found then raise exception 'Order is not available'; end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_quantity:=greatest(1,least(10,coalesce((v_item->>'quantity')::integer,1)));
    select * into v_variant from public.os_product_variants where id=(v_item->>'variantId')::uuid;
    if not found then raise exception 'Product option was not found'; end if;
    select * into v_product from public.os_products
      where id=v_variant.product_id and event_id=v_order.event_id and active;
    if not found then raise exception 'Product is not available'; end if;
    insert into public.os_order_items(
      order_id,item_type,variant_id,name,unit_amount_cents,quantity,amount_cents
    ) values (
      v_order.id,'product',v_variant.id,v_product.name||' — '||v_variant.name,
      v_variant.price_cents,v_quantity,v_variant.price_cents*v_quantity
    );
    v_extras:=v_extras+v_variant.price_cents*v_quantity;
  end loop;
  if coalesce(p_donation_cents,0)>0 then
    insert into public.os_order_items(
      order_id,item_type,name,unit_amount_cents,quantity,amount_cents,dedication,anonymous
    ) values (
      v_order.id,'donation','Event donation',p_donation_cents,1,p_donation_cents,
      left(p_dedication,300),coalesce(p_anonymous,false)
    );
    v_extras:=v_extras+p_donation_cents;
  end if;
  update public.os_orders target set total_cents=target.total_cents+v_extras
    where target.id=v_order.id returning target.* into v_order;
  return query select v_extras,v_order.total_cents;
end;
$$;

create or replace function public.os_discover_events(
  p_query text default null,p_state text default null,p_city text default null,
  p_limit integer default 12,p_offset integer default 0
) returns table(event jsonb,total_count bigint)
language sql stable security definer set search_path=public
as $$
  with state_lookup(code,name) as (values
    ('AL','alabama'),('AK','alaska'),('AZ','arizona'),('AR','arkansas'),
    ('CA','california'),('CO','colorado'),('CT','connecticut'),('DE','delaware'),
    ('FL','florida'),('GA','georgia'),('HI','hawaii'),('ID','idaho'),
    ('IL','illinois'),('IN','indiana'),('IA','iowa'),('KS','kansas'),
    ('KY','kentucky'),('LA','louisiana'),('ME','maine'),('MD','maryland'),
    ('MA','massachusetts'),('MI','michigan'),('MN','minnesota'),('MS','mississippi'),
    ('MO','missouri'),('MT','montana'),('NE','nebraska'),('NV','nevada'),
    ('NH','new hampshire'),('NJ','new jersey'),('NM','new mexico'),('NY','new york'),
    ('NC','north carolina'),('ND','north dakota'),('OH','ohio'),('OK','oklahoma'),
    ('OR','oregon'),('PA','pennsylvania'),('RI','rhode island'),('SC','south carolina'),
    ('SD','south dakota'),('TN','tennessee'),('TX','texas'),('UT','utah'),
    ('VT','vermont'),('VA','virginia'),('WA','washington'),('WV','west virginia'),
    ('WI','wisconsin'),('WY','wyoming'),('DC','district of columbia')
  ), matching as (
    select e.*,
      case
        when nullif(trim(p_state),'') is null then 2
        when (upper(e.location_name) like '%,'||upper(trim(p_state))||'%'
          or lower(e.location_name) like '%,'||(select name from state_lookup where code=upper(trim(p_state)))||'%') and
          nullif(trim(p_city),'') is not null and lower(e.location_name) like lower(trim(p_city))||',%' then 0
        when upper(e.location_name) like '%,'||upper(trim(p_state))||'%'
          or lower(e.location_name) like '%,'||(select name from state_lookup where code=upper(trim(p_state)))||'%' then 1
        else 2
      end as proximity_rank
    from public.os_events e
    where e.status='published' and e.platform_suspended_at is null
      and (nullif(trim(p_query),'') is null or e.name ilike '%'||trim(p_query)||'%'
        or e.location_name ilike '%'||trim(p_query)||'%')
  ), counted as (select count(*) total from matching)
  select (
    to_jsonb(m)-'proximity_rank' ||
    jsonb_build_object('os_event_tiers',coalesce((
      select jsonb_agg(to_jsonb(t)||jsonb_build_object('os_tier_prices',coalesce((
        select jsonb_agg(to_jsonb(price) order by price.starts_at)
        from public.os_tier_prices price where price.tier_id=t.id
      ),'[]'::jsonb)) order by t.created_at)
      from public.os_event_tiers t where t.event_id=m.id
    ),'[]'::jsonb))
  ),c.total
  from matching m cross join counted c
  order by m.proximity_rank,m.starts_at,m.id
  limit least(greatest(p_limit,1),50) offset greatest(p_offset,0);
$$;

drop function if exists public.os_organizer_event_metrics();
create function public.os_organizer_event_metrics()
returns table(
  event_id uuid,registration_count bigint,confirmed_count bigint,gross_cents bigint,
  platform_fee_cents bigint,discount_cents bigint,pending_count bigint,
  merchandise_cents bigint,donation_cents bigint
) language sql stable security definer set search_path=public,auth
as $$
  select e.id,count(r.id),
    count(r.id) filter(where r.status='confirmed'),
    coalesce(sum(r.amount_cents) filter(where r.payment_status='paid'),0),
    coalesce(sum(round(r.amount_cents*e.platform_fee_bps/10000.0))
      filter(where r.payment_status='paid'),0),
    coalesce(sum(r.discount_cents) filter(where r.status='confirmed'),0),
    count(r.id) filter(where r.payment_status='pending'),
    (select coalesce(sum(item.amount_cents),0) from public.os_order_items item
      join public.os_orders customer_order on customer_order.id=item.order_id
      where customer_order.event_id=e.id and item.item_type='product'
        and customer_order.status in ('paid','partially_refunded')),
    (select coalesce(sum(item.amount_cents),0) from public.os_order_items item
      join public.os_orders customer_order on customer_order.id=item.order_id
      where customer_order.event_id=e.id and item.item_type='donation'
        and customer_order.status in ('paid','partially_refunded'))
  from public.os_events e left join public.os_registrations r on r.event_id=e.id
  where e.organizer_id=auth.uid()
  group by e.id;
$$;

alter table public.os_campaign_deliveries drop constraint if exists os_campaign_deliveries_status_check;
alter table public.os_campaign_deliveries add constraint os_campaign_deliveries_status_check
  check (status in ('queued','processing','sent','delivered','bounced','complained','failed','suppressed'));

create or replace function public.os_claim_campaign_deliveries(p_campaign_id uuid,p_limit integer default 50)
returns setof public.os_campaign_deliveries
language plpgsql security definer set search_path=public
as $$
begin
  return query
  with claimed as (
    select id from public.os_campaign_deliveries
    where campaign_id=p_campaign_id and (
      status='queued' or (status='processing' and updated_at<now()-interval '10 minutes')
    )
    order by id for update skip locked limit least(greatest(p_limit,1),100)
  )
  update public.os_campaign_deliveries delivery
    set status='processing',updated_at=now()
    from claimed where delivery.id=claimed.id
    returning delivery.*;
end;
$$;

create or replace function public.os_reconcile_capacity_counters(p_repair boolean default false)
returns table(resource text,resource_id uuid,stored_count integer,actual_count bigint,repaired boolean)
language plpgsql security definer set search_path=public
as $$
begin
  return query
  with counts as (
    select tier.id,tier.reserved_count stored,count(registration.id) actual
    from public.os_event_tiers tier left join public.os_registrations registration
      on registration.tier_id=tier.id
      and registration.status in ('reserved','pending','confirmed','cancel_requested')
    group by tier.id,tier.reserved_count
  ), fixed as (
    update public.os_event_tiers tier set reserved_count=counts.actual
      from counts where p_repair and tier.id=counts.id and counts.stored<>counts.actual
      returning tier.id
  )
  select 'tier',counts.id,counts.stored,counts.actual,exists(select 1 from fixed where fixed.id=counts.id)
    from counts where counts.stored<>counts.actual;
end;
$$;

create or replace function public.os_scalability_maintenance()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_expired integer; v_rate_limits integer;
begin
  select public.os_expire_reservations() into v_expired;
  delete from public.os_rate_limits where window_started_at<now()-interval '1 day';
  get diagnostics v_rate_limits=row_count;
  return jsonb_build_object('expired_reservations',v_expired,'rate_limits_removed',v_rate_limits);
end;
$$;

-- Qualify lottery columns so output-column names cannot collide with PL/pgSQL
-- variables when the scheduled expiration worker promotes the next athlete.
create or replace function public.os_process_lottery_expirations()
returns table(application_id uuid,event_id uuid,email text,first_name text,event_name text,invitation_expires_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare
  v_expired record;
  v_promoted public.os_lottery_applications%rowtype;
  v_event public.os_events%rowtype;
begin
  for v_expired in
    select application.* from public.os_lottery_applications application
    where application.status='selected'
      and application.invitation_status in ('offered','checkout')
      and application.invitation_expires_at<=now()
    order by application.invitation_expires_at
    for update skip locked
  loop
    select * into v_event from public.os_events where id=v_expired.event_id for update;
    update public.os_registrations set status='expired',payment_status='failed'
    where lottery_application_id=v_expired.id and status in ('reserved','pending');
    update public.os_lottery_applications set
      status='waitlisted',invitation_status='expired',invitation_expires_at=null,updated_at=now()
    where id=v_expired.id;

    select application.* into v_promoted from public.os_lottery_applications application
    where application.event_id=v_expired.event_id
      and application.status='waitlisted' and application.invitation_status='none'
    order by application.waitlist_position,application.id for update skip locked limit 1;
    if found then
      update public.os_lottery_applications set
        status='selected',invitation_status='offered',invited_at=now(),
        invitation_expires_at=now()+make_interval(hours=>v_event.lottery_invitation_hours),
        updated_at=now()
      where id=v_promoted.id
      returning * into v_promoted;
      return query select v_promoted.id,v_promoted.event_id,v_promoted.email,v_promoted.first_name,
        v_event.name,v_promoted.invitation_expires_at;
    end if;
  end loop;
end;
$$;

create or replace function public.os_platform_scale_metrics()
returns jsonb language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'organizers',(select count(distinct organizer_id) from public.os_events where not is_showcase),
    'events',(select count(*) from public.os_events where not is_showcase),
    'activeEvents',(select count(*) from public.os_events
      where status='published' and platform_suspended_at is null and not is_showcase),
    'suspendedEvents',(select count(*) from public.os_events where platform_suspended_at is not null),
    'registrations',(select count(*) from public.os_registrations),
    'grossCents',(select coalesce(sum(amount_cents),0) from public.os_registrations where payment_status='paid'),
    'feeCents',(select coalesce(sum(round(registration.amount_cents*event.platform_fee_bps/10000.0)),0)
      from public.os_registrations registration join public.os_events event on event.id=registration.event_id
      where registration.payment_status='paid'),
    'failedDeliveries',(select count(*) from public.os_campaign_deliveries
      where status in ('failed','bounced','complained')),
    'failedProviderEvents',(select count(*) from public.os_provider_events where status='failed'),
    'reconciliationAlerts',(select count(*) from public.os_registrations
      where (amount_cents>0 and payment_status='paid' and stripe_payment_intent_id is null)
        or (amount_cents>0 and status='confirmed' and payment_status<>'paid')
        or (payment_status='pending' and created_at<now()-interval '1 hour'))
  );
$$;

revoke all on function public.os_registration_capacity_counters() from public,anon,authenticated;
revoke all on function public.os_volunteer_capacity_counters() from public,anon,authenticated;
revoke all on function public.os_order_item_inventory_counters() from public,anon,authenticated;
revoke all on function public.os_order_status_inventory_counters() from public,anon,authenticated;
revoke all on function public.os_reserve_registration(uuid,uuid,text,text,text,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.os_reserve_registration(uuid,uuid,text,text,text,text,uuid,uuid,text) to service_role;
revoke all on function public.os_assign_registration_wave(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.os_assign_registration_wave(uuid,uuid,integer) to service_role;
revoke all on function public.os_join_waitlist(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.os_join_waitlist(uuid,uuid,text,text,text) to service_role;
revoke all on function public.os_join_volunteer_shift(uuid,text,text,text,text,text,text,boolean) from public;
grant execute on function public.os_join_volunteer_shift(uuid,text,text,text,text,text,text,boolean) to anon,authenticated;
revoke all on function public.os_add_order_extras(uuid,jsonb,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.os_add_order_extras(uuid,jsonb,integer,text,boolean) to service_role;
revoke all on function public.os_discover_events(text,text,text,integer,integer) from public;
grant execute on function public.os_discover_events(text,text,text,integer,integer) to anon,authenticated;
revoke all on function public.os_organizer_event_metrics() from public;
grant execute on function public.os_organizer_event_metrics() to authenticated;
revoke all on function public.os_claim_campaign_deliveries(uuid,integer) from public,anon,authenticated;
grant execute on function public.os_claim_campaign_deliveries(uuid,integer) to service_role;
revoke all on function public.os_reconcile_capacity_counters(boolean) from public,anon,authenticated;
grant execute on function public.os_reconcile_capacity_counters(boolean) to service_role;
revoke all on function public.os_scalability_maintenance() from public,anon,authenticated;
grant execute on function public.os_scalability_maintenance() to service_role;
revoke all on function public.os_platform_scale_metrics() from public,anon,authenticated;
grant execute on function public.os_platform_scale_metrics() to service_role;

commit;
