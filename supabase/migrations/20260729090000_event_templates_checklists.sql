-- Organizer operations: reusable event duplication and readiness checklists.

create table if not exists public.os_event_checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  category text not null default 'operations'
    check (category in ('planning','registration','course','volunteers','communications','race_day','post_event','operations')),
  due_at timestamptz,
  completed_at timestamptz,
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,title)
);

create index if not exists os_event_checklist_event_idx
  on public.os_event_checklist_items(event_id,completed_at,due_at,sort_order);

alter table public.os_event_checklist_items enable row level security;

create policy "organizers manage event checklists"
  on public.os_event_checklist_items for all to authenticated
  using (exists (
    select 1 from public.os_events event
    where event.id=event_id and event.organizer_id=auth.uid()
  ))
  with check (exists (
    select 1 from public.os_events event
    where event.id=event_id and event.organizer_id=auth.uid()
  ));

create or replace function public.os_seed_event_checklist()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.os_event_checklist_items(event_id,title,category,due_at,sort_order)
  values
    (new.id,'Confirm permits and insurance','planning',new.starts_at-interval '120 days',10),
    (new.id,'Publish registration and event website','registration',new.starts_at-interval '100 days',20),
    (new.id,'Confirm course and aid-station plan','course',new.starts_at-interval '60 days',30),
    (new.id,'Open volunteer shifts','volunteers',new.starts_at-interval '45 days',40),
    (new.id,'Send participant race guide','communications',new.starts_at-interval '7 days',50),
    (new.id,'Assign bibs and prepare check-in','race_day',new.starts_at-interval '3 days',60),
    (new.id,'Confirm timing and emergency contacts','race_day',new.starts_at-interval '1 day',70),
    (new.id,'Publish official results','post_event',new.starts_at+interval '1 day',80),
    (new.id,'Close financials and send follow-up','post_event',new.starts_at+interval '7 days',90)
  on conflict(event_id,title) do nothing;
  return new;
end;
$$;

drop trigger if exists os_seed_event_checklist on public.os_events;
create trigger os_seed_event_checklist
after insert on public.os_events
for each row execute function public.os_seed_event_checklist();

revoke all on function public.os_seed_event_checklist() from public,anon,authenticated;

insert into public.os_event_checklist_items(event_id,title,category,due_at,sort_order)
select event.id,item.title,item.category,event.starts_at+item.offset_value,item.sort_order
from public.os_events event
cross join (values
  ('Confirm permits and insurance','planning'::text,interval '-120 days',10),
  ('Publish registration and event website','registration',interval '-100 days',20),
  ('Confirm course and aid-station plan','course',interval '-60 days',30),
  ('Open volunteer shifts','volunteers',interval '-45 days',40),
  ('Send participant race guide','communications',interval '-7 days',50),
  ('Assign bibs and prepare check-in','race_day',interval '-3 days',60),
  ('Confirm timing and emergency contacts','race_day',interval '-1 day',70),
  ('Publish official results','post_event',interval '1 day',80),
  ('Close financials and send follow-up','post_event',interval '7 days',90)
) as item(title,category,offset_value,sort_order)
on conflict(event_id,title) do nothing;

create or replace function public.os_duplicate_event(
  p_source_event_id uuid,
  p_name text,
  p_starts_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_source public.os_events%rowtype;
  v_new_event_id uuid;
  v_delta interval;
  v_product record;
  v_new_product_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if char_length(trim(p_name)) not between 3 and 120 then raise exception 'Event name must be between 3 and 120 characters'; end if;
  select * into v_source from public.os_events
  where id=p_source_event_id and organizer_id=auth.uid();
  if not found then raise exception 'Source event was not found'; end if;
  v_delta:=p_starts_at-v_source.starts_at;

  insert into public.os_events(
    organizer_id,slug,name,description,starts_at,location_name,status,
    waiver_text,platform_fee_bps,participant_edits_close_at,transfers_close_at,
    refunds_close_at,allow_transfers,allow_refund_requests,logo_url,banner_url,
    primary_color,contact_email,website_published,donations_enabled,
    fundraising_goal_cents,beneficiary_name
  ) values (
    auth.uid(),
    trim(both '-' from regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g'))||'-'||substr(gen_random_uuid()::text,1,6),
    trim(p_name),v_source.description,p_starts_at,v_source.location_name,'draft',
    v_source.waiver_text,v_source.platform_fee_bps,
    case when v_source.participant_edits_close_at is null then null else v_source.participant_edits_close_at+v_delta end,
    case when v_source.transfers_close_at is null then null else v_source.transfers_close_at+v_delta end,
    case when v_source.refunds_close_at is null then null else v_source.refunds_close_at+v_delta end,
    v_source.allow_transfers,v_source.allow_refund_requests,v_source.logo_url,v_source.banner_url,
    v_source.primary_color,v_source.contact_email,false,v_source.donations_enabled,
    v_source.fundraising_goal_cents,v_source.beneficiary_name
  ) returning id into v_new_event_id;

  insert into public.os_event_tiers(event_id,name,distance_label,price_cents,capacity,registration_opens_at,registration_closes_at)
  select v_new_event_id,name,distance_label,price_cents,capacity,
    case when registration_opens_at is null then null else registration_opens_at+v_delta end,
    case when registration_closes_at is null then null else registration_closes_at+v_delta end
  from public.os_event_tiers where event_id=p_source_event_id;

  insert into public.os_event_questions(event_id,label,field_type,options,required,sort_order)
  select v_new_event_id,label,field_type,options,required,sort_order
  from public.os_event_questions where event_id=p_source_event_id;

  insert into public.os_event_sections(event_id,section_type,title,content,link_url,link_label,sort_order,published)
  select v_new_event_id,section_type,title,content,link_url,link_label,sort_order,published
  from public.os_event_sections where event_id=p_source_event_id;

  insert into public.os_event_sponsors(event_id,name,logo_url,website_url,sponsor_level,sort_order)
  select v_new_event_id,name,logo_url,website_url,sponsor_level,sort_order
  from public.os_event_sponsors where event_id=p_source_event_id;

  for v_product in select * from public.os_products where event_id=p_source_event_id loop
    insert into public.os_products(event_id,name,description,fulfillment_type,active)
    values(v_new_event_id,v_product.name,v_product.description,v_product.fulfillment_type,v_product.active)
    returning id into v_new_product_id;
    insert into public.os_product_variants(product_id,name,price_cents,inventory)
    select v_new_product_id,name,price_cents,inventory
    from public.os_product_variants where product_id=v_product.id;
  end loop;

  return v_new_event_id;
end;
$$;

revoke all on function public.os_duplicate_event(uuid,text,timestamptz) from public,anon;
grant execute on function public.os_duplicate_event(uuid,text,timestamptz) to authenticated;

drop trigger if exists os_audit_changes on public.os_event_checklist_items;
create trigger os_audit_changes
after insert or update or delete on public.os_event_checklist_items
for each row execute function public.os_capture_audit();
