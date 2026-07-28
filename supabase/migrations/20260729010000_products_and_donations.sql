-- Registration products, variants, inventory, donations, and order fulfillment.

create table if not exists public.os_products (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.os_events(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '',
  fulfillment_type text not null default 'packet_pickup'
    check (fulfillment_type in ('packet_pickup','digital','none')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.os_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.os_products(id) on delete cascade,
  name text not null default 'Standard',
  price_cents integer not null check (price_cents >= 0),
  inventory integer check (inventory is null or inventory >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.os_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.os_orders(id) on delete cascade,
  item_type text not null check (item_type in ('product','donation')),
  variant_id uuid references public.os_product_variants(id) on delete restrict,
  name text not null,
  unit_amount_cents integer not null check (unit_amount_cents >= 0),
  quantity integer not null default 1 check (quantity > 0),
  amount_cents integer not null check (amount_cents >= 0),
  dedication text,
  anonymous boolean not null default false,
  fulfilled_at timestamptz,
  fulfilled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists os_order_items_order_idx on public.os_order_items(order_id);
create index if not exists os_order_items_variant_idx on public.os_order_items(variant_id);

alter table public.os_events
  add column if not exists donations_enabled boolean not null default false,
  add column if not exists fundraising_goal_cents integer check (fundraising_goal_cents is null or fundraising_goal_cents >= 0),
  add column if not exists beneficiary_name text;

alter table public.os_products enable row level security;
alter table public.os_product_variants enable row level security;
alter table public.os_order_items enable row level security;
create policy "products follow event visibility" on public.os_products for select
using (exists (select 1 from public.os_events event where event.id=event_id and (event.status='published' or event.organizer_id=auth.uid())));
create policy "organizers manage products" on public.os_products for all to authenticated
using (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()))
with check (exists (select 1 from public.os_events event where event.id=event_id and event.organizer_id=auth.uid()));
create policy "variants follow product visibility" on public.os_product_variants for select
using (exists (
  select 1 from public.os_products product join public.os_events event on event.id=product.event_id
  where product.id=product_id and (event.status='published' or event.organizer_id=auth.uid())
));
create policy "organizers manage variants" on public.os_product_variants for all to authenticated
using (exists (
  select 1 from public.os_products product join public.os_events event on event.id=product.event_id
  where product.id=product_id and event.organizer_id=auth.uid()
)) with check (exists (
  select 1 from public.os_products product join public.os_events event on event.id=product.event_id
  where product.id=product_id and event.organizer_id=auth.uid()
));
create policy "order items follow order access" on public.os_order_items for select to authenticated
using (exists (
  select 1 from public.os_orders customer_order join public.os_events event on event.id=customer_order.event_id
  where customer_order.id=order_id and (customer_order.purchaser_user_id=auth.uid() or event.organizer_id=auth.uid())
));

create or replace function public.os_add_order_extras(
  p_order_id uuid, p_items jsonb, p_donation_cents integer,
  p_dedication text default null, p_anonymous boolean default false
) returns table(extras_cents integer,total_cents integer)
language plpgsql security definer set search_path=public
as $$
declare
  v_order public.os_orders%rowtype;
  v_item jsonb;
  v_variant public.os_product_variants%rowtype;
  v_product public.os_products%rowtype;
  v_reserved integer;
  v_quantity integer;
  v_extras integer := 0;
begin
  select * into v_order from public.os_orders where id=p_order_id and status='reserved' for update;
  if not found then raise exception 'Order is not available'; end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_quantity := greatest(1,least(10,coalesce((v_item->>'quantity')::integer,1)));
    select * into v_variant from public.os_product_variants where id=(v_item->>'variantId')::uuid for update;
    if not found then raise exception 'Product option was not found'; end if;
    select * into v_product from public.os_products where id=v_variant.product_id and event_id=v_order.event_id and active;
    if not found then raise exception 'Product is not available'; end if;
    if v_variant.inventory is not null then
      select coalesce(sum(item.quantity),0) into v_reserved from public.os_order_items item
      join public.os_orders customer_order on customer_order.id=item.order_id
      where item.variant_id=v_variant.id and customer_order.status in ('reserved','paid','partially_refunded');
      if v_reserved+v_quantity>v_variant.inventory then raise exception '% is sold out',v_product.name; end if;
    end if;
    insert into public.os_order_items(order_id,item_type,variant_id,name,unit_amount_cents,quantity,amount_cents)
    values(v_order.id,'product',v_variant.id,v_product.name||' — '||v_variant.name,v_variant.price_cents,v_quantity,v_variant.price_cents*v_quantity);
    v_extras := v_extras+v_variant.price_cents*v_quantity;
  end loop;
  if coalesce(p_donation_cents,0)>0 then
    insert into public.os_order_items(order_id,item_type,name,unit_amount_cents,quantity,amount_cents,dedication,anonymous)
    values(v_order.id,'donation','Event donation',p_donation_cents,1,p_donation_cents,left(p_dedication,300),coalesce(p_anonymous,false));
    v_extras := v_extras+p_donation_cents;
  end if;
  update public.os_orders as target set total_cents=target.total_cents+v_extras where target.id=v_order.id returning target.* into v_order;
  return query select v_extras,v_order.total_cents;
end;
$$;
revoke all on function public.os_add_order_extras(uuid,jsonb,integer,text,boolean) from public;
grant execute on function public.os_add_order_extras(uuid,jsonb,integer,text,boolean) to service_role;
