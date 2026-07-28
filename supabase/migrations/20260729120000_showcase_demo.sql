-- Private, disposable feature showcase for organizers.

alter table public.os_events
  add column if not exists is_showcase boolean not null default false;

create unique index if not exists os_events_one_showcase_per_organizer
  on public.os_events(organizer_id) where is_showcase;

create or replace function public.os_create_showcase_event()
returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_user uuid := auth.uid();
  v_event uuid;
  v_10k uuid;
  v_5k uuid;
  v_wave uuid;
  v_product uuid;
  v_role uuid;
  v_registration uuid;
begin
  if v_user is null then raise exception 'Sign in is required'; end if;

  select id into v_event from public.os_events
  where organizer_id=v_user and is_showcase limit 1;
  if found then return v_event; end if;

  insert into public.os_events(
    organizer_id,slug,name,description,starts_at,location_name,status,
    waiver_text,website_published,primary_color,contact_email,
    donations_enabled,fundraising_goal_cents,beneficiary_name,
    registration_mode,lottery_opens_at,lottery_closes_at,lottery_spots,
    qualifier_required,qualifier_instructions,is_showcase
  ) values (
    v_user,'feature-showcase-'||substr(replace(gen_random_uuid()::text,'-',''),1,10),
    'OpenStart Feature Showcase',
    'A private, disposable event populated with sample data so you can explore OpenStart without completing a real setup.',
    now()+interval '90 days','Demo City, USA','draft',
    'Sample waiver: participants acknowledge the ordinary risks of a running event.',
    false,'#0f6b4f',(select email from auth.users where id=v_user),
    true,250000,'Community Running Fund',
    'open',now()-interval '1 day',now()+interval '30 days',75,
    true,'Submit a recent race result for organizer review.',true
  ) returning id into v_event;

  insert into public.os_event_tiers(event_id,name,distance_label,price_cents,capacity,registration_opens_at,registration_closes_at)
  values(v_event,'Showcase 10K','10 kilometers',6500,250,now()-interval '30 days',now()+interval '60 days')
  returning id into v_10k;
  insert into public.os_event_tiers(event_id,name,distance_label,price_cents,capacity,registration_opens_at,registration_closes_at)
  values(v_event,'Community 5K','5 kilometers',3500,400,now()-interval '30 days',now()+interval '60 days')
  returning id into v_5k;

  insert into public.os_event_questions(event_id,label,field_type,options,required,sort_order) values
    (v_event,'What is your shirt size?','select','["XS","S","M","L","XL","XXL"]',true,10),
    (v_event,'Do you have any accessibility needs?','text','[]',false,20);
  insert into public.os_tier_prices(tier_id,name,price_cents,starts_at)
    values(v_10k,'Late registration',7500,now()+interval '30 days');
  insert into public.os_promo_codes(event_id,code,discount_type,discount_value,max_redemptions,active)
    values(v_event,'DEMO10','percent',10,100,true);

  insert into public.os_event_sections(event_id,section_type,title,content,sort_order,published) values
    (v_event,'schedule','Race weekend schedule','Packet pickup: Saturday 2–6 PM\nRace start: Sunday 8 AM',10,true),
    (v_event,'course','Course information','A sample certified loop with two aid stations and pace-friendly corrals.',20,true),
    (v_event,'faq','Frequently asked questions','Parking, bag check, and weather policies would appear here.',30,true);
  insert into public.os_event_sponsors(event_id,name,sponsor_level,sort_order)
    values(v_event,'Sample Running Co.','Presenting sponsor',10);

  insert into public.os_waves(event_id,tier_id,name,starts_at,capacity,sort_order,min_pace_seconds,max_pace_seconds,bib_start,bib_end)
    values(v_event,v_10k,'Wave A',now()+interval '90 days',125,10,300,480,100,299)
    returning id into v_wave;
  insert into public.os_waves(event_id,tier_id,name,starts_at,capacity,sort_order,min_pace_seconds,max_pace_seconds,bib_start,bib_end)
    values(v_event,v_5k,'Community start',now()+interval '90 days 15 minutes',400,20,360,900,500,999);

  insert into public.os_products(event_id,name,description,fulfillment_type,active)
    values(v_event,'Event shirt','Sample merchandise with size inventory.','packet_pickup',true)
    returning id into v_product;
  insert into public.os_product_variants(product_id,name,price_cents,inventory) values
    (v_product,'Small',2500,25),(v_product,'Medium',2500,40),(v_product,'Large',2500,35);

  insert into public.os_volunteer_roles(event_id,name,description,requirements,minimum_age)
    values(v_event,'Aid station crew','Welcome runners and keep water stocked.','Comfortable standing outdoors.',16)
    returning id into v_role;
  insert into public.os_volunteer_shifts(role_id,starts_at,ends_at,location,capacity,instructions)
    values(v_role,now()+interval '90 days',now()+interval '90 days 4 hours','Aid Station 1',12,'Arrive 30 minutes before the first wave.');

  insert into public.os_registrations(
    event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,
    amount_cents,base_amount_cents,registration_source,idempotency_key,bib_number,wave_id
  ) values (
    v_event,v_10k,'Avery','Miles','avery.showcase@example.com','Sample contact',
    'confirmed','not_required',6500,6500,'manual',gen_random_uuid(),'101',v_wave
  ) returning id into v_registration;
  insert into public.os_results(
    event_id,tier_id,registration_id,bib_number,first_name,last_name,division,
    status,gun_time_ms,chip_time_ms,published
  ) values(v_event,v_10k,v_registration,'101','Avery','Miles','Open','finisher',3192000,3168000,false);

  insert into public.os_registrations(
    event_id,tier_id,first_name,last_name,email,emergency_contact,status,payment_status,
    amount_cents,base_amount_cents,registration_source,idempotency_key,bib_number
  ) values
    (v_event,v_5k,'Jordan','Rivera','jordan.showcase@example.com','Sample contact','confirmed','not_required',3500,3500,'manual',gen_random_uuid(),'501'),
    (v_event,v_5k,'Morgan','Lee','morgan.showcase@example.com','Sample contact','confirmed','not_required',3500,3500,'manual',gen_random_uuid(),'502');

  update public.os_event_checklist_items set completed_at=now()
  where event_id=v_event and sort_order in (10,20,30);
  return v_event;
end;
$$;

create or replace function public.os_delete_showcase_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  delete from public.os_events
  where id=p_event_id and organizer_id=auth.uid() and is_showcase;
  if not found then raise exception 'Showcase event was not found'; end if;
end;
$$;

revoke all on function public.os_create_showcase_event() from public,anon;
revoke all on function public.os_delete_showcase_event(uuid) from public,anon;
grant execute on function public.os_create_showcase_event() to authenticated;
grant execute on function public.os_delete_showcase_event(uuid) to authenticated;
