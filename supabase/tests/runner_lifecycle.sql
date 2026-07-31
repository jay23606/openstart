-- Runner-lifecycle rules the database owns, mirroring the manual dress
-- rehearsal: abandoned checkouts must release the capacity they held, an
-- accepted transfer must not give one account two entries, and the browser must
-- never be able to call its own unpaid registration confirmed.

begin;

do $$
declare
  v_owner uuid;
  v_second uuid:=gen_random_uuid();
  v_event uuid:=gen_random_uuid();
  v_tier uuid:=gen_random_uuid();
  v_first_reg uuid:=gen_random_uuid();
  v_second_reg uuid:=gen_random_uuid();
  v_counter integer;
  v_expired integer;
  v_blocked boolean:=false;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then raise exception 'A test owner is required'; end if;

  insert into public.os_events(id,organizer_id,slug,name,description,starts_at,location_name,status)
  values(v_event,v_owner,'lifecycle-'||replace(v_event::text,'-',''),'Runner Lifecycle Test',
    'Transactional fixture',now()+interval '45 days','Richmond, Virginia','published');
  insert into public.os_event_tiers(id,event_id,name,distance_label,price_cents,capacity)
  values(v_tier,v_event,'Solo','10 kilometers',2500,1);

  -- An abandoned checkout holds capacity until its reservation lapses.
  insert into public.os_registrations(
    id,event_id,tier_id,first_name,last_name,email,emergency_contact,
    status,payment_status,amount_cents,reservation_expires_at
  ) values(
    v_first_reg,v_event,v_tier,'Abandoned','Runner','abandoned@example.test','Contact',
    'reserved','pending',2500,now()-interval '1 minute'
  );
  select reserved_count into v_counter from public.os_event_tiers where id=v_tier;
  if v_counter<>1 then raise exception 'Reservation did not hold capacity'; end if;

  begin
    insert into public.os_registrations(
      event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents
    ) values(v_event,v_tier,'Blocked','Runner','blocked@example.test','Contact','confirmed','not_required',0);
  exception when others then
    v_blocked:=position('sold out' in lower(sqlerrm))>0;
  end;
  if not v_blocked then raise exception 'A held reservation did not block the last spot'; end if;

  -- Sweeping lapsed reservations must return that capacity to the pool.
  select public.os_expire_reservations() into v_expired;
  if v_expired<1 then raise exception 'Lapsed reservation was not expired'; end if;
  if not exists(select 1 from public.os_registrations
    where id=v_first_reg and status='expired' and payment_status='failed')
  then raise exception 'Expired reservation kept its reserved state'; end if;
  select reserved_count into v_counter from public.os_event_tiers where id=v_tier;
  if v_counter<>0 then raise exception 'Expiry did not release held capacity (counter=%)',v_counter; end if;

  insert into public.os_registrations(
    id,event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents
  ) values(
    v_second_reg,v_event,v_tier,'Waiting','Runner','waiting@example.test','Contact',
    'confirmed','not_required',0
  );

  -- An accepted transfer cannot hand an account a second active entry.
  insert into auth.users(id,email) values(v_second,'waiting@example.test');
  update public.os_registrations set participant_user_id=v_second where id=v_second_reg;

  insert into public.os_event_tiers(id,event_id,name,distance_label,price_cents,capacity)
  values(gen_random_uuid(),v_event,'Second','5 kilometers',0,10);
  v_blocked:=false;
  begin
    -- Re-point a different entry at an account that already holds one.
    insert into public.os_registrations(
      event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents,
      participant_user_id
    ) select v_event,tier.id,'Transferred','Runner','waiting@example.test','Contact',
      'confirmed','not_required',0,v_second
      from public.os_event_tiers tier where tier.event_id=v_event and tier.name='Second';
  exception when others then
    v_blocked:=lower(sqlerrm) like '%already%';
  end;
  if not v_blocked then raise exception 'One account received two active registrations'; end if;

  -- The payment boundary: confirmed always implies paid or not required.
  v_blocked:=false;
  begin
    update public.os_registrations
    set status='confirmed',payment_status='pending'
    where id=v_first_reg;
  exception when others then
    v_blocked:=position('unpaid' in lower(sqlerrm))>0;
  end;
  if not v_blocked then raise exception 'An unpaid registration was confirmed'; end if;
end $$;

rollback;
