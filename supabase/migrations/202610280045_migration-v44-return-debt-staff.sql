-- ============================================================================
-- PioPio v44 — Trả hàng ↔ công nợ + quản lý nhân viên
--
-- Chạy SAU v43. An toàn khi chạy lại (idempotent).
--
-- 1. Trả hàng: trước đây mọi phiếu trả đều tạo khoản CHI "Trả hàng" bằng
--    toàn bộ giá trị hàng trả, kể cả đơn ghi nợ chưa thu đồng nào. Hệ quả:
--    quỹ bị trừ tiền trong khi khách vẫn nợ đủ, và công nợ không giảm.
--    v44 tách mỗi phiếu trả thành:
--      - cash_refund : phần thực sự hoàn tiền mặt (chỉ phần khách ĐÃ trả)
--      - debt_credit : phần bù trừ vào công nợ của đơn (khách CHƯA trả)
--    Công thức: số còn phải thu sau trả = total − luỹ kế trả − đã thu.
--    Chỉ phần đã thu vượt mức đó mới được hoàn tiền mặt.
--
-- 2. Quản lý nhân viên: thêm/xoá nhân viên đã có tài khoản vào cửa hàng,
--    gán vai trò + preset quyền. Không tạo tài khoản/mật khẩu hộ nhân viên;
--    nhân viên tự đăng ký rồi chủ cửa hàng thêm vào (xem QA/GO).
--    Xoá khỏi cửa hàng = thu hồi toàn bộ quyền truy cập dữ liệu cửa hàng.
--
-- Phụ thuộc: v41 (order_debt_value), v43 (inv_create_return_note, RPC đơn).
-- ============================================================================

begin;

-- ---------- 0. Chặn chạy sai thứ tự ----------
do $$
begin
  if to_regprocedure('public.order_debt_value(uuid,numeric,boolean,text)') is null
     or to_regprocedure('public.inv_create_return_note(uuid,jsonb,jsonb,uuid)') is null then
    raise exception 'v44 cần chạy v41 và v43 trước.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='orders' and column_name='debt_amount'
  ) then
    raise exception 'v44 cần chạy v41 trước (orders.debt_amount).';
  end if;
end $$;

-- ---------- 1. Cột phân tách hoàn tiền / bù nợ ----------
alter table public.return_notes
  add column if not exists cash_refund numeric(14,2) not null default 0;
alter table public.return_notes
  add column if not exists debt_credit numeric(14,2) not null default 0;

comment on column public.return_notes.cash_refund is
  'Phần giá trị hàng trả được hoàn bằng tiền mặt (đã tạo giao dịch chi).';
comment on column public.return_notes.debt_credit is
  'Phần giá trị hàng trả được bù trừ vào công nợ của đơn (không chi tiền).';

-- Dữ liệu lịch sử: mọi phiếu trả cũ đều đã tạo khoản chi đúng bằng total,
-- nên ghi nhận cash_refund = total để báo cáo không mô tả sai. Không đụng
-- debt_credit của dữ liệu cũ (không thể suy ngược khách đã trả bao nhiêu).
do $$
begin
  if to_regclass('public.piopio_migrations') is not null
     and not exists (select 1 from public.piopio_migrations where id = 'v44_return_debt_credit') then
    update public.return_notes
       set cash_refund = total
     where refunded and cash_refund = 0 and debt_credit = 0;

    insert into public.piopio_migrations(id) values ('v44_return_debt_credit')
    on conflict (id) do nothing;
  end if;
end $$;

-- Cảnh báo dữ liệu cũ có thể sai: phiếu trả có hoàn tiền trên đơn ghi nợ.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from public.return_notes rn
    join public.orders o on o.id = rn.order_id
   where rn.refunded and rn.total > 0
     and coalesce(o.paid, false) = false
     and o.status not in ('cancelled', 'quote');
  if v_bad > 0 then
    raise notice 'v44: % phiếu trả cũ trên đơn chưa thanh toán đã từng chi tiền mặt. Kiểm tra tay: select * from return_notes rn join orders o on o.id=rn.order_id where rn.refunded and o.paid=false;', v_bad;
  end if;
