-- Discovery region matching never matched real data.
--
-- os_discover_events built its patterns as '%,' || state || '%', which requires
-- the state to follow the comma with no space. Locations are written "Richmond,
-- Virginia" / "Boulder, CO", so both the state-code and full-name branches
-- matched nothing, every row fell through to proximity_rank 2, and choosing a
-- location silently changed no ordering at all.
--
-- Match on the final comma-separated segment instead, compared exactly against
-- either the state code or the full state name. That handles "Richmond,
-- Virginia" and "Boulder, CO" alike, and being an equality test rather than a
-- substring search it also drops a latent false positive: the old ',MO' needle
-- matched ',Montana'.
--
-- Substring search also moves from LIKE to position(), so a query containing
-- % or _ is treated as literal text rather than as a wildcard.

begin;

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
  ), search as (
    select
      nullif(trim(coalesce(p_query,'')),'') as query,
      nullif(upper(trim(coalesce(p_state,''))),'') as state_code,
      nullif(lower(trim(coalesce(p_city,''))),'') as city
  ), target as (
    select
      s.query,s.state_code,s.city,
      lower(s.state_code) as code_match,
      (select l.name from state_lookup l where l.code=s.state_code) as name_match
    from search s
  ), matching as (
    select e.*,
      case
        when t.state_code is null then 2
        -- Compare the final comma-separated segment exactly rather than
        -- searching for a substring: ",MO" would otherwise match ",Montana".
        when lower(trim(regexp_replace(e.location_name,'^.*,',''))) in (t.code_match,t.name_match) then
          case when t.city is not null
            and lower(trim(split_part(e.location_name,',',1))) = t.city
          then 0 else 1 end
        else 2
      end as proximity_rank
    from public.os_events e cross join target t
    where e.status='published' and e.platform_suspended_at is null
      and (
        t.query is null
        or position(lower(t.query) in lower(e.name)) > 0
        or position(lower(t.query) in lower(e.location_name)) > 0
      )
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

revoke all on function public.os_discover_events(text,text,text,integer,integer) from public;
grant execute on function public.os_discover_events(text,text,text,integer,integer) to anon,authenticated;

commit;
