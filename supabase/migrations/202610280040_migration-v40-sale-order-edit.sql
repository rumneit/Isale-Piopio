-- ============================================================================
-- PioPio v40 — Sửa đơn hàng đầy đủ từ màn hình Bán hàng
--
-- Mục tiêu: nút bút chì ở chi tiết đơn hàng mở lại màn hình Bán hàng với đơn
-- cũ, cho phép sửa sản phẩm/số lượng/giá/chiết khấu/VAT/ship/khách hàng/
-- thanh toán/ghi chú/vận chuyển rồi lưu vào CHÍNH đơn đó.
--
-- Hàm inv_update_order_full:
--   * khóa đơn + các sản phẩm liên quan để tránh lưu chồng;
--   * cập nhật thông tin đầu đơn, trạng thái, tổng tiền;
--   * đồng bộ order_items (thêm/xóa/đổi số lượng/đổi giá);
--   * để trigger v27/v36 tự điều chỉnh tồn kho và chặn tồn âm;
--   * nếu đơn đã thanh toán, điều chỉnh khoản thu của đơn cho khớp tổng mới.
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- Chạy SAU v36/v39. An toàn khi chạy lại nhiều lần.
-- ============================================================================

-- Bảo đảm các cột màn hình Bán hàng cần dùng đều tồn tại (additive).
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists ship_fee numeric(14, 2) not null default 0;
alter table public.orders add column if not exists ship_fee_by_customer boolean not null default true;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists customer_address text;
alter table public.orders add column if not exists shipping_code text;
alter table public.orders add column if not exists shipping_partner text;
alter table public.orders add column if not exists shipper_name text;
alter table public.orders add column if not exists shipper_phone text;
alter table public.orders add column if not exists shipping_address text;

