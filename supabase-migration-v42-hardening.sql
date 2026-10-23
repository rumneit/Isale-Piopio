-- ============================================================================
-- PioPio v42 — Production hardening / repair migration
--
-- Chạy SAU v41 (money-debt-integrity) và v40 trong Supabase Dashboard → SQL Editor.
-- An toàn khi chạy lại nhiều lần (idempotent).
--
-- Nếu v31 trước đây bị rollback TOÀN BỘ (chưa có bảng/functions CRM), hãy chạy
-- lại file supabase-migration-v31-customer-crm.sql (bản đã sửa) trước v42.
-- v42 chỉ bổ sung các cột tối thiểu để trigger khách hàng không làm dừng
-- migration; các bảng/functions CRM đầy đủ vẫn do v31/v32/v33 tạo.
--
-- Lưu ý: chỉ chạy v42 sau khi frontend dùng inv_update_order_full (v40) đã
-- deploy. Client cũ còn gọi inv_update_order sẽ nhận lỗi function not found.
--
-- File này sửa các lỗi chỉ có thể vá an toàn trên production mà không cần chạy
-- lại các migration lịch sử đã hỏng:
--   1. Bật RLS cho các bảng legacy được tạo trước v13 nhưng chưa enable.
--   2. Thu hồi quyền EXECUTE của anon/authenticated trên các hàm kho nội bộ,
--      trigger công nợ/ví tiền và helper CRM.
--   3. Sửa grant sai chữ ký của crm_list_customers (v31), đồng thời thu hồi
--      quyền PUBLIC/anon mặc định trên các RPC CRM.
--   4. Thay trigger crm_prepare_customer: chỉ validate trường thực sự đổi,
--      để dữ liệu cũ không làm hỏng cập nhật total_spending/debt/last_activity.
--   5. Thay inv_create_order: kiểm tra tồn kho theo tổng các dòng trùng sản phẩm,
--      tự tính tổng tiền từ discount_percent/tax_percent và giữ account_id của v41.
--   6. Bổ sung cột v16/v17 nếu production còn thiếu.
--   7. Bỏ RPC cũ inv_update_order (đã được inv_update_order_full của v40 thay thế).
-- ============================================================================

begin;

-- Chặn chạy sai thứ tự: v42 thay inv_create_order bằng bản dùng
-- _inv_assert_sale_stock (v36), account_id/công nợ (v41) và bỏ inv_update_order
-- sau khi v40 đã có bản thay thế. Thiếu các hàm nền này thì phải chạy migration
-- tương ứng trước.
do $$
begin
  if to_regprocedure('public._inv_assert_sale_stock(uuid,jsonb)') is null then
    raise exception 'v42 cần chạy supabase-migration-v36-negative-stock-rule.sql trước.';
  end if;
  if to_regprocedure('public.inv_update_order_full(uuid,uuid,jsonb,jsonb,boolean)') is null then
    raise exception 'v42 cần chạy supabase-migration-v40-sale-order-edit.sql trước.';
  end if;
  if to_regprocedure('public.order_debt_value(uuid,numeric,boolean,text)') is null then
    raise exception 'v42 cần chạy supabase-migration-v41-money-debt-integrity.sql trước.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'account_id'
  ) then
    raise exception 'v42 cần chạy supabase-migration-v41-money-debt-integrity.sql trước.';
  end if;
end $$;

-- ---------- 1. Cột additive còn thiếu (v16/v17 + v31 tối thiểu) ----------
-- Nếu v31 từng bị rollback vì lỗi grant, các cột dưới đây có thể chưa có.
-- Thêm lại an toàn để trigger khách hàng của v42 không làm migration dừng.
alter table public.customers
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists phone_normalized text,
  add column if not exists search_vector tsvector;

alter table public.products add column if not exists expiry_date date;
alter table public.products add column if not exists barcode text;
create index if not exists products_shop_barcode_idx
  on public.products (shop_id, barcode)
  where barcode is not null;
create index if not exists products_shop_expiry_idx
  on public.products (shop_id, expiry_date)
  where expiry_date is not null;

alter table public.orders add column if not exists payment_method text;

