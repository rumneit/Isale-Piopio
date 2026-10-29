-- PioPio — v41: money account + order debt integrity
-- Chạy SAU v40 trong Supabase Dashboard > SQL Editor.
-- Mục tiêu:
--   1) Mọi giao dịch tự động (bán hàng, thu nợ, nhập hàng, trả hàng…) đều
--      thuộc một ví/tài khoản, để "Sổ tiền" không còn tổng 0.
--   2) Công nợ khách hàng tự đồng bộ theo đơn: paid=false hoặc còn thiếu tiền
--      sẽ xuất hiện trong công nợ; thu đủ/đánh dấu đã trả sẽ giảm nợ.
--   3) Giữ nguyên công nợ thủ công đã có; chỉ cộng thêm phần nợ từ đơn hàng.
-- An toàn: có bảng dấu migration để không cộng trùng khi chạy lại.

begin;

-- ---------------------------------------------------------------------------
-- 1. Cột mới (additive)
-- ---------------------------------------------------------------------------
alter table public.money_accounts
  add column if not exists is_default boolean not null default false;

alter table public.orders
  add column if not exists account_id uuid references public.money_accounts(id) on delete set null;

alter table public.orders
  add column if not exists debt_amount numeric(14,2) not null default 0;

-- Mỗi cửa hàng có đúng một ví mặc định. Nếu chưa có, chọn ví tạo sớm nhất.
with ranked as (
  select id, shop_id,
         row_number() over (partition by shop_id order by created_at, id) as rn,
         bool_or(is_default) over (partition by shop_id) as has_default
  from public.money_accounts
)
update public.money_accounts m
   set is_default = true
  from ranked r
 where m.id = r.id
   and r.rn = 1
   and not r.has_default;

-- Dọn dữ liệu cũ nếu có nhiều hơn một ví mặc định.
with ranked as (
  select id, shop_id,
         row_number() over (partition by shop_id order by created_at, id) as rn
  from public.money_accounts
  where is_default = true
)
update public.money_accounts m
   set is_default = false
  from ranked r
 where m.id = r.id
   and r.rn > 1;

create unique index if not exists money_accounts_one_default_per_shop
  on public.money_accounts(shop_id)
  where is_default = true;

-- Gán ví mặc định cho đơn cũ chưa có ví.
update public.orders o
   set account_id = a.id
  from public.money_accounts a
 where o.account_id is null
   and a.shop_id = o.shop_id
   and a.is_default = true;

-- Chặn gắn khách hàng của shop khác vào đơn (IDOR dữ liệu).
create or replace function public.orders_customer_shop_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers
     where id = new.customer_id and shop_id = new.shop_id
  ) then
    raise exception 'Khách hàng không thuộc cửa hàng.';
  end if;
  return new;
end $$;

drop trigger if exists orders_customer_shop_guard on public.orders;
create trigger orders_customer_shop_guard
before insert or update of customer_id on public.orders
for each row execute function public.orders_customer_shop_guard();

-- ---------------------------------------------------------------------------
-- 2. Backfill account_id cho giao dịch cũ (trước khi bật trigger công nợ,
--    để việc backfill không làm thay đổi công nợ).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_account uuid;
begin
  for r in
    select t.id, t.shop_id,
           coalesce(o.account_id, a.id) as account_id
      from public.transactions t
      left join public.orders o on o.id = t.order_id
      left join public.money_accounts a
             on a.shop_id = t.shop_id and a.is_default = true
     where t.account_id is null
  loop
    v_account := r.account_id;
    if v_account is not null then
      -- transactions_guard chặn sửa giao dịch hệ thống; mở khóa đúng dòng.
      perform set_config('piopio.allow_order_tx', r.id::text, true);
      update public.transactions set account_id = v_account where id = r.id;
      perform set_config('piopio.allow_order_tx', '', true);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Công nợ đơn hàng (derived)
-- ---------------------------------------------------------------------------
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
  )
  select case
    when coalesce(p_status, '') in ('cancelled', 'quote') then 0::numeric
    when coalesce(p_paid, false) then 0::numeric
    when (select net from n) >= coalesce(p_total, 0) - 0.5 then 0::numeric
    else greatest(0::numeric, coalesce(p_total, 0) - greatest(0::numeric, (select net from n)))
  end;
$$;