-- Cho phép RPC điều chỉnh đúng khoản thu của đơn hàng.
-- Trigger transactions_guard v24 vẫn chặn mọi sửa/xóa thủ công khác.
create or replace function public.transactions_guard()
returns trigger
language plpgsql
as $$
begin
  if current_setting('piopio.allow_order_tx', true) = old.id::text then
    return coalesce(new, old);
  end if;
  if coalesce(old.source, 'manual') <> 'manual' then
    raise exception 'Giao dịch này thuộc về % nên không thể sửa/xóa thủ công. Hãy thao tác qua đối tượng gốc.',
      case old.source
        when 'order' then 'đơn hàng'
        when 'debt' then 'công nợ'
        when 'recurring' then 'giao dịch định kỳ'
        when 'transfer' then 'chuyển tiền nội bộ'
        else 'hệ thống'
      end;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.inv_update_order_full(
  p_shop uuid,
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb,
  p_adjust_income boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.orders%rowtype;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_id uuid;
  v_keep uuid[] := array[]::uuid[];
  v_product uuid;
  v_name text;
  v_price numeric;
  v_qty numeric;
  v_line_total numeric;
  v_merch numeric := 0;
  v_discount_pct numeric;
  v_tax_pct numeric;
  v_discount numeric;
  v_tax numeric;
  v_ship_raw numeric;
  v_ship numeric;
  v_ship_by_customer boolean;
  v_total numeric;
  v_code text;
  v_status text;
  v_customer_id uuid;
  v_customer_name text;
  v_payment_method text;
  v_note text;
  v_customer_phone text;
  v_customer_address text;
  v_shipping_code text;
  v_shipping_partner text;
  v_shipper_name text;
  v_shipper_phone text;
  v_shipping_address text;
  v_created_at timestamptz;
  v_old_in boolean;
  v_new_in boolean;
  v_lock_ids jsonb;
  v_tx record;
  v_tx_id uuid;
  v_income_sum numeric := 0;
  v_delta numeric;
  v_reduce numeric;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền sửa đơn hàng.';
  end if;

  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'Thông tin đơn hàng không hợp lệ.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn hàng phải còn ít nhất một sản phẩm.';
  end if;

  -- Khóa theo đơn để tránh hai lần lưu chồng nhau (cùng khóa với trigger kho).
  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));

  select * into v_old
    from public.orders
   where id = p_order_id and shop_id = p_shop
   for update;
  if not found then
    raise exception 'Đơn hàng không tồn tại.';
  end if;

  v_code := nullif(trim(p_order->>'code'), '');
  if v_code is null then
    raise exception 'Mã đơn hàng không hợp lệ.';
  end if;
  if length(v_code) > 80 then
    raise exception 'Mã đơn hàng quá dài.';
  end if;

  v_status := coalesce(nullif(trim(p_order->>'status'), ''), v_old.status, 'completed');
  v_customer_id := nullif(p_order->>'customer_id', '')::uuid;
  v_customer_name := coalesce(nullif(trim(p_order->>'customer_name'), ''), 'Khách lẻ');
  v_payment_method := nullif(trim(p_order->>'payment_method'), '');
  v_note := nullif(trim(p_order->>'note'), '');
  v_customer_phone := nullif(trim(p_order->>'customer_phone'), '');
  v_customer_address := nullif(trim(p_order->>'customer_address'), '');
  v_shipping_code := nullif(trim(p_order->>'shipping_code'), '');
  v_shipping_partner := nullif(trim(p_order->>'shipping_partner'), '');
  v_shipper_name := nullif(trim(p_order->>'shipper_name'), '');
  v_shipper_phone := nullif(trim(p_order->>'shipper_phone'), '');
  v_shipping_address := nullif(trim(p_order->>'shipping_address'), '');

  if v_customer_id is not null and not exists (
    select 1 from public.customers
     where id = v_customer_id and shop_id = p_shop
  ) then
    raise exception 'Khách hàng không thuộc cửa hàng.';
  end if;

  v_discount_pct := coalesce(nullif(p_order->>'discount_percent', '')::numeric, 0);
  v_tax_pct := coalesce(nullif(p_order->>'tax_percent', '')::numeric, 0);
  if v_discount_pct < 0 or v_discount_pct > 100 then
    raise exception 'Chiết khấu không hợp lệ.';
  end if;
  if v_tax_pct < 0 or v_tax_pct > 1000 then
    raise exception 'Thuế không hợp lệ.';
  end if;

  v_ship_raw := greatest(0, coalesce(nullif(p_order->>'ship_fee', '')::numeric, 0));
  if v_ship_raw >= 1e13 then
    raise exception 'Phí ship không hợp lệ.';
  end if;
  v_ship_by_customer := coalesce((p_order->>'ship_fee_by_customer')::boolean, true);
  v_ship := case when v_ship_by_customer then v_ship_raw else 0 end;

  v_created_at := null;
  if nullif(p_order->>'created_at', '') is not null then
    v_created_at := (p_order->>'created_at')::timestamptz;
  end if;

  -- Kiểm tra danh sách dòng gửi lên: đủ tên/giá/số lượng, sản phẩm thuộc shop,
  -- id (nếu có) phải thuộc chính đơn này và không trùng.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := trim(coalesce(v_item->>'name', ''));
    if v_name = '' then
      raise exception 'Tên sản phẩm không hợp lệ.';
    end if;

    v_price := coalesce(nullif(v_item->>'price', '')::numeric, -1);
    if v_price < 0 then
      raise exception 'Giá bán không hợp lệ.';
    end if;

    v_qty := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    if v_qty <= 0 then
      raise exception 'Số lượng phải lớn hơn 0.';
    end if;

    v_line_total := round(v_price * v_qty, 2);
    if v_line_total >= 1e13 then
      raise exception 'Thành tiền dòng sản phẩm quá lớn.';
    end if;

    v_product := nullif(v_item->>'product_id', '')::uuid;
    if v_product is not null and not exists (
      select 1 from public.products
       where id = v_product and shop_id = p_shop
    ) then
      raise exception 'Sản phẩm không thuộc cửa hàng: %', v_name;
    end if;

    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is not null then
      if v_id = any(v_keep) then
        raise exception 'Dòng sản phẩm bị trùng.';
      end if;
      if not exists (
        select 1 from public.order_items
         where id = v_id and order_id = p_order_id
      ) then
        raise exception 'Dòng sản phẩm không còn tồn tại. Hãy tải lại đơn hàng.';
      end if;
      v_keep := v_keep || v_id;
    end if;

    v_merch := v_merch + v_line_total;
  end loop;

  v_merch := round(v_merch, 2);
  v_discount := round(v_merch * v_discount_pct / 100);
  if v_discount > v_merch then
    v_discount := v_merch;
  end if;
  v_tax := round(v_merch * v_tax_pct / 100);
  v_total := round(v_merch - v_discount + v_tax + v_ship, 2);
  if v_total < 0 or v_total >= 1e13 then
    raise exception 'Tổng tiền không hợp lệ.';
  end if;

  -- Khóa tất cả sản phẩm cũ + mới theo thứ tự product_id để tránh deadlock.
  select coalesce(jsonb_agg(distinct jsonb_build_object('product_id', oi.product_id)), '[]'::jsonb)
    into v_lock_ids
    from public.order_items oi
   where oi.order_id = p_order_id and oi.product_id is not null;
  v_lock_ids := v_lock_ids || coalesce((
    select jsonb_agg(jsonb_build_object('product_id', nullif(x->>'product_id', '')::uuid))
      from jsonb_array_elements(p_items) x
     where nullif(x->>'product_id', '') is not null
  ), '[]'::jsonb);
  perform public._inv_lock_products(v_lock_ids);

  v_old_in := public._inv_stock_status(v_old.status);
  v_new_in := public._inv_stock_status(v_status);

  -- Đổi mã sớm để dòng ledger mới ghi đúng mã đơn.
  if v_code is distinct from v_old.code then
    update public.orders set code = v_code where id = p_order_id;
  end if;

  -- Rời nhóm tính tồn: cập nhật trạng thái TRƯỚC để trigger hoàn tồn toàn bộ,
  -- sau đó sửa dòng trong trạng thái không tính tồn (trigger sẽ bỏ qua).
  if v_old_in and not v_new_in then
    update public.orders
       set status = v_status,
           total = v_total,
           discount = v_discount,
           customer_id = v_customer_id,
           customer_name = v_customer_name,
           payment_method = v_payment_method,
           note = v_note,
           ship_fee = v_ship_raw,
           ship_fee_by_customer = v_ship_by_customer,
           customer_phone = v_customer_phone,
           customer_address = v_customer_address,
           shipping_code = v_shipping_code,
           shipping_partner = v_shipping_partner,
           shipper_name = v_shipper_name,
           shipper_phone = v_shipper_phone,
           shipping_address = v_shipping_address,
           created_at = coalesce(v_created_at, created_at)
     where id = p_order_id
     returning * into v_order;
  end if;

  -- Xóa các dòng đã bị bỏ khỏi đơn. Trigger v27 tự hoàn tồn.
  delete from public.order_items
   where order_id = p_order_id
     and not (id = any(v_keep));

  -- Đồng bộ từng dòng:
  --   * dòng mới → insert (trigger kho tự trừ tồn);
  --   * dòng cũ đổi sản phẩm/số lượng trong đơn tính tồn → xóa rồi insert
  --     (xóa hoàn tồn cũ, insert trừ tồn mới);
  --   * dòng cũ chỉ đổi giá/tên → update tại chỗ (không đụng tồn).
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := nullif(v_item->>'id', '')::uuid;
    v_product := nullif(v_item->>'product_id', '')::uuid;
    v_name := trim(v_item->>'name');
    v_price := coalesce(nullif(v_item->>'price', '')::numeric, 0);
    v_qty := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    v_line_total := round(v_price * v_qty, 2);

    if v_id is null then
      insert into public.order_items(order_id, product_id, name, price, qty, total)
      values (p_order_id, v_product, v_name, v_price, v_qty, v_line_total);
    else
      declare
        v_old_product uuid;
        v_old_qty numeric;
      begin
        select product_id, qty into v_old_product, v_old_qty
          from public.order_items
         where id = v_id and order_id = p_order_id
         for update;
        if not found then
          raise exception 'Dòng sản phẩm không còn tồn tại. Hãy tải lại đơn hàng.';
        end if;

        if v_new_in and (v_old_product is distinct from v_product or v_old_qty is distinct from v_qty) then
          delete from public.order_items where id = v_id and order_id = p_order_id;
          insert into public.order_items(order_id, product_id, name, price, qty, total)
          values (p_order_id, v_product, v_name, v_price, v_qty, v_line_total);
        else
          update public.order_items
             set product_id = v_product,
                 name = v_name,
                 price = v_price,
                 qty = v_qty,
                 total = v_line_total
           where id = v_id and order_id = p_order_id;
        end if;
      end;
    end if;
  end loop;

  -- Vào nhóm tính tồn / giữ nguyên nhóm: cập nhật đầu đơn SAU khi đã đồng bộ
  -- dòng, để trigger trạng thái tính tồn trên đúng danh sách sản phẩm mới.
  if not (v_old_in and not v_new_in) then
    update public.orders
       set status = v_status,
           total = v_total,
           discount = v_discount,
           customer_id = v_customer_id,
           customer_name = v_customer_name,
           payment_method = v_payment_method,
           note = v_note,
           ship_fee = v_ship_raw,
           ship_fee_by_customer = v_ship_by_customer,
           customer_phone = v_customer_phone,
           customer_address = v_customer_address,
           shipping_code = v_shipping_code,
           shipping_partner = v_shipping_partner,
           shipper_name = v_shipper_name,
           shipper_phone = v_shipper_phone,
           shipping_address = v_shipping_address,
           created_at = coalesce(v_created_at, created_at)
     where id = p_order_id
     returning * into v_order;
  end if;

  -- Trigger CRM chỉ làm mới khách hàng MỚI khi đổi khách. Làm mới lại khách cũ
  -- để tổng chi tiêu của họ không bị kẹt số liệu cũ.
  if v_old.customer_id is not null and v_old.customer_id is distinct from v_customer_id then
    update public.customers
       set total_spending = (
         select coalesce(sum(o.total), 0)
           from public.orders o
          where o.shop_id = p_shop
            and o.customer_id = v_old.customer_id
            and o.status <> 'cancelled'
       ),
       last_activity = now()
     where id = v_old.customer_id;
  end if;

  -- Đơn đã thu tiền: giữ tổng các khoản thu của đơn khớp với tổng mới.
  if p_adjust_income and coalesce(v_order.paid, false) then
    if v_total <= 0 then
      for v_tx in
        select id from public.transactions
         where shop_id = p_shop and order_id = p_order_id
           and type = 'income' and source = 'order'
         for update
      loop
        perform set_config('piopio.allow_order_tx', v_tx.id::text, true);
        delete from public.transactions where id = v_tx.id;
        perform set_config('piopio.allow_order_tx', '', true);
      end loop;
    else
      select coalesce(sum(amount), 0) into v_income_sum
        from public.transactions
       where shop_id = p_shop and order_id = p_order_id
         and type = 'income' and source = 'order';

      v_delta := v_total - v_income_sum;
      if v_delta > 0 then
        v_tx_id := null;
        select id into v_tx_id
          from public.transactions
         where shop_id = p_shop and order_id = p_order_id
           and type = 'income' and source = 'order'
         order by occurred_at desc, created_at desc
         limit 1
         for update;

        if v_tx_id is null then
          insert into public.transactions(
            shop_id, type, category, amount, note, occurred_at,
            order_id, source, payment_type, client_nonce
          ) values (
            p_shop, 'income', 'Bán hàng', v_total, 'Thu tiền đơn ' || v_order.code,
            now(), p_order_id, 'order',
            coalesce(nullif(v_order.payment_method, ''), 'CASH'),
            'order-edit:' || gen_random_uuid()::text
          );
        else
          perform set_config('piopio.allow_order_tx', v_tx_id::text, true);
          update public.transactions
             set amount = coalesce(amount, 0) + v_delta
           where id = v_tx_id;
          perform set_config('piopio.allow_order_tx', '', true);
        end if;
      elsif v_delta < 0 then
        v_reduce := -v_delta;
        for v_tx in
          select id, amount from public.transactions
           where shop_id = p_shop and order_id = p_order_id
             and type = 'income' and source = 'order'
           order by occurred_at desc, created_at desc
           for update
        loop
          exit when v_reduce <= 0;
          if coalesce(v_tx.amount, 0) <= v_reduce then
            v_reduce := v_reduce - coalesce(v_tx.amount, 0);
            perform set_config('piopio.allow_order_tx', v_tx.id::text, true);
            delete from public.transactions where id = v_tx.id;
            perform set_config('piopio.allow_order_tx', '', true);
          else
            perform set_config('piopio.allow_order_tx', v_tx.id::text, true);
            update public.transactions
               set amount = coalesce(amount, 0) - v_reduce
             where id = v_tx.id;
            v_reduce := 0;
            perform set_config('piopio.allow_order_tx', '', true);
          end if;
        end loop;
      end if;
    end if;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.inv_update_order_full(uuid, uuid, jsonb, jsonb, boolean) from public;
grant execute on function public.inv_update_order_full(uuid, uuid, jsonb, jsonb, boolean) to authenticated;

-- Nạp lại schema cache của PostgREST để gọi RPC được ngay.
notify pgrst, 'reload schema';
