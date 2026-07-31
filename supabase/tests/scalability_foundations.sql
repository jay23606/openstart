begin;

do $$
declare
  v_owner uuid;
  v_event uuid:=gen_random_uuid();
  v_tier_a uuid:=gen_random_uuid();
  v_tier_b uuid:=gen_random_uuid();
  v_campaign uuid:=gen_random_uuid();
  v_counter integer;
  v_blocked boolean:=false;
  v_claimed integer;
  v_discovered integer;
  v_first text;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then raise exception 'A test owner is required'; end if;
  insert into public.os_events(id,organizer_id,slug,name,description,starts_at,location_name,status)
  values(v_event,v_owner,'scale-'||replace(v_event::text,'-',''),'Scalability Test Event',
    'Transactional fixture',now()+interval '60 days','Richmond, VA','published');
  insert into public.os_event_tiers(id,event_id,name,distance_label,price_cents,capacity)
  values
    (v_tier_a,v_event,'A','5K',0,2),
    (v_tier_b,v_event,'B','10K',0,2);

  insert into public.os_registrations(event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents)
  values
    (v_event,v_tier_a,'One','Runner','scale-one@example.com','Contact','confirmed','not_required',0),
    (v_event,v_tier_a,'Two','Runner','scale-two@example.com','Contact','confirmed','not_required',0);
  select reserved_count into v_counter from public.os_event_tiers where id=v_tier_a;
  if v_counter<>2 then raise exception 'Tier counter did not increment atomically'; end if;
  begin
    insert into public.os_registrations(event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents)
    values(v_event,v_tier_a,'Three','Runner','scale-three@example.com','Contact','confirmed','not_required',0);
  exception when others then
    v_blocked:=position('sold out' in lower(sqlerrm))>0;
  end;
  if not v_blocked then raise exception 'Capacity overflow was not rejected'; end if;

  update public.os_registrations set status='cancelled'
    where event_id=v_event and email='scale-one@example.com';
  insert into public.os_registrations(event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents)
  values(v_event,v_tier_a,'Three','Runner','scale-three@example.com','Contact','confirmed','not_required',0);
  select reserved_count into v_counter from public.os_event_tiers where id=v_tier_a;
  if v_counter<>2 then raise exception 'Released capacity was not reused'; end if;

  -- A different tier has an independent counter/lock domain.
  insert into public.os_registrations(event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,amount_cents)
  values(v_event,v_tier_b,'Four','Runner','scale-four@example.com','Contact','confirmed','not_required',0);
  select reserved_count into v_counter from public.os_event_tiers where id=v_tier_b;
  if v_counter<>1 then raise exception 'Independent tier counter failed'; end if;

  select count(*) into v_discovered from public.os_discover_events('Scalability','VA','Richmond',1,0);
  if v_discovered<>1 then raise exception 'Server-side discovery did not return its bounded page'; end if;

  -- Bounded paging alone passed even while region matching matched nothing, so
  -- assert the ranking itself. The control event starts soonest and matches no
  -- queried state, so it wins on date alone: each assertion below can only pass
  -- if region ranking actually outranks the date ordering. Both the full-name
  -- and state-code spellings are covered, because organizers write either form.
  insert into public.os_events(id,organizer_id,slug,name,description,starts_at,location_name,status)
  values
    (gen_random_uuid(),v_owner,'rankprobe-ctl-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),
      'RankProbe Control','Ranking fixture',now()+interval '5 days','Boise, Idaho','published'),
    (gen_random_uuid(),v_owner,'rankprobe-name-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),
      'RankProbe FullName','Ranking fixture',now()+interval '10 days','Roanoke, Virginia','published'),
    (gen_random_uuid(),v_owner,'rankprobe-code-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),
      'RankProbe Code','Ranking fixture',now()+interval '20 days','Austin, TX','published');

  select d.event->>'location_name' into v_first
  from public.os_discover_events('RankProbe','VA',null,5,0) d limit 1;
  if v_first is distinct from 'Roanoke, Virginia' then
    raise exception 'Full-name region ranking failed (got %)',coalesce(v_first,'<none>');
  end if;

  select d.event->>'location_name' into v_first
  from public.os_discover_events('RankProbe','TX',null,5,0) d limit 1;
  if v_first is distinct from 'Austin, TX' then
    raise exception 'State-code region ranking failed (got %)',coalesce(v_first,'<none>');
  end if;

  -- ',MO' must not match ',Montana': an unrelated state ranks nothing.
  select d.event->>'location_name' into v_first
  from public.os_discover_events('RankProbe','MO',null,5,0) d limit 1;
  if v_first is distinct from 'Boise, Idaho' then
    raise exception 'Unmatched state should fall back to date order (got %)',coalesce(v_first,'<none>');
  end if;

  insert into public.os_campaigns(id,event_id,organizer_id,name,subject,html_body,status,scheduled_at)
  values(v_campaign,v_event,v_owner,'Scale campaign','Subject','Body','sending',now());
  insert into public.os_campaign_deliveries(campaign_id,email,status)
  values(v_campaign,'scale-mail-1@example.com','queued'),(v_campaign,'scale-mail-2@example.com','queued');
  select count(*) into v_claimed from public.os_claim_campaign_deliveries(v_campaign,1);
  if v_claimed<>1 then raise exception 'Worker did not claim exactly one delivery'; end if;
  if (select count(*) from public.os_campaign_deliveries where campaign_id=v_campaign and status='processing')<>1
  then raise exception 'Claimed delivery was not marked processing'; end if;

  if exists(select 1 from public.os_reconcile_capacity_counters(false))
  then raise exception 'Capacity reconciliation found drift after normal mutations'; end if;
  if position('for update' in lower(pg_get_functiondef('public.os_guard_registration_integrity()'::regprocedure)))>0
  then raise exception 'Registration guard still takes an event-wide lock'; end if;
end $$;

rollback;