-- Cập nhật debt_amount khi tổng/trạng thái/cờ thanh toán đổi.
create or replace function public.orders_debt_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Chỉ ép cờ thanh toán khi trạng thái ĐỔI. Nếu người dùng chỉ bấm "Đã trả"
  -- trên đơn công nợ thì vẫn cho phép (paid=true, còn nợ 0).
  if tg_op = 'INSERT' then
    if new.status in ('draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled') then
      new.paid := false;
    end if;
  elsif old.status is distinct from new.status then
    if new.status in ('draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled') then
      new.paid := false;
    elsif old.status in ('draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled') then
      new.paid := true;
    end if;
  end if;

  new.debt_amount := public.order_debt_value(new.id, new.total, new.paid, new.status);
  return new;
end $$;

-- Điều chỉnh công nợ khách hàng theo chênh lệch debt_amount.
create or replace function public.orders_debt_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old numeric := 0;
  v_new numeric := 0;
  v_delta numeric;
  v_balance numeric;
  v_note text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := coalesce(old.debt_amount, 0);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := coalesce(new.debt_amount, 0);
  end if;

  if tg_op = 'INSERT' then
    v_delta := v_new;
    if v_delta <> 0 and new.customer_id is not null then
      update public.customers
         set debt = greatest(0, coalesce(debt, 0) + v_delta)
       where id = new.customer_id and shop_id = new.shop_id
       returning debt into v_balance;
      if found then
        insert into public.customer_debt_ledger(
          shop_id, customer_id, type, amount, balance_after, note, created_by
        ) values (
          new.shop_id, new.customer_id, 'charge', v_delta, v_balance,
          'Đơn hàng ' || coalesce(new.code, new.id::text), auth.uid()
        );
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_old <> 0 and old.customer_id is not null then
      update public.customers
         set debt = greatest(0, coalesce(debt, 0) - v_old)
       where id = old.customer_id and shop_id = old.shop_id
       returning debt into v_balance;
      if found then
        insert into public.customer_debt_ledger(
          shop_id, customer_id, type, amount, balance_after, note, created_by
        ) values (
          old.shop_id, old.customer_id, 'payment', v_old, v_balance,
          'Xóa đơn ' || coalesce(old.code, old.id::text), auth.uid()
        );
      end if;
    end if;
    return old;
  end if;

  -- UPDATE: nếu đổi khách hàng, chuyển nợ từ khách cũ sang khách mới.
  if old.customer_id is distinct from new.customer_id then
    if v_old <> 0 and old.customer_id is not null then
      update public.customers
         set debt = greatest(0, coalesce(debt, 0) - v_old)
       where id = old.customer_id and shop_id = old.shop_id
       returning debt into v_balance;
      if found then
        insert into public.customer_debt_ledger(
          shop_id, customer_id, type, amount, balance_after, note, created_by
        ) values (
          old.shop_id, old.customer_id, 'payment', v_old, v_balance,
          'Chuyển công nợ đơn ' || coalesce(old.code, old.id::text), auth.uid()
        );
      end if;
    end if;
    if v_new <> 0 and new.customer_id is not null then
      update public.customers
         set debt = greatest(0, coalesce(debt, 0) + v_new)
       where id = new.customer_id and shop_id = new.shop_id
       returning debt into v_balance;
      if found then
        insert into public.customer_debt_ledger(
          shop_id, customer_id, type, amount, balance_after, note, created_by
        ) values (
          new.shop_id, new.customer_id, 'charge', v_new, v_balance,
          'Đơn hàng ' || coalesce(new.code, new.id::text), auth.uid()
        );
      end if;
    end if;
    return new;
  end if;

  v_delta := v_new - v_old;
  if v_delta <> 0 and new.customer_id is not null then
    v_note := case when v_delta > 0
      then 'Đơn hàng ' || coalesce(new.code, new.id::text)
      else 'Thanh toán đơn ' || coalesce(new.code, new.id::text) end;
    update public.customers
       set debt = greatest(0, coalesce(debt, 0) + v_delta)
     where id = new.customer_id and shop_id = new.shop_id
     returning debt into v_balance;
    if found then
      insert into public.customer_debt_ledger(
        shop_id, customer_id, type, amount, balance_after, note, created_by
      ) values (
        new.shop_id, new.customer_id,
        case when v_delta > 0 then 'charge' else 'payment' end,
        abs(v_delta), v_balance, v_note, auth.uid()
      );
    end if;
  end if;
  return new;