-- ---------- 2. Bật RLS cho các bảng legacy còn thiếu ----------
-- Các bảng này đã có policy "shop member all" từ migration cũ nhưng RLS chưa
-- được bật, nên policy không có tác dụng. Dùng IF EXISTS để không lỗi với các
-- bảng đã bị v32 gỡ (point_transactions, shifts).
alter table if exists public.crm_leads enable row level security;
alter table if exists public.received_notes enable row level security;
alter table if exists public.customer_groups enable row level security;
alter table if exists public.customer_interactions enable row level security;
alter table if exists public.customer_debt_ledger enable row level security;
alter table if exists public.customer_attachments enable row level security;
alter table if exists public.promotions enable row level security;
alter table if exists public.materials enable row level security;
alter table if exists public.point_transactions enable row level security;
alter table if exists public.settings enable row level security;
alter table if exists public.return_notes enable row level security;
alter table if exists public.calendar_events enable row level security;
alter table if exists public.notes enable row level security;
alter table if exists public.shifts enable row level security;
alter table if exists public.transfers enable row level security;
alter table if exists public.crm_activities enable row level security;
alter table if exists public.cafe_tables enable row level security;
alter table if exists public.tickets enable row level security;
alter table if exists public.surveys enable row level security;
alter table if exists public.activity_logs enable row level security;
alter table if exists public.loans enable row level security;
alter table if exists public.stock_counts enable row level security;
alter table if exists public.trade_categories enable row level security;
alter table if exists public.recurring_transactions enable row level security;

-- ---------- 3. Thu hồi quyền gọi hàm nội bộ ----------
-- Các hàm _inv_* chỉ dùng bên trong trigger/RPC security definer. Anon và
-- authenticated không được gọi trực tiếp qua PostgREST.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         '_inv_assert_member',
         '_inv_ledger_begin',
         '_inv_stock_status',
         '_inv_ledger_insert',
         '_inv_lock_products',
         '_inv_ledger_reverse',
         '_inv_order_item_ins',
         '_inv_order_item_del',
         '_inv_order_status_chg',
         '_inv_order_del',
         '_inv_products_stock_watch',
         '_inv_note_audit',
         '_inv_assert_sale_stock',
         '_inv_order_item_stock_guard',
         '_report_assert_member',
         '_report_window_totals',
         'crm_prepare_customer',
         'crm_refresh_customer_spending',
         'transactions_guard',
         'profiles_protect_privileges',
         '_settings_validate_invoice_template',
         -- v41 money/debt: trigger + helper nội bộ, không gọi qua PostgREST.
         'orders_customer_shop_guard',
         'order_debt_value',
         'orders_debt_before',
         'orders_debt_after',
         'transactions_debt_sync',
         'orders_nonbillable_after',
         'money_accounts_one_default',
         'money_accounts_ensure_default',
         'money_accounts_after_delete',
         'transactions_default_account',
         'orders_account_sync',
         'crm_phone_key',
         'handle_new_user',
         'note_image_validate',
         'shipments_guard'
       ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ---------- 4. Trigger khách hàng: chỉ validate trường thay đổi ----------
create or replace function public.crm_prepare_customer()
returns trigger language plpgsql set search_path = public as $$
declare
  v_num bigint;
  v_check_name boolean := false;
  v_check_phone boolean := false;
  v_check_email boolean := false;
begin
  -- Dữ liệu cũ có thể có name/phone/email không hợp lệ. Chỉ kiểm tra khi
  -- INSERT hoặc khi chính trường đó thay đổi; nhờ vậy trigger cập nhật
  -- total_spending/debt/last_activity không làm hỏng đơn hàng/công nợ cũ.
  if tg_op = 'INSERT' then
    v_check_name := true;
    v_check_phone := true;
    v_check_email := true;
  else
    v_check_name := new.name is distinct from old.name;
    v_check_phone := new.phone is distinct from old.phone;
    v_check_email := new.email is distinct from old.email;
  end if;

  new.name := btrim(new.name);
  if v_check_name and (length(new.name) < 2 or length(new.name) > 160) then
    raise exception 'Họ tên phải từ 2 đến 160 ký tự.';
  end if;

  new.phone := nullif(btrim(coalesce(new.phone,'')), '');
  new.phone_normalized := nullif(regexp_replace(coalesce(new.phone,''), '[^0-9]', '', 'g'), '');
  if v_check_phone and new.phone_normalized is not null
     and length(new.phone_normalized) not between 8 and 15 then
    raise exception 'Số điện thoại không hợp lệ.';
  end if;

  if v_check_email and new.email is not null
     and new.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Email không hợp lệ.';
  end if;

  if new.code is null or btrim(new.code) = '' then
    perform pg_advisory_xact_lock(hashtextextended('customer-code:' || new.shop_id::text, 0));
    select coalesce(max(nullif(regexp_replace(code, '[^0-9]', '', 'g'),'')::bigint),0)+1
      into v_num
      from public.customers
     where shop_id = new.shop_id;
    new.code := 'CUST' || lpad(v_num::text, 3, '0');
  end if;

  new.updated_at := now();
  new.search_vector := setweight(to_tsvector('simple', coalesce(new.name,'')), 'A') || setweight(to_tsvector('simple', coalesce(new.phone_normalized,'')), 'A') || setweight(to_tsvector('simple', coalesce(new.code,'')), 'B') || setweight(to_tsvector('simple', coalesce(new.email,'')), 'C');
  return new;
