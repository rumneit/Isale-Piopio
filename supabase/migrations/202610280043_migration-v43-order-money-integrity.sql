-- ============================================================================
-- PioPio v43 — Order lifecycle money integrity
--
-- Chạy SAU v41 và v42 trong Supabase Dashboard → SQL Editor.
-- An toàn khi chạy lại nhiều lần (idempotent).
--
-- Vá các lỗi làm lệch tiền / tồn / công nợ khi đổi trạng thái hoặc xóa đơn:
--   1. Đơn chuyển từ Nháp/Báo giá/Công nợ → Hoàn tất bị trigger v41 đặt
--      paid=true nhưng KHÔNG có khoản thu nào được ghi → doanh thu và sổ quỹ
--      lệch nhau. v43 bảo đảm mọi đơn đã thanh toán đều có khoản thu tương ứng.
--   2. Bật/tắt "đã thanh toán" trên chi tiết đơn là UPDATE trực tiếp, không
--      đảo khoản thu (trước đây màn hình tự tạo một khoản CHI "Chi khác" nên
--      làm sai báo cáo lợi nhuận và số dư ví). v43 ghi/đảo khoản thu đúng.
--   3. Xóa đơn đã thu tiền để lại giao dịch mồ côi (orders bị xóa, order_id
--      set null) → doanh thu biến mất nhưng tiền vẫn trong sổ. v43 chặn xóa
--      đơn đã có thanh toán/phiếu trả; dùng Hủy đơn để đảo nghiệp vụ.
--   4. Trả hàng không kiểm tra số đã trả trước đó và lấy giá do client gửi →
--      có thể trả vượt số đã mua / hoàn tiền nhiều hơn giá trị đơn. v43 lấy
--      giá gốc từ đơn và chặn tổng số trả vượt số đã mua.
--   5. Thu hồi UPDATE/DELETE trực tiếp trên orders để không thể sửa tổng tiền
--      hoặc xóa đơn qua PostgREST, bỏ qua các RPC nghiệp vụ.
--
-- Phụ thuộc: v27 (_inv_stock_status, inv_apply_note), v34 (idempotency_key,
-- inv_create_return_note), v41 (order_debt_value, account_id).
-- ============================================================================

begin;

-- ---------- 0. Chặn chạy sai thứ tự ----------
do $$
begin
  if to_regprocedure('public._inv_stock_status(text)') is null
     or to_regprocedure('public.inv_apply_note(uuid,text,uuid,jsonb)') is null then
    raise exception 'v43 cần chạy supabase-migration-v27.sql trước.';
  end if;
  if to_regprocedure('public.order_debt_value(uuid,numeric,boolean,text)') is null then
    raise exception 'v43 cần chạy supabase-migration-v41-money-debt-integrity.sql trước.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='orders' and column_name='idempotency_key'
  ) then
    raise exception 'v43 cần chạy supabase-migration-v34-release-hardening.sql trước.';
  end if;
end $$;

-- ---------- 1. Helper: trạng thái phát sinh doanh thu ----------
create or replace function public._inv_is_billable_status(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status, 'completed')
         not in ('draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled');
$$;
revoke all on function public._inv_is_billable_status(text) from public, anon, authenticated;

-- Tổng tiền thực đã thu của một đơn (thu − chi), dùng cùng quy ước với
-- order_debt_value của v41.
create or replace function public._inv_order_net_paid(p_shop uuid, p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
           case when t.type = 'income' then t.amount
                when t.type = 'expense' then -t.amount
                else 0 end
         ), 0)
    from public.transactions t
   where t.shop_id = p_shop and t.order_id = p_order_id;
$$;
revoke all on function public._inv_order_net_paid(uuid, uuid) from public, anon, authenticated;