end $$;

-- Khi giao dịch của một đơn thay đổi, tính lại dư nợ đơn.
create or replace function public.transactions_debt_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.order_id is not null then
    update public.orders
       set debt_amount = public.order_debt_value(id, total, paid, status)
     where id = old.order_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.order_id is not null
     and (tg_op = 'INSERT' or new.order_id is distinct from old.order_id) then
    update public.orders
       set debt_amount = public.order_debt_value(id, total, paid, status)
     where id = new.order_id;
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Backfill công nợ một lần (có dấu migration chống cộng trùng)
-- ---------------------------------------------------------------------------
create table if not exists public.piopio_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.piopio_migrations enable row level security;
revoke all on table public.piopio_migrations from anon, authenticated;

do $$
begin
  if exists (select 1 from public.piopio_migrations where id = 'v41_order_debt_backfill') then
    return;
  end if;

  update public.orders
     set debt_amount = public.order_debt_value(id, total, paid, status);

  with agg as (
    select customer_id, sum(debt_amount) as amount
      from public.orders
     where customer_id is not null
       and debt_amount > 0
     group by customer_id
  )
  update public.customers c
     set debt = coalesce(c.debt, 0) + agg.amount
    from agg
   where c.id = agg.customer_id;

  -- Ghi sổ cái cho phần nợ vừa đồng bộ.
  insert into public.customer_debt_ledger(
    shop_id, customer_id, type, amount, balance_after, note, created_by
  )
  select c.shop_id, c.id, 'charge', agg.amount, c.debt,
         'Đồng bộ công nợ đơn hàng (v41)', null
    from public.customers c
    join (
      select customer_id, sum(debt_amount) as amount
        from public.orders
       where customer_id is not null and debt_amount > 0
       group by customer_id
    ) agg on agg.customer_id = c.id;

  insert into public.piopio_migrations(id) values ('v41_order_debt_backfill')
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Bật trigger (sau backfill)
-- ---------------------------------------------------------------------------
drop trigger if exists orders_debt_before on public.orders;
create trigger orders_debt_before
before insert or update of total, paid, status on public.orders
for each row execute function public.orders_debt_before();

drop trigger if exists orders_debt_after on public.orders;
create trigger orders_debt_after
after insert or update or delete on public.orders
for each row execute function public.orders_debt_after();

-- Khi đơn chuyển sang trạng thái không bán, chỉ xóa khoản thu tự sinh
-- (category Bán hàng), giữ lại khoản khách đã trả thực tế (category Thu nợ).
create or replace function public.orders_nonbillable_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.status in ('draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled')
     and (coalesce(old.paid, false) or old.status not in ('draft', 'quote', 'debt', 'ship_debt', 'consignment', 'cancelled')) then
    for r in
      select id from public.transactions
       where shop_id = new.shop_id
         and order_id = new.id
         and source = 'order'
         and category = 'Bán hàng'
    loop
      perform set_config('piopio.allow_order_tx', r.id::text, true);
      delete from public.transactions where id = r.id;
      perform set_config('piopio.allow_order_tx', '', true);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists orders_nonbillable_after on public.orders;
create trigger orders_nonbillable_after
after update of status on public.orders
for each row execute function public.orders_nonbillable_after();

drop trigger if exists transactions_debt_sync on public.transactions;
create trigger transactions_debt_sync
after insert or update or delete on public.transactions
for each row execute function public.transactions_debt_sync();

-- ---------------------------------------------------------------------------
-- 6. Ví mặc định + gán ví cho giao dịch
-- ---------------------------------------------------------------------------
create or replace function public.money_accounts_one_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update public.money_accounts
       set is_default = false
     where shop_id = new.shop_id
       and id <> new.id
       and is_default = true;
  end if;
  return new;
end $$;

drop trigger if exists money_accounts_one_default on public.money_accounts;
create trigger money_accounts_one_default
before insert or update of is_default on public.money_accounts
for each row execute function public.money_accounts_one_default();

create or replace function public.money_accounts_ensure_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bỏ qua các update lồng nhau do trigger one_default thực hiện, tránh
  -- đặt lại mặc định cũ trước khi dòng mới kịp ghi is_default=true.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if not exists (
    select 1 from public.money_accounts
     where shop_id = new.shop_id and is_default = true
  ) then
    update public.money_accounts
       set is_default = true
     where id = (
       select id from public.money_accounts
        where shop_id = new.shop_id
        order by created_at, id
        limit 1
     );
  end if;
  return new;
