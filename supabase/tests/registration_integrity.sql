begin;

do $$
declare
  v_event_id uuid;
  v_tier_id uuid;
  v_duplicate_blocked boolean:=false;
  v_mode_blocked boolean:=false;
  v_waitlist_blocked boolean:=false;
begin
  select event.id,tier.id into v_event_id,v_tier_id
  from public.os_events event
  join public.os_event_tiers tier on tier.event_id=event.id
  where event.status='published'
  limit 1;
  if v_event_id is null then raise exception 'A published test event is required'; end if;

  insert into public.os_registrations(
    event_id,tier_id,first_name,last_name,email,emergency_contact,status,
    payment_status,amount_cents,registration_source,idempotency_key
  ) values (
    v_event_id,v_tier_id,'Integrity','Runner','INTEGRITY-TEST@EXAMPLE.COM',
    'Test contact','confirmed','not_required',0,'manual',gen_random_uuid()
  );
  if not exists(
    select 1 from public.os_registrations
    where event_id=v_event_id and email='integrity-test@example.com'
  ) then raise exception 'Registration email was not normalized'; end if;

  begin
    insert into public.os_registrations(
      event_id,tier_id,first_name,last_name,email,emergency_contact,status,
      payment_status,amount_cents,registration_source,idempotency_key
    ) values (
      v_event_id,v_tier_id,'Duplicate','Runner','integrity-test@example.com',
      'Test contact','confirmed','not_required',0,'manual',gen_random_uuid()
    );
  exception when others then
    v_duplicate_blocked:=true;
  end;
  if not v_duplicate_blocked then raise exception 'Duplicate registration was accepted'; end if;

  begin
    perform public.os_join_waitlist(
      v_event_id,v_tier_id,'Integrity','Runner','integrity-test@example.com'
    );
  exception when others then
    v_waitlist_blocked:=true;
  end;
  if not v_waitlist_blocked then raise exception 'Registered participant joined the waitlist'; end if;

  update public.os_events set registration_mode='lottery' where id=v_event_id;
  begin
    insert into public.os_registrations(
      event_id,tier_id,first_name,last_name,email,emergency_contact,status,
      payment_status,amount_cents,registration_source,idempotency_key
    ) values (
      v_event_id,v_tier_id,'Mode','Runner','mode-test@example.com',
      'Test contact','reserved','pending',100,'online',gen_random_uuid()
    );
  exception when others then
    v_mode_blocked:=true;
  end;
  if not v_mode_blocked then raise exception 'Open registration was accepted in lottery mode'; end if;
end;
$$;

rollback;