-- Ghi bổ sung khoản thu "Bán hàng" còn thiếu cho đơn. Idempotent theo số đã thu.
create or replace function public._inv_ensure_order_income(
  p_shop uuid, p_order_id uuid, p_total numeric, p_code text,
  p_account uuid, p_payment text
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_net numeric;
  v_missing numeric;
begin
  if coalesce(p_total, 0) <= 0 then return 0; end if;
  v_net := public._inv_order_net_paid(p_shop, p_order_id);
  v_missing := round(p_total - v_net, 2);
  if v_missing <= 0.5 then return 0; end if;

  insert into public.transactions(
    shop_id, type, category, amount, note, occurred_at,
    order_id, source, payment_type, account_id, client_nonce
  ) values (
    p_shop, 'income', 'Bán hàng', v_missing,
    'Thu tiền đơn ' || coalesce(p_code, p_order_id::text),
    now(), p_order_id, 'order',
    coalesce(nullif(p_payment, ''), 'CASH'), p_account,
    'order-pay:' || gen_random_uuid()::text
  );
  return v_missing;
end $$;
revoke all on function public._inv_ensure_order_income(uuid,uuid,numeric,text,uuid,text)
  from public, anon, authenticated;

-- ---------- 2. Đổi trạng thái đơn (kèm bút toán thu) ----------
create or replace function public.inv_set_order_status(
  p_shop uuid, p_order_id uuid, p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền đổi trạng thái đơn hàng.';
  end if;
  if p_status is null or p_status not in (
    'draft','quote','pending','processing','shipping','delivered','completed',
    'debt','ship_debt','consignment','cancelled'
  ) then
    raise exception 'Trạng thái đơn hàng không hợp lệ.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));
  select * into v_order
    from public.orders
   where id = p_order_id and shop_id = p_shop
   for update;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;

  if v_order.status is distinct from p_status then
    update public.orders set status = p_status where id = p_order_id;
    select * into v_order from public.orders where id = p_order_id;
  end if;

  -- v41 đặt paid=true khi rời nhóm Nháp/Báo giá/Công nợ. Bảo đảm khoản thu
  -- tương ứng tồn tại để sổ quỹ khớp doanh thu.
  if public._inv_is_billable_status(v_order.status) and coalesce(v_order.paid, false) then
    perform public._inv_ensure_order_income(
      p_shop, p_order_id, v_order.total, v_order.code,
      v_order.account_id, v_order.payment_method
    );
    select * into v_order from public.orders where id = p_order_id;
  end if;

  return to_jsonb(v_order);
end $$;
revoke all on function public.inv_set_order_status(uuid,uuid,text) from public, anon;
grant execute on function public.inv_set_order_status(uuid,uuid,text) to authenticated, service_role;

-- ---------- 3. Bật/tắt "đã thanh toán" (đảo đúng khoản thu) ----------
create or replace function public.inv_set_order_paid(
  p_shop uuid, p_order_id uuid, p_paid boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  r record;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền cập nhật thanh toán đơn hàng.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));
  select * into v_order
    from public.orders
   where id = p_order_id and shop_id = p_shop
   for update;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;

  if coalesce(p_paid, false) then
    if v_order.status in ('cancelled', 'quote') then
      raise exception 'Không thể đánh dấu đã thanh toán cho đơn đã hủy/báo giá.';
    end if;
    update public.orders set paid = true where id = p_order_id;
    select * into v_order from public.orders where id = p_order_id;
    perform public._inv_ensure_order_income(
      p_shop, p_order_id, v_order.total, v_order.code,
      v_order.account_id, v_order.payment_method
    );
  else
    -- Đảo khoản thu tự sinh của đơn (Bán hàng). Giữ các khoản "Thu nợ" khách
    -- đã trả thực tế — công nợ sẽ còn đúng phần chưa thu.
    for r in
      select id from public.transactions
       where shop_id = p_shop and order_id = p_order_id
         and source = 'order' and category = 'Bán hàng'
       for update
    loop
      perform set_config('piopio.allow_order_tx', r.id::text, true);
      delete from public.transactions where id = r.id;
      perform set_config('piopio.allow_order_tx', '', true);
    end loop;
    update public.orders set paid = false where id = p_order_id;
  end if;

  select * into v_order from public.orders where id = p_order_id;
  return to_jsonb(v_order);
end $$;
revoke all on function public.inv_set_order_paid(uuid,uuid,boolean) from public, anon;
grant execute on function public.inv_set_order_paid(uuid,uuid,boolean) to authenticated, service_role;

-- ---------- 4. Hình thức thanh toán ----------
create or replace function public.inv_set_order_payment(
  p_shop uuid, p_order_id uuid, p_method text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders%rowtype;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền sửa đơn hàng.';
  end if;
  if p_method is not null and length(trim(p_method)) > 40 then
    raise exception 'Hình thức thanh toán không hợp lệ.';
  end if;
  update public.orders
     set payment_method = nullif(trim(coalesce(p_method, '')), '')
   where id = p_order_id and shop_id = p_shop
   returning * into v_order;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;
  return to_jsonb(v_order);
end $$;
revoke all on function public.inv_set_order_payment(uuid,uuid,text) from public, anon;
grant execute on function public.inv_set_order_payment(uuid,uuid,text) to authenticated, service_role;

-- ---------- 5. Xóa đơn an toàn ----------
create or replace function public.inv_delete_order(p_shop uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_order public.orders%rowtype;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền xóa đơn hàng.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sale:' || p_order_id::text, 0));
  select * into v_order
    from public.orders
   where id = p_order_id and shop_id = p_shop
   for update;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;

  if exists (select 1 from public.transactions where order_id = p_order_id) then
    raise exception 'Đơn % đã ghi nhận thanh toán. Hãy dùng Hủy đơn để đảo nghiệp vụ thay vì xóa.', v_order.code;
  end if;
  if exists (select 1 from public.return_notes where order_id = p_order_id) then
    raise exception 'Đơn % đã có phiếu trả hàng, không thể xóa.', v_order.code;
  end if;

  -- Trigger v27 hoàn tồn, v41 đảo công nợ.
  delete from public.orders where id = p_order_id;
end $$;
revoke all on function public.inv_delete_order(uuid,uuid) from public, anon;
grant execute on function public.inv_delete_order(uuid,uuid) to authenticated, service_role;

create or replace function public.inv_delete_orders(p_shop uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_count integer := 0;
begin
  if p_ids is null or array_length(p_ids, 1) is null then return 0; end if;
  if array_length(p_ids, 1) > 500 then
    raise exception 'Chỉ xóa tối đa 500 đơn mỗi lần.';
  end if;
  foreach v_id in array p_ids loop
    perform public.inv_delete_order(p_shop, v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.inv_delete_orders(uuid,uuid[]) from public, anon;
grant execute on function public.inv_delete_orders(uuid,uuid[]) to authenticated, service_role;

-- ---------- 6. Trả hàng: chặn trả vượt + lấy giá gốc từ đơn ----------
create or replace function public.inv_create_return_note(
  p_shop uuid, p_note jsonb, p_items jsonb, p_nonce uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note public.return_notes%rowtype;
  v_total numeric := 0;
  v_item jsonb;
  v_order uuid;
  v_product uuid;
  v_name text;
  v_qty numeric;
  v_price numeric;
  v_prior numeric;
  v_ordered numeric;
  v_status text;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền trả hàng.';
  end if;
  if p_nonce is null then raise exception 'Thiếu khóa chống gửi lặp.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('return:' || p_shop::text || ':' || p_nonce::text, 0));
  select * into v_note from public.return_notes
   where shop_id = p_shop and idempotency_key = p_nonce limit 1;
  if found then return to_jsonb(v_note); end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Phiếu trả cần ít nhất một sản phẩm.';
  end if;

  v_order := nullif(p_note->>'order_id', '')::uuid;
  if v_order is not null then
    select status into v_status
      from public.orders where id = v_order and shop_id = p_shop;
    if not found then
      raise exception 'Đơn hàng không thuộc cửa hàng.';
    end if;
    -- Đơn nháp/báo giá/đã hủy chưa từng trừ tồn: trả hàng sẽ làm tồn tăng khống.
    if not public._inv_stock_status(v_status) then
      raise exception 'Đơn ở trạng thái "%" không thể trả hàng.', v_status;
    end if;
    -- Khóa theo đơn để hai phiếu trả đồng thời không cùng vượt số đã mua.
    perform pg_advisory_xact_lock(hashtextextended('return-order:' || v_order::text, 0));
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := trim(coalesce(v_item->>'name', ''));
    v_qty := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
    v_product := nullif(v_item->>'product_id', '')::uuid;
    if v_qty <= 0 then raise exception 'Số lượng trả phải lớn hơn 0.'; end if;
    if v_name = '' then raise exception 'Tên sản phẩm trả không hợp lệ.'; end if;

    if v_order is not null then
      -- Giá hoàn lấy từ đơn gốc, KHÔNG tin giá client gửi.
      if v_product is not null then
        select max(oi.price), coalesce(sum(oi.qty), 0)
          into v_price, v_ordered
          from public.order_items oi
         where oi.order_id = v_order and oi.product_id = v_product;
      else
        select max(oi.price), coalesce(sum(oi.qty), 0)
          into v_price, v_ordered
          from public.order_items oi
         where oi.order_id = v_order and lower(trim(oi.name)) = lower(v_name);
      end if;
      if v_price is null then
        raise exception 'Dòng "%" không có trong đơn hàng gốc.', v_name;
      end if;

      select coalesce(sum(coalesce((r->>'qty')::numeric, 0)), 0)
        into v_prior
        from public.return_notes rn
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(rn.items) = 'array' then rn.items else '[]'::jsonb end
        ) r
       where rn.shop_id = p_shop
         and rn.order_id = v_order
         and (
           (v_product is not null and nullif(r->>'product_id', '')::uuid = v_product)
           or (v_product is null and lower(trim(coalesce(r->>'name', ''))) = lower(v_name))
         );

      if v_prior + v_qty > v_ordered then
        raise exception 'Số lượng trả "%" vượt quá số đã mua (đã mua %, đã trả %, lần này %).',
          v_name, v_ordered, v_prior, v_qty;
      end if;

      v_total := v_total + round(v_price * v_qty, 2);
    else
      -- Phiếu trả không gắn đơn: vẫn phải có giá hợp lệ.
      v_price := coalesce(nullif(v_item->>'price', '')::numeric, -1);
      if v_price < 0 then raise exception 'Giá trả không hợp lệ.'; end if;
      if v_product is not null and not exists (
        select 1 from public.products where id = v_product and shop_id = p_shop
      ) then
        raise exception 'Sản phẩm không thuộc cửa hàng.';
      end if;
      v_total := v_total + round(v_price * v_qty, 2);
    end if;
  end loop;

  if v_total >= 1e13 then raise exception 'Tổng tiền trả không hợp lệ.'; end if;

  insert into public.return_notes(
    shop_id, order_id, order_code, code, customer_id, items, total, refunded, note, idempotency_key
  ) values (
    p_shop, v_order, nullif(p_note->>'order_code', ''), nullif(trim(p_note->>'code'), ''),
    nullif(p_note->>'customer_id', '')::uuid, p_items, v_total,
    coalesce((p_note->>'refunded')::boolean, true), nullif(p_note->>'note', ''), p_nonce
  ) returning * into v_note;

  perform public.inv_apply_note(p_shop, 'return_note', v_note.id, p_items);
  if v_note.refunded and v_total > 0 then
    insert into public.transactions(
      shop_id, type, category, amount, note, occurred_at, source, client_nonce
    ) values (
      p_shop, 'expense', 'Trả hàng', v_total,
      'Hoàn tiền trả hàng ' || coalesce(v_note.order_code, '') || ' → ' || v_note.code,
      now(), 'return_note', 'return:' || p_nonce::text
    );
  end if;
  return to_jsonb(v_note);
end $$;
revoke all on function public.inv_create_return_note(uuid,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.inv_create_return_note(uuid,jsonb,jsonb,uuid) to authenticated, service_role;

-- ---------- 7. Mã đơn duy nhất trong từng cửa hàng ----------
-- Frontend cũ sinh mã chỉ 4 ký tự base36 nên có thể trùng. Nếu dữ liệu hiện
-- tại đã có mã trùng, KHÔNG tự xóa/sửa: chỉ cảnh báo để chủ shop xử lý tay.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='orders_shop_code_uniq') then
    if exists (
      select 1 from public.orders group by shop_id, code having count(*) > 1
    ) then
      raise notice 'Bỏ qua orders_shop_code_uniq: đang có mã đơn trùng. Hãy đổi mã các đơn trùng rồi chạy lại v43.';
    else
      execute 'create unique index orders_shop_code_uniq on public.orders(shop_id, code)';
    end if;
  end if;
end $$;

-- ---------- 8. Khóa ghi trực tiếp để mọi thay đổi đi qua RPC ----------
-- Insert đã bị thu hồi ở v35. v43 thu hồi luôn UPDATE/DELETE: sửa tổng tiền,
-- cờ paid hay xóa đơn qua PostgREST đều bị chặn.
revoke update, delete on public.orders from authenticated;

notify pgrst, 'reload schema';

commit;