end $$;

drop trigger if exists crm_prepare_customer_trigger on public.customers;
create trigger crm_prepare_customer_trigger
  before insert or update on public.customers
  for each row execute function public.crm_prepare_customer();

-- Nếu hàm vừa được tạo mới (v31 chưa từng chạy), CREATE FUNCTION cấp EXECUTE
-- cho PUBLIC mặc định; thu hồi lại sau khi tạo.
revoke all on function public.crm_prepare_customer() from public, anon, authenticated;

-- Chỉ backfill các dòng còn thiếu, không UPDATE toàn bộ bảng khách hàng.
update public.customers
   set updated_at = updated_at
 where updated_at is null
    or search_vector is null
    or (phone is not null and phone_normalized is null)
    or code is null
    or btrim(code) = '';

-- ---------- 5. Tạo đơn: chặn tồn âm theo tổng dòng + tự tính tổng tiền ----------
create or replace function public.inv_create_order(
  p_shop uuid, p_order jsonb, p_items jsonb, p_nonce uuid,
  p_record_income boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_total numeric;
  v_merch numeric;
  v_discount numeric;
  v_discount_pct numeric;
  v_tax_pct numeric;
  v_tax numeric;
  v_ship numeric;
  v_ship_total numeric;
  v_ship_by_customer boolean;
  v_account uuid;
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền tạo đơn hàng.';
  end if;
  if p_nonce is null then raise exception 'Thiếu khóa chống gửi lặp.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('order:' || p_shop::text || ':' || p_nonce::text, 0));
  select * into v_order from public.orders
   where shop_id = p_shop and idempotency_key = p_nonce limit 1;
  if found then return to_jsonb(v_order); end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn hàng cần ít nhất một sản phẩm.';
  end if;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if length(trim(coalesce(v_item->>'name', ''))) = 0 then raise exception 'Tên sản phẩm không hợp lệ.'; end if;
    if coalesce(nullif(v_item->>'qty', '')::numeric, 0) <= 0 then raise exception 'Số lượng phải lớn hơn 0.'; end if;
    if coalesce(nullif(v_item->>'price', '')::numeric, -1) < 0 then raise exception 'Giá bán không hợp lệ.'; end if;
    if nullif(v_item->>'product_id', '') is not null and not exists (
      select 1 from public.products where id = (v_item->>'product_id')::uuid and shop_id = p_shop
    ) then raise exception 'Sản phẩm không thuộc cửa hàng.'; end if;
  end loop;

  -- Ví nhận tiền của v41: ưu tiên account_id client chọn, nếu không có thì dùng
  -- ví mặc định của cửa hàng. Kiểm tra để không gắn ví của shop khác vào đơn.
  v_account := nullif(p_order->>'account_id', '')::uuid;
  if v_account is null then
    select id into v_account
      from public.money_accounts
     where shop_id = p_shop and is_default = true
     limit 1;
  end if;
  if v_account is not null and not exists (
    select 1 from public.money_accounts where id = v_account and shop_id = p_shop
  ) then
    raise exception 'Tài khoản nhận tiền không thuộc cửa hàng.';
  end if;

  -- v36 mới tạo _inv_assert_sale_stock. Nếu chạy v42 trên DB chưa có v36 thì
  -- bỏ qua; trigger từng dòng của v36 vẫn là lớp bảo vệ cuối.
  if public._inv_stock_status(coalesce(nullif(p_order->>'status', ''), 'completed'))
     and to_regprocedure('public._inv_assert_sale_stock(uuid,jsonb)') is not null then
    perform public._inv_assert_sale_stock(p_shop, p_items);
  end if;

  select coalesce(sum((x->>'price')::numeric * (x->>'qty')::numeric), 0)
    into v_merch
    from jsonb_array_elements(p_items) x;
  v_merch := round(v_merch, 2);

  v_ship_by_customer := coalesce((p_order->>'ship_fee_by_customer')::boolean, true);
  v_ship := greatest(0, coalesce(nullif(p_order->>'ship_fee', '')::numeric, 0));
  v_ship_total := case when v_ship_by_customer then v_ship else 0 end;

  v_discount_pct := nullif(p_order->>'discount_percent', '')::numeric;
  v_tax_pct := nullif(p_order->>'tax_percent', '')::numeric;

  if v_discount_pct is not null or v_tax_pct is not null then
    -- Frontend mới gửi phần trăm; server tự tính tiền hàng/chiết khấu/thuế/ship.
    v_discount_pct := coalesce(v_discount_pct, 0);
    v_tax_pct := coalesce(v_tax_pct, 0);
    if v_discount_pct < 0 or v_discount_pct > 100 then
      raise exception 'Chiết khấu không hợp lệ.';
    end if;
    if v_tax_pct < 0 or v_tax_pct > 1000 then
      raise exception 'Thuế không hợp lệ.';
    end if;
    v_discount := round(v_merch * v_discount_pct / 100);
    if v_discount > v_merch then
      v_discount := v_merch;
    end if;
    v_tax := round(v_merch * v_tax_pct / 100);
    v_total := round(v_merch - v_discount + v_tax + v_ship_total, 2);
  else
    -- Tương thích frontend cũ: discount là số tiền tuyệt đối, total do client
    -- gửi. Vẫn chặn client hạ tổng tiền xuống dưới tiền hàng sau chiết khấu.
    v_discount := greatest(0, coalesce(nullif(p_order->>'discount', '')::numeric, 0));
    if v_discount > v_merch then
      raise exception 'Chiết khấu không được lớn hơn tiền hàng.';
    end if;
    v_total := coalesce(nullif(p_order->>'total', '')::numeric,
      v_merch - v_discount + v_ship_total);
    if v_total < v_merch - v_discount
       or v_total > v_merch - v_discount + v_ship_total + v_merch * 10 then
      raise exception 'Tổng tiền không hợp lệ.';
    end if;
  end if;
  if v_total < 0 or v_total >= 1e13 then raise exception 'Tổng tiền không hợp lệ.'; end if;

  insert into public.orders(
    shop_id, code, customer_id, customer_name, status, total, discount, paid, note,
    channel_id, payment_method, ship_fee, ship_fee_by_customer, customer_phone,
    customer_address, shipping_code, shipping_partner, shipper_name, shipper_phone,
    shipping_address, idempotency_key, account_id
  ) values (
    p_shop, nullif(trim(p_order->>'code'), ''), nullif(p_order->>'customer_id', '')::uuid,
    nullif(trim(p_order->>'customer_name'), ''), coalesce(nullif(p_order->>'status', ''), 'completed'),
    v_total, v_discount, coalesce((p_order->>'paid')::boolean, true), nullif(p_order->>'note', ''),
    nullif(p_order->>'channel_id', '')::uuid, nullif(p_order->>'payment_method', ''), v_ship,
    coalesce((p_order->>'ship_fee_by_customer')::boolean, true), nullif(p_order->>'customer_phone', ''),
    nullif(p_order->>'customer_address', ''), nullif(p_order->>'shipping_code', ''),
    nullif(p_order->>'shipping_partner', ''), nullif(p_order->>'shipper_name', ''),
    nullif(p_order->>'shipper_phone', ''), nullif(p_order->>'shipping_address', ''), p_nonce,
    v_account
  ) returning * into v_order;

  insert into public.order_items(order_id, product_id, name, price, qty, total)
  select v_order.id, nullif(x->>'product_id', '')::uuid, trim(x->>'name'),
         (x->>'price')::numeric, (x->>'qty')::numeric,
         (x->>'price')::numeric * (x->>'qty')::numeric
    from jsonb_array_elements(p_items) x;

  if p_record_income and v_total > 0 then
    insert into public.transactions(shop_id, type, category, amount, note, occurred_at,
                                    order_id, source, client_nonce, account_id)
    values(p_shop, 'income', 'Bán hàng', v_total, 'Thu tiền đơn ' || v_order.code,
           now(), v_order.id, 'order', 'order:' || p_nonce::text, v_account);
  end if;
  return to_jsonb(v_order);
end;
$$;

-- ---------- 6. Quyền gọi RPC công khai ----------
-- Các grant lịch sử chỉ thêm authenticated nhưng không thu hồi quyền mặc định
-- PUBLIC, nên anon vẫn gọi được. Thu hồi PUBLIC/anon rồi cấp lại đúng role.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'crm_list_customers',
         'crm_create_customer',
         'crm_update_customer',
         'crm_soft_delete_customer',
         'crm_add_customer_interaction',
         'crm_adjust_customer_debt',
         'crm_import_customers',
         'crm_merge_customers'
       ])
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

revoke all on function public.inv_create_order(uuid,jsonb,jsonb,uuid,boolean) from public, anon;
grant execute on function public.inv_create_order(uuid,jsonb,jsonb,uuid,boolean) to authenticated, service_role;

revoke all on function public.inv_set_order_account(uuid,uuid,uuid) from public, anon;
grant execute on function public.inv_set_order_account(uuid,uuid,uuid) to authenticated, service_role;

-- ---------- 7. Bỏ RPC cũ đã được v40 thay thế ----------
drop function if exists public.inv_update_order(uuid, uuid, jsonb, numeric, numeric, boolean);

notify pgrst, 'reload schema';

commit;