end $$;

-- ---------- 2. Công nợ đơn trừ phần hàng đã trả ----------
create or replace function public.order_debt_value(
  p_order_id uuid,
  p_total numeric,
  p_paid boolean,
  p_status text
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select coalesce(sum(
      case when t.type = 'income' then t.amount
           when t.type = 'expense' then -t.amount
           else 0 end
    ), 0) as net
      from public.transactions t
     where t.order_id = p_order_id
  ), r as (
    select coalesce(sum(rn.total), 0) as returned,
           coalesce(sum(rn.cash_refund), 0) as refunded
      from public.return_notes rn
     where rn.order_id = p_order_id
  )
  select case
    when coalesce(p_status, '') in ('cancelled', 'quote') then 0::numeric
    when coalesce(p_paid, false) then 0::numeric
    else greatest(
      0::numeric,
      -- Nghĩa vụ còn lại = giá trị hàng giữ lại − tiền thực đã trả.
      -- Tiền hoàn mặt không phải là thanh toán, nên cộng lại vào "đã trả"
      -- (nó đã bị trừ khỏi net qua giao dịch chi).
      coalesce(p_total, 0)
        - (select returned from r)
        - greatest(0::numeric, (select net from n) + (select refunded from r))
    )
  end;
$$;
revoke all on function public.order_debt_value(uuid,numeric,boolean,text) from public, anon, authenticated;

-- ---------- 3. Trả hàng: hoàn tiền mặt phần đã thu, bù nợ phần chưa thu ----------
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
  v_order_total numeric := 0;
  v_net_paid numeric := 0;
  v_effective_paid numeric := 0;
  v_refunded_before numeric := 0;
  v_returns_after numeric := 0;
  v_cash numeric := 0;
  v_credit numeric := 0;
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
    select status, total into v_status, v_order_total
      from public.orders where id = v_order and shop_id = p_shop;
    if not found then
      raise exception 'Đơn hàng không thuộc cửa hàng.';
    end if;
    if not public._inv_stock_status(v_status) then
      raise exception 'Đơn ở trạng thái "%" không thể trả hàng.', v_status;
    end if;
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

  if v_order is not null then
    select coalesce(sum(total), 0) into v_returns_after
      from public.return_notes where order_id = v_order;
    v_net_paid := public._inv_order_net_paid(p_shop, v_order);
    -- Các khoản hoàn tiền trước đây đã bị trừ khỏi net (giao dịch chi), nên
    -- cộng lại để có "tiền khách thực đã trả cho hàng đang giữ".
    select coalesce(sum(rn.cash_refund), 0) into v_refunded_before
      from public.return_notes rn
     where rn.order_id = v_order and rn.id <> v_note.id;
    v_effective_paid := v_net_paid + v_refunded_before;

    -- Phần khách đã trả vượt quá giá trị hàng còn giữ lại mới được hoàn tiền.
    if v_note.refunded then
      v_cash := least(
        v_total,
        greatest(0, round(v_effective_paid - (v_order_total - v_returns_after), 2))
      );
    end if;
    v_cash := greatest(0, v_cash);
    v_credit := round(v_total - v_cash, 2);

    update public.return_notes
       set cash_refund = v_cash, debt_credit = v_credit
     where id = v_note.id;
    v_note.cash_refund := v_cash;
    v_note.debt_credit := v_credit;
  else
    -- Trả hàng không gắn đơn: không có công nợ để bù, hoàn tiền mặt nếu chọn.
    v_cash := case when v_note.refunded then v_total else 0 end;
    v_credit := 0;
    update public.return_notes
       set cash_refund = v_cash, debt_credit = 0
     where id = v_note.id;
    v_note.cash_refund := v_cash;
    v_note.debt_credit := 0;
  end if;

  perform public.inv_apply_note(p_shop, 'return_note', v_note.id, p_items);

  if v_cash > 0 then
    insert into public.transactions(
      shop_id, type, category, amount, note, occurred_at, order_id, source, client_nonce
    ) values (
      p_shop, 'expense', 'Trả hàng', v_cash,
      'Hoàn tiền trả hàng ' || coalesce(v_note.order_code, '') || ' → ' || v_note.code,
      now(), v_order, 'return_note', 'return:' || p_nonce::text
    );
  end if;

  -- Giảm công nợ của đơn theo phần hàng đã trả (trigger v41 đồng bộ khách).
  if v_order is not null then
    update public.orders
       set debt_amount = public.order_debt_value(id, total, paid, status)
     where id = v_order;
  end if;

  return to_jsonb(v_note) || jsonb_build_object(
    'cash_refund', v_cash,
    'debt_credit', v_credit
  );
