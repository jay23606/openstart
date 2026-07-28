-- Server-authoritative event readiness and publishing.

create or replace function public.os_event_readiness(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_event public.os_events%rowtype;
  v_tiers integer;
  v_paid boolean;
  v_stripe boolean;
  v_basics boolean;
  v_schedule boolean;
  v_lottery boolean;
  v_ready boolean;
begin
  select * into v_event from public.os_events
  where id=p_event_id and organizer_id=auth.uid();
  if not found then raise exception 'Event was not found'; end if;

  select count(*),coalesce(bool_or(price_cents>0),false)
  into v_tiers,v_paid from public.os_event_tiers where event_id=v_event.id;
  select coalesce(stripe_charges_enabled and stripe_payouts_enabled,false)
  into v_stripe from public.os_profiles where id=v_event.organizer_id;

  v_basics := char_length(trim(v_event.name))>=3
    and char_length(trim(v_event.description))>=10
    and char_length(trim(v_event.location_name))>=2;
  v_schedule := v_event.starts_at>now();
  v_lottery := v_event.registration_mode<>'lottery' or (
    v_event.lottery_spots is not null
    and v_event.lottery_opens_at is not null
    and v_event.lottery_closes_at is not null
    and v_event.lottery_opens_at<v_event.lottery_closes_at
  );
  v_ready := v_basics and v_schedule and v_tiers>0 and (not v_paid or v_stripe)
    and v_lottery and not v_event.is_showcase;

  return jsonb_build_object(
    'ready',v_ready,
    'items',jsonb_build_array(
      jsonb_build_object('key','basics','label','Event details','required',true,'complete',v_basics,'detail','Add a name, location, and useful description.'),
      jsonb_build_object('key','schedule','label','Future event date','required',true,'complete',v_schedule,'detail','Choose a date and time in the future.'),
      jsonb_build_object('key','tiers','label','Registration option','required',true,'complete',v_tiers>0,'detail','Add at least one distance or registration option.'),
      jsonb_build_object('key','payments','label','Payment account','required',v_paid,'complete',not v_paid or v_stripe,'detail',case when v_paid then 'Paid registration requires Stripe charges and payouts.' else 'Not required for an entirely free event.' end),
      jsonb_build_object('key','lottery','label','Lottery configuration','required',v_event.registration_mode='lottery','complete',v_lottery,'detail','Lottery events need an application window and available spots.'),
      jsonb_build_object('key','waiver','label','Participant waiver','required',false,'complete',char_length(trim(v_event.waiver_text))>0,'detail','Recommended before accepting registrations.'),
      jsonb_build_object('key','website','label','Event website content','required',false,'complete',exists(select 1 from public.os_event_sections where event_id=v_event.id),'detail','Add schedule, course, parking, or FAQ information.'),
      jsonb_build_object('key','operations','label','Operational planning','required',false,'complete',exists(select 1 from public.os_event_checklist_items where event_id=v_event.id and completed_at is not null),'detail','Use the readiness checklist to prepare race day.')
    )
  );
end;
$$;

create or replace function public.os_enforce_event_publish_readiness()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_paid boolean;
  v_stripe boolean;
begin
  if new.status='published' and old.status is distinct from 'published' then
    if new.is_showcase then raise exception 'Showcase events cannot be published'; end if;
    if char_length(trim(new.description))<10 or char_length(trim(new.location_name))<2 then
      raise exception 'Complete the event details before publishing';
    end if;
    if new.starts_at<=now() then raise exception 'The event date must be in the future'; end if;
    if not exists(select 1 from public.os_event_tiers where event_id=new.id) then
      raise exception 'Add a registration option before publishing';
    end if;
    if new.registration_mode='lottery' and (
      new.lottery_spots is null or new.lottery_opens_at is null or new.lottery_closes_at is null
      or new.lottery_opens_at>=new.lottery_closes_at
    ) then raise exception 'Complete the lottery configuration before publishing'; end if;
    select coalesce(bool_or(price_cents>0),false) into v_paid
    from public.os_event_tiers where event_id=new.id;
    select coalesce(stripe_charges_enabled and stripe_payouts_enabled,false) into v_stripe
    from public.os_profiles where id=new.organizer_id;
    if v_paid and not v_stripe then
      raise exception 'Finish Stripe setup before publishing a paid event';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists os_enforce_event_publish_readiness on public.os_events;
create trigger os_enforce_event_publish_readiness
before update on public.os_events
for each row execute function public.os_enforce_event_publish_readiness();

create or replace function public.os_publish_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_readiness jsonb;
begin
  v_readiness := public.os_event_readiness(p_event_id);
  if not coalesce((v_readiness->>'ready')::boolean,false) then
    raise exception 'Complete the required setup items before publishing';
  end if;
  update public.os_events set status='published',updated_at=now()
  where id=p_event_id and organizer_id=auth.uid();
  return v_readiness;
end;
$$;

create or replace function public.os_unpublish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  update public.os_events set status='draft',updated_at=now()
  where id=p_event_id and organizer_id=auth.uid() and not is_showcase;
  if not found then raise exception 'Event was not found'; end if;
end;
$$;

revoke all on function public.os_event_readiness(uuid) from public,anon;
revoke all on function public.os_publish_event(uuid) from public,anon;
revoke all on function public.os_unpublish_event(uuid) from public,anon;
revoke all on function public.os_enforce_event_publish_readiness() from public,anon,authenticated;
grant execute on function public.os_event_readiness(uuid) to authenticated;
grant execute on function public.os_publish_event(uuid) to authenticated;
grant execute on function public.os_unpublish_event(uuid) to authenticated;