end $$;

drop trigger if exists money_accounts_ensure_default on public.money_accounts;
create trigger money_accounts_ensure_default
after insert on public.money_accounts
for each row execute function public.money_accounts_ensure_default();

drop trigger if exists money_accounts_ensure_default_update on public.money_accounts;
create trigger money_accounts_ensure_default_update
after update of is_default on public.money_accounts
for each row execute function public.money_accounts_ensure_default();

create or replace function public.money_accounts_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_default then
    update public.money_accounts
       set is_default = true
     where id = (
       select id from public.money_accounts
        where shop_id = old.shop_id
        order by created_at, id
        limit 1
     );
  end if;
  return old;
end $$;

drop trigger if exists money_accounts_after_delete on public.money_accounts;
create trigger money_accounts_after_delete
after delete on public.money_accounts
for each row execute function public.money_accounts_after_delete();

create or replace function public.transactions_default_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  v_account := new.account_id;

  if new.order_id is not null and not exists (
    select 1 from public.orders where id = new.order_id and shop_id = new.shop_id
  ) then
    raise exception 'Đơn hàng không thuộc cửa hàng.';
  end if;

  if v_account is null and new.order_id is not null then
    select account_id into v_account from public.orders where id = new.order_id;
  end if;
  if v_account is null then
    select id into v_account
      from public.money_accounts
     where shop_id = new.shop_id and is_default = true
     limit 1;
  end if;
  if v_account is null then
    select id into v_account
      from public.money_accounts
     where shop_id = new.shop_id
     order by created_at, id
     limit 1;
  end if;

  if v_account is not null and not exists (
    select 1 from public.money_accounts
     where id = v_account and shop_id = new.shop_id
  ) then
    raise exception 'Tài khoản không thuộc cửa hàng.';
  end if;

  new.account_id := v_account;
  return new;
end $$;

drop trigger if exists transactions_default_account on public.transactions;
create trigger transactions_default_account
before insert or update of account_id on public.transactions
for each row execute function public.transactions_default_account();

-- Khi đổi ví nhận tiền của đơn, gán lại cho các giao dịch cũ chưa có ví.
create or replace function public.orders_account_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.account_id is null then return new; end if;
  for r in
    select id from public.transactions
     where order_id = new.id and account_id is null
  loop
    perform set_config('piopio.allow_order_tx', r.id::text, true);
    update public.transactions set account_id = new.account_id where id = r.id;
    perform set_config('piopio.allow_order_tx', '', true);
  end loop;
  return new;
end $$;

drop trigger if exists orders_account_sync on public.orders;
create trigger orders_account_sync
after insert or update of account_id on public.orders
for each row execute function public.orders_account_sync();

