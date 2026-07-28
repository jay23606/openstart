begin;

do $$
declare
  v_owner uuid;
  v_event uuid:=gen_random_uuid();
  v_tier uuid:=gen_random_uuid();
  v_fee integer;
  v_blocked boolean:=false;
begin
  select user_id into v_owner from public.os_platform_admins
  where active and role='owner' limit 1;
  if v_owner is null then raise exception 'Expected an active platform owner'; end if;

  update public.os_platform_settings set default_platform_fee_bps=725 where singleton=true;
  insert into public.os_events(id,organizer_id,slug,name,starts_at,location_name,status)
  values(v_event,v_owner,'platform-test-'||replace(v_event::text,'-',''),'Platform Operations Test',
    now()+interval '30 days','Test City','draft');
  select platform_fee_bps into v_fee from public.os_events where id=v_event;
  if v_fee<>725 then raise exception 'New event did not receive platform fee default'; end if;

  insert into public.os_event_tiers(id,event_id,name,distance_label,price_cents,capacity)
  values(v_tier,v_event,'5K','5 kilometers',1000,20);
  update public.os_events set platform_suspended_at=now(),platform_suspension_reason='Transactional test'
  where id=v_event;
  begin
    insert into public.os_registrations(event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents)
    values(v_event,v_tier,'Test','Runner','platform-test@example.com','Test Contact','pending','pending',1000);
  exception when others then
    v_blocked:=position('suspended' in lower(sqlerrm))>0;
  end;
  if not v_blocked then raise exception 'Suspended event accepted a registration'; end if;
end $$;

rollback;