end $$;
revoke all on function public.inv_create_return_note(uuid,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.inv_create_return_note(uuid,jsonb,jsonb,uuid) to authenticated, service_role;

-- ---------- 3b. Đồng bộ lại công nợ các đơn đã có phiếu trả ----------
-- v44 đổi công thức công nợ; các đơn đã trả hàng trước đây cần được tính lại
-- để khách không còn bị treo nợ của phần hàng đã trả. UPDATE này kích hoạt
-- orders_debt_after để điều chỉnh customers.debt theo chênh lệch.
do $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select o.id
      from public.orders o
     where exists (select 1 from public.return_notes rn where rn.order_id = o.id)
  loop
    update public.orders
       set debt_amount = public.order_debt_value(id, total, paid, status)
     where id = r.id;
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then
    raise notice 'v44: đã tính lại công nợ cho % đơn có phiếu trả.', v_count;
  end if;
end $$;

-- ---------- 4. Quản lý nhân viên ----------
-- Trigger v34 chặn đổi shop_id/role của người khác. RPC security definer mở
-- cờ transaction-local để chuyển một profile sang shop khác; client không gọi
-- được set_config qua PostgREST nên không tự mở cờ được.
create or replace function public.profiles_protect_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('piopio.allow_profile_move', true) = '1' then
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  if (exists(select 1 from public.shops s where s.owner_id=auth.uid() and s.id=old.shop_id)
      or exists(select 1 from public.shops s where s.owner_id=auth.uid() and s.id=new.shop_id))
     and (old.shop_id is null or exists(
       select 1 from public.shops s where s.owner_id=auth.uid() and s.id=old.shop_id))
     and (new.shop_id is null or exists(
       select 1 from public.shops s where s.owner_id=auth.uid() and s.id=new.shop_id)) then
    return new;
  end if;
  if old.id=auth.uid() then
    if new.id is distinct from old.id or new.shop_id is distinct from old.shop_id
       or new.role is distinct from old.role or new.permissions is distinct from old.permissions then
      raise exception 'Bạn không thể tự thay đổi vai trò, cửa hàng hoặc quyền.';
    end if;
    return new;
  end if;
  raise exception 'Bạn không có quyền sửa hồ sơ này.';
end;
$$;

create or replace function public._staff_role_presets(p_role text)
returns jsonb
language sql
immutable
as $$
  select case p_role
    when 'manager'   then '{"sell":true,"inventory":true,"money":true,"report":true,"crm":true}'::jsonb
    when 'picker'    then '{"sell":true,"inventory":true,"money":false,"report":false,"crm":false}'::jsonb
    when 'accountant' then '{"sell":true,"inventory":false,"money":true,"report":true,"crm":false}'::jsonb
    else '{"sell":true,"inventory":true,"money":false,"report":false,"crm":false}'::jsonb
  end;
$$;
revoke all on function public._staff_role_presets(text) from public, anon, authenticated;

create or replace function public.inv_add_shop_member(
  p_shop uuid, p_email text, p_role text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := coalesce(nullif(trim(p_role), ''), 'staff');
  v_uid uuid;
  v_profile public.profiles%rowtype;
  v_name text;
begin
  if not exists (select 1 from public.shops where id = p_shop and owner_id = auth.uid()) then
    raise exception 'Chỉ chủ cửa hàng được thêm nhân viên.';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Email nhân viên không hợp lệ.';
  end if;
  if v_role not in ('manager', 'picker', 'accountant', 'staff') then
    raise exception 'Vai trò không hợp lệ.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('member:' || p_shop::text || ':' || v_email, 0));

  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
  if v_uid is null then
    raise exception 'Chưa có tài khoản với email này. Nhân viên cần tự đăng ký trước, rồi chủ cửa hàng thêm vào.';
  end if;
  if v_uid = auth.uid() then
    raise exception 'Bạn không thể tự thêm chính mình.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Tài khoản này chưa có hồ sơ. Yêu cầu nhân viên đăng nhập một lần rồi thử lại.';
  end if;
  if v_profile.shop_id = p_shop then
    raise exception 'Người này đã là thành viên của cửa hàng.';
  end if;

  -- Không để nhân viên mất dữ liệu riêng: chỉ nhận tài khoản chưa phát sinh
  -- nghiệp vụ ở cửa hàng của chính họ.
  if exists (
    select 1 from public.shops s
     where s.owner_id = v_uid and s.id <> p_shop
       and (exists (select 1 from public.products pr where pr.shop_id = s.id)
            or exists (select 1 from public.orders o where o.shop_id = s.id)
            or exists (select 1 from public.customers c where c.shop_id = s.id))
  ) then
    raise exception 'Tài khoản này đã có dữ liệu ở cửa hàng riêng. Không thể chuyển sang làm nhân viên.';
  end if;

  perform set_config('piopio.allow_profile_move', '1', true);
  update public.profiles
     set shop_id = p_shop,
         role = v_role,
         permissions = public._staff_role_presets(v_role)
   where id = v_uid
   returning * into v_profile;
  perform set_config('piopio.allow_profile_move', '', true);

  v_name := coalesce(v_profile.full_name, split_part(v_email, '@', 1));
  return jsonb_build_object(
    'id', v_uid, 'full_name', v_name, 'role', v_role, 'email', v_email
  );
end $$;
revoke all on function public.inv_add_shop_member(uuid,text,text) from public, anon;
grant execute on function public.inv_add_shop_member(uuid,text,text) to authenticated, service_role;

create or replace function public.inv_remove_shop_member(
  p_shop uuid, p_profile uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not exists (select 1 from public.shops where id = p_shop and owner_id = auth.uid()) then
    raise exception 'Chỉ chủ cửa hàng được xoá nhân viên.';
  end if;
  if p_profile = auth.uid() then
    raise exception 'Bạn không thể tự xoá chính mình khỏi cửa hàng.';
  end if;
  if exists (select 1 from public.shops where id = p_shop and owner_id = p_profile) then
    raise exception 'Không thể xoá chủ cửa hàng.';
  end if;

  select * into v_profile from public.profiles where id = p_profile and shop_id = p_shop;
  if not found then
    raise exception 'Người này không thuộc cửa hàng.';
  end if;

  perform set_config('piopio.allow_profile_move', '1', true);
  update public.profiles
     set shop_id = null,
         role = 'staff',
         permissions = '{}'::jsonb
   where id = p_profile;
  perform set_config('piopio.allow_profile_move', '', true);
end $$;
revoke all on function public.inv_remove_shop_member(uuid,uuid) from public, anon;
grant execute on function public.inv_remove_shop_member(uuid,uuid) to authenticated, service_role;

insert into public.piopio_migrations(id) values ('v44_return_debt_staff')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;
