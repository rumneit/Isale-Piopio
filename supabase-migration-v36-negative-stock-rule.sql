-- ============================================================================
-- PioPio v36 — Configurable negative-stock sales
-- Run AFTER v35 and BEFORE deploying the matching frontend.
-- Safe to re-run. Missing allow_negative_stock means FALSE (fail closed).
-- ============================================================================

-- Shop members may read operating settings, but only the owner may change them.
-- This protects inventory rules from direct API calls by staff accounts.
alter table public.settings enable row level security;
drop policy if exists "shop member all" on public.settings;
drop policy if exists "settings member read" on public.settings;
drop policy if exists "settings owner insert" on public.settings;
drop policy if exists "settings owner update" on public.settings;
drop policy if exists "settings owner delete" on public.settings;
create policy "settings member read" on public.settings for select
  using (public.is_shop_member(shop_id));
create policy "settings owner insert" on public.settings for insert
  with check (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));
create policy "settings owner update" on public.settings for update
  using (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()))
  with check (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));
create policy "settings owner delete" on public.settings for delete
  using (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));

-- Lock product rows and reject overselling unless the owner explicitly enabled it.
-- p_items is an array of {product_id, qty}; duplicate products are aggregated.
create or replace function public._inv_assert_sale_stock(p_shop uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_name text;
  v_stock numeric;
  v_allow boolean;
begin
  select exists(
    select 1 from public.settings st
    where st.shop_id=p_shop and st.key='allow_negative_stock'
      and lower(trim(st.value)) in ('true','1','yes','on')
  ) into v_allow;
  if v_allow then return; end if;

  perform public._inv_lock_products(p_items);
  for r in
    select (x->>'product_id')::uuid as product_id,
           sum(coalesce(nullif(x->>'qty','')::numeric, 0)) as requested
    from jsonb_array_elements(
      case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end
    ) x
    where coalesce(x->>'product_id','') <> ''
    group by 1
    order by 1
  loop
    select pr.name, pr.stock into v_name, v_stock
    from public.products pr
    where pr.id=r.product_id and pr.shop_id=p_shop;
    if not found then
      raise exception 'Sản phẩm không thuộc cửa hàng.';
    end if;
    if r.requested <= 0 then
      raise exception 'Số lượng bán phải lớn hơn 0.';
    end if;
    if coalesce(v_stock, 0) < r.requested then
      raise exception 'Không đủ tồn kho cho "%". Còn %, cần %. Bật "Cho phép bán âm kho" trong Cấu hình nếu nghiệp vụ cho phép.',
        v_name, coalesce(v_stock, 0), r.requested;
    end if;
  end loop;
end;
$$;
revoke all on function public._inv_assert_sale_stock(uuid,jsonb) from public, anon, authenticated;

-- Every sale line, including calls made inside inv_create_order, is protected.
create or replace function public._inv_order_item_stock_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_shop uuid; v_status text;
begin
  if new.product_id is null then return new; end if;
  select o.shop_id, o.status into v_shop, v_status
    from public.orders o where o.id=new.order_id;
  if v_shop is null then raise exception 'Không tìm thấy đơn hàng.'; end if;
  if public._inv_stock_status(v_status) then
    perform public._inv_assert_sale_stock(
      v_shop,
      jsonb_build_array(jsonb_build_object('product_id',new.product_id,'qty',new.qty))
    );
  end if;
  return new;
end;
$$;
drop trigger if exists inv_order_item_stock_guard on public.order_items;
create trigger inv_order_item_stock_guard
  before insert on public.order_items
  for each row execute function public._inv_order_item_stock_guard();

-- Entering a stock-counting status from draft/quote/cancelled must also obey the rule.
create or replace function public._inv_order_status_chg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare it record; v_old_in boolean; v_new_in boolean; v_items jsonb;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_old_in := public._inv_stock_status(old.status);
  v_new_in := public._inv_stock_status(new.status);
  if v_old_in = v_new_in then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || new.id::text, 0));

  if v_new_in then
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', oi.product_id, 'qty', oi.qty
    )), '[]'::jsonb) into v_items
    from public.order_items oi where oi.order_id=new.id and oi.product_id is not null;
    perform public._inv_assert_sale_stock(new.shop_id, v_items);
    perform public._inv_ledger_begin();
    for it in
      select oi.* from public.order_items oi
      where oi.order_id=new.id and oi.product_id is not null
      order by oi.product_id
    loop
      perform public._inv_ledger_insert(
        new.shop_id, 'sale', new.id, new.code, it.id, it.product_id, it.name,
        -it.qty, null, null);
    end loop;
  else
    perform public._inv_ledger_reverse(new.shop_id, 'sale', new.id, null);
  end if;
  return new;
end;
$$;

-- Line mutations outside the atomic order RPC would bypass inventory accounting.
revoke insert, update, delete on public.order_items from authenticated;

-- Normalize the retired, unenforced inverse flag so the UI has one source of truth.
delete from public.settings where key='no_sell_zero_qty';
