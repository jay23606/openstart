begin;

do $$
declare
  v_user uuid;
  v_event uuid;
  v_tier uuid;
  v_application uuid;
  v_draw uuid;
  v_duplicate_blocked boolean:=false;
begin
  select organizer_id into v_user from public.os_events limit 1;
  if v_user is null then raise exception 'An organizer fixture is required'; end if;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  insert into public.os_events(
    organizer_id,slug,name,description,starts_at,location_name,status,
    registration_mode,lottery_opens_at,lottery_closes_at,lottery_spots,lottery_invitation_hours
  ) values(
    v_user,'lottery-integrity-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),
    'Lottery Integrity Test','Transactional lottery lifecycle test event.',
    now()+interval '60 days','Test City','published','lottery',
    now()-interval '2 days',now()-interval '1 day',1,24
  ) returning id into v_event;
  insert into public.os_event_tiers(event_id,name,distance_label,price_cents,capacity)
  values(v_event,'Test 5K','5 kilometers',0,10) returning id into v_tier;
  insert into public.os_lottery_applications(
    event_id,applicant_user_id,tier_id,first_name,last_name,email,status
  ) values(v_event,v_user,v_tier,'Lottery','Runner','lottery-integrity@example.com','qualified')
  returning id into v_application;

  v_draw:=public.os_run_lottery_draw(v_event);
  if v_draw is null then raise exception 'Draw was not created'; end if;
  if not exists(select 1 from public.os_lottery_draw_entries where draw_id=v_draw and application_id=v_application and selected) then
    raise exception 'Qualified application was not selected';
  end if;
  if not exists(select 1 from public.os_lottery_applications where id=v_application and status='selected' and invitation_status='offered') then
    raise exception 'Selected application did not receive an offer';
  end if;
  begin
    perform public.os_run_lottery_draw(v_event);
  exception when others then
    v_duplicate_blocked:=true;
  end;
  if not v_duplicate_blocked then raise exception 'Finalized draw was rerun'; end if;
end;
$$;

rollback;