-- ---------------------------------------------------------------------------
-- 7. Thu nợ khách hàng: ưu tiên phân bổ vào các đơn còn nợ, phần dư mới trừ
--    công nợ thủ công. Nhờ vậy không xóa mất nợ đơn đang có.
-- ---------------------------------------------------------------------------
create or replace function public.crm_adjust_customer_debt(
  p_shop uuid, p_customer_id uuid, p_type text, p_amount numeric, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_balance numeric;
  v_remaining numeric;
  v_alloc numeric;
  r record;
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Không có quyền cập nhật công nợ.';
  end if;
  if p_type not in ('charge', 'payment', 'adjustment') or p_amount is null or p_amount <= 0 then
    raise exception 'Dữ liệu công nợ không hợp lệ.';
  end if;

  select * into v_customer
    from public.customers
   where id = p_customer_id and shop_id = p_shop and deleted_at is null
   for update;
  if not found then raise exception 'Không tìm thấy khách hàng.'; end if;

  if p_type = 'payment' then
    if p_amount > coalesce(v_customer.debt, 0) + 0.5 then
      raise exception 'Số tiền thu vượt quá dư nợ hiện tại.';
    end if;
    v_remaining := p_amount;

    -- Tạo giao dịch thu nợ gắn với từng đơn còn nợ; trigger công nợ sẽ tự
    -- giảm debt_amount và customers.debt.
    for r in
      select id, code, debt_amount
        from public.orders
       where shop_id = p_shop
         and customer_id = p_customer_id
         and debt_amount > 0
       order by created_at, id
    loop
      exit when v_remaining <= 0;
      v_alloc := least(v_remaining, r.debt_amount);
      insert into public.transactions(
        shop_id, type, category, amount, note, occurred_at,
        order_id, source, payment_type, client_nonce
      ) values (
        p_shop, 'income', 'Thu nợ', v_alloc,
        coalesce(nullif(trim(p_note), ''), 'Thu nợ đơn ' || r.code),
        now(), r.id, 'debt', 'CASH', 'debt-pay:' || gen_random_uuid()::text
      );
      v_remaining := v_remaining - v_alloc;
    end loop;

    if v_remaining > 0 then
      update public.customers
         set debt = greatest(0, coalesce(debt, 0) - v_remaining),
             last_activity = now()
       where id = p_customer_id
       returning debt into v_balance;
      insert into public.customer_debt_ledger(
        shop_id, customer_id, type, amount, balance_after, note, created_by
      ) values (
        p_shop, p_customer_id, 'payment', v_remaining, v_balance,
        coalesce(nullif(trim(p_note), ''), 'Thu nợ thủ công'), auth.uid()
      );
    else
      select debt into v_balance from public.customers where id = p_customer_id;
    end if;
  else
    v_balance := coalesce(v_customer.debt, 0) + p_amount;
    update public.customers
       set debt = v_balance, last_activity = now()
     where id = p_customer_id;
    insert into public.customer_debt_ledger(
      shop_id, customer_id, type, amount, balance_after, note, created_by
    ) values (
      p_shop, p_customer_id, p_type, p_amount, v_balance,
      coalesce(nullif(trim(p_note), ''), 'Điều chỉnh công nợ'), auth.uid()
    );
  end if;

  return jsonb_build_object('balance', v_balance);
end $$;

grant execute on function public.crm_adjust_customer_debt(uuid, uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. inv_create_order: nhận account_id từ màn Bán hàng
-- ---------------------------------------------------------------------------
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
  v_discount numeric;
  v_ship numeric;
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

  v_discount := greatest(0, coalesce(nullif(p_order->>'discount', '')::numeric, 0));
  v_ship := greatest(0, coalesce(nullif(p_order->>'ship_fee', '')::numeric, 0));
  v_total := coalesce(nullif(p_order->>'total', '')::numeric,
    (select sum((x->>'price')::numeric * (x->>'qty')::numeric) from jsonb_array_elements(p_items) x)
      - v_discount + case when coalesce((p_order->>'ship_fee_by_customer')::boolean, true) then v_ship else 0 end);
  if v_total < 0 or v_total >= 1e13 then raise exception 'Tổng tiền không hợp lệ.'; end if;

  insert into public.orders(
    shop_id, code, customer_id, customer_name, status, total, discount, paid, note,
    channel_id, payment_method, ship_fee, ship_fee_by_customer, customer_phone,
    customer_address, shipping_code, shipping_partner, shipper_name, shipper_phone,
    shipping_address, idempotency_key, account_id
  ) values (
    p_shop, nullif(trim(p_order->>'code'), ''), nullif(p_order->>'customer_id', '')::uuid,
    nullif(trim(p_order->>'customer_name', ''), ''), coalesce(nullif(p_order->>'status', ''), 'completed'),
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

grant execute on function public.inv_create_order(uuid,jsonb,jsonb,uuid,boolean) to authenticated;

-- Đổi ví nhận tiền của đơn (dùng cho màn Sửa đơn; nhân viên bán hàng không
-- nhất thiết có quyền UPDATE trực tiếp bảng orders).
create or replace function public.inv_set_order_account(
  p_shop uuid, p_order_id uuid, p_account uuid
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_permission(p_shop, 'sell') then
    raise exception 'Bạn không có quyền sửa đơn hàng.';
  end if;
  if p_account is not null and not exists (
    select 1 from public.money_accounts where id = p_account and shop_id = p_shop
  ) then
    raise exception 'Tài khoản nhận tiền không thuộc cửa hàng.';
  end if;
  update public.orders
     set account_id = p_account
   where id = p_order_id and shop_id = p_shop;
  if not found then raise exception 'Không tìm thấy đơn hàng.'; end if;
end $$;

grant execute on function public.inv_set_order_account(uuid, uuid, uuid) to authenticated;

-- Nạp lại schema cache PostgREST.
notify pgrst, 'reload schema';

commit;
