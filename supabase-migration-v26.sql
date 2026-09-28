-- =============================================================
-- PioPio - Migration v26: Báo cáo & Biểu đồ (server-side OLAP nhẹ)
-- =============================================================
-- Chạy trong Supabase Dashboard → SQL Editor.
-- Idempotent: dùng if not exists / create or replace.
--
-- Thiết kế (audit isale-report/AUDIT-REPORT.md):
--   * Toàn bộ aggregation chạy TRONG Postgres (RPC), không còn full-scan
--     client-side như Isale (`/trade/list` rỗng ngày).
--   * Đơn tính doanh thu: status NOT IN ('draft','quote','cancelled').
--   * Giá vốn (COGS) theo products.cost hiện tại (schema order_items chưa
--     snapshot cost — ghi rõ hạn chế này trên UI).
--   * Mọi mốc thời gian theo múi giờ 'Asia/Ho_Chi_Minh'.
--   * RLS: mọi RPC có guard is_shop_member(p_shop) (pattern
--     money_account_balances); bảng audit append-only.
--
-- LƯU Ý không xoá gì — chỉ tạo mới / replace function.
-- =============================================================

-- ---------- 1. Bảng audit xuất khẩu (P2 - append-only) ----------
create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,                       -- orders | products | customers | inventory | cohort | kpis
  params jsonb not null default '{}'::jsonb,
  rows bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists report_exports_shop_idx on public.report_exports (shop_id, created_at desc);

alter table public.report_exports enable row level security;

drop policy if exists "report exports read" on public.report_exports;
create policy "report exports read" on public.report_exports
  for select using (public.is_shop_member(shop_id));

drop policy if exists "report exports insert" on public.report_exports;
create policy "report exports insert" on public.report_exports
  for insert with check (
    public.is_shop_member(shop_id) and user_id = auth.uid()
  );
-- (không tạo policy update/delete => append-only đúng nghĩa audit log)

-- ---------- 2. Index phục vụ aggregation ----------
create index if not exists order_items_product_idx on public.order_items (product_id);
create index if not exists orders_shop_status_created_idx on public.orders (shop_id, status, created_at);

-- ---------- 3. Guard dùng chung ----------
-- PostgREST expose mọi hàm public => mỗi hàm phải tự kiểm tra quyền thành viên
-- trước khi trả dữ liệu. Định nghĩa TRƯỚC các hàm language sql (bị parse full
-- ngay lúc CREATE nên phụ thuộc phải tồn tại sẵn).
create or replace function public._report_assert_member(p_shop uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;
end;
$$;

-- ---------- 4. Helper: tổng hợp 1 cửa sổ thời gian ----------
create or replace function public._report_window_totals(p_shop uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- Guard (hàm SQL nhiều statement: statement đầu chạy rồi bỏ kết quả)
  select public._report_assert_member(p_shop);

  with win as (
    select (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_from,
           ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_to
  ),
  eligible as (
    select o.id, o.total, o.discount, o.paid, o.created_at
    from orders o, win
    where o.shop_id = p_shop
      and o.created_at >= win.ts_from
      and o.created_at <  win.ts_to
      and o.status not in ('draft', 'quote', 'cancelled')
  ),
  ord as (
    select count(*)::bigint as orders,
           coalesce(sum(total), 0)::numeric as revenue,
           coalesce(sum(discount), 0)::numeric as discount,
           coalesce(sum(case when paid then total else 0 end), 0)::numeric as paid_total,
           count(*) filter (where not paid)::bigint as unpaid_orders
    from eligible
  ),
  cogs as (
    select coalesce(sum(oi.qty * coalesce(p.cost, 0)), 0)::numeric as cogs
    from eligible e
    join order_items oi on oi.order_id = e.id
    left join products p on p.id = oi.product_id
  ),
  trx as (
    select coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0)::numeric as income,
           coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0)::numeric as expense
    from transactions t, win
    where t.shop_id = p_shop
      and t.occurred_at >= win.ts_from
      and t.occurred_at <  win.ts_to
  ),
  ret as (
    select coalesce(sum(r.total), 0)::numeric as returns_total,
           count(*)::bigint as returns_count
    from return_notes r, win
    where r.shop_id = p_shop
      and r.created_at >= win.ts_from
      and r.created_at <  win.ts_to
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'revenue', (select revenue from ord),
    'orders', (select orders from ord),
    'discount', (select discount from ord),
    'paid_total', (select paid_total from ord),
    'unpaid_orders', (select unpaid_orders from ord),
    'cogs', (select cogs from cogs),
    'profit', ((select revenue from ord) - (select cogs from cogs)),
    'income', (select income from trx),
    'expense', (select expense from trx),
    'returns_total', (select returns_total from ret),
    'returns_count', (select returns_count from ret)
  );
$$;

-- ---------- 5. KPI + Period-over-Period (P0 + P1) ----------
-- Trả về kỳ hiện tại, kỳ trước (cùng độ dài liền kề) và cùng kỳ năm trước.
create or replace function public.report_kpis(p_shop uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;
  if p_from > p_to then
    raise exception 'Khoảng ngày không hợp lệ (from > to).';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Khoảng ngày quá dài (tối đa 400 ngày).';
  end if;

  return jsonb_build_object(
    'current', public._report_window_totals(p_shop, p_from, p_to),
    'prev',    public._report_window_totals(p_shop, (p_from - (p_to - p_from + 1))::date, (p_from - 1)::date),
    'yoy',     public._report_window_totals(p_shop, (p_from - interval '1 year')::date, (p_to - interval '1 year')::date)
  );
end;
$$;

-- ---------- 6. Timeseries cho biểu đồ cột (P0) ----------
-- p_grain: 'day' | 'week' (thứ 2 ISO) | 'month'. Bucket rỗng vẫn trả về 0.
create or replace function public.report_timeseries(
  p_shop uuid, p_grain text, p_from date, p_to date
)
returns table (bucket date, revenue numeric, orders bigint, cogs numeric, profit numeric, income numeric, expense numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;
  if p_grain not in ('day', 'week', 'month') then
    raise exception 'grain phải là day | week | month.';
  end if;
  if p_from > p_to then
    raise exception 'Khoảng ngày không hợp lệ (from > to).';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Khoảng ngày quá dài (tối đa 400 ngày).';
  end if;

  return query
  with win as (
    select (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_from,
           ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_to
  ),
  series as (
    select generate_series(
             date_trunc(p_grain, p_from::timestamp),
             date_trunc(p_grain, p_to::timestamp),
             case p_grain
               when 'day'   then interval '1 day'
               when 'week'  then interval '1 week'
               else              interval '1 month'
             end
           )::date as b
  ),
  ord as (
    select date_trunc(p_grain, (o.created_at at time zone 'Asia/Ho_Chi_Minh'))::date as b,
           coalesce(sum(o.total), 0)::numeric as revenue,
           count(*)::bigint as orders
    from orders o, win
    where o.shop_id = p_shop
      and o.created_at >= win.ts_from
      and o.created_at <  win.ts_to
      and o.status not in ('draft', 'quote', 'cancelled')
    group by 1
  ),
  cog as (
    select date_trunc(p_grain, (o.created_at at time zone 'Asia/Ho_Chi_Minh'))::date as b,
           coalesce(sum(oi.qty * coalesce(p.cost, 0)), 0)::numeric as cogs
    from order_items oi
    join orders o on o.id = oi.order_id
    left join products p on p.id = oi.product_id
    cross join win
    where o.shop_id = p_shop
      and o.created_at >= win.ts_from
      and o.created_at <  win.ts_to
      and o.status not in ('draft', 'quote', 'cancelled')
    group by 1
  ),
  trx as (
    select date_trunc(p_grain, (t.occurred_at at time zone 'Asia/Ho_Chi_Minh'))::date as b,
           coalesce(sum(case when t.type = 'income' then t.amount else 0 end), 0)::numeric as income,
           coalesce(sum(case when t.type = 'expense' then t.amount else 0 end), 0)::numeric as expense
    from transactions t, win
    where t.shop_id = p_shop
      and t.occurred_at >= win.ts_from
      and t.occurred_at <  win.ts_to
    group by 1
  )
  select s.b,
         coalesce(o_.revenue, 0)::numeric,
         coalesce(o_.orders, 0)::bigint,
         coalesce(c.cogs, 0)::numeric,
         (coalesce(o_.revenue, 0) - coalesce(c.cogs, 0))::numeric,
         coalesce(t.income, 0)::numeric,
         coalesce(t.expense, 0)::numeric
  from series s
  left join ord o_ on o_.b = s.b
  left join cog c  on c.b  = s.b
  left join trx t  on t.b  = s.b
  order by s.b;
end;
$$;

-- ---------- 7. Drill-down: hóa đơn trong 1 ngày (P0) ----------
create or replace function public.report_orders_day(
  p_shop uuid, p_day date, p_limit int default 50, p_offset int default 0
)
returns table (id uuid, code text, customer_name text, status text, paid boolean,
               total numeric, discount numeric, created_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;

  return query
  with win as (
    select (p_day::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_from,
           ((p_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_to
  )
  select o.id, o.code, o.customer_name, o.status, o.paid, o.total, o.discount, o.created_at,
         count(*) over ()::bigint as total_count
  from orders o, win
  where o.shop_id = p_shop
    and o.created_at >= win.ts_from
    and o.created_at <  win.ts_to
    and o.status not in ('draft', 'quote', 'cancelled')
  order by o.created_at desc
  limit least(coalesce(nullif(p_limit, 0), 50), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------- 8. Top sản phẩm (P1) ----------
create or replace function public.report_top_products(
  p_shop uuid, p_from date, p_to date, p_limit int default 10, p_offset int default 0
)
returns table (product_id uuid, name text, unit text, qty numeric, revenue numeric,
               cogs numeric, profit numeric, orders bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;

  return query
  with win as (
    select (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_from,
           ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_to
  )
  select oi.product_id,
         min(oi.name)::text as name,
         min(p.unit)::text as unit,
         sum(oi.qty)::numeric as qty,
         sum(oi.total)::numeric as revenue,
         sum(oi.qty * coalesce(p.cost, 0))::numeric as cogs,
         (sum(oi.total) - sum(oi.qty * coalesce(p.cost, 0)))::numeric as profit,
         count(distinct o.id)::bigint as orders
  from order_items oi
  join orders o on o.id = oi.order_id
  left join products p on p.id = oi.product_id
  cross join win
  where o.shop_id = p_shop
    and o.created_at >= win.ts_from
    and o.created_at <  win.ts_to
    and o.status not in ('draft', 'quote', 'cancelled')
  group by oi.product_id
  -- ORDER BY dùng ordinal: tránh ambiguate với biến OUT plpgsql trùng tên
  order by 5 desc
  limit least(coalesce(nullif(p_limit, 0), 10), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------- 9. Top khách hàng (P1) ----------
create or replace function public.report_top_customers(
  p_shop uuid, p_from date, p_to date, p_limit int default 10, p_offset int default 0
)
returns table (customer_id uuid, name text, orders bigint, revenue numeric, last_order_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;

  return query
  with win as (
    select (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_from,
           ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_to
  )
  select o.customer_id,
         coalesce(max(o.customer_name), 'Khách lẻ')::text as name,
         count(*)::bigint as orders,
         sum(o.total)::numeric as revenue,
         max(o.created_at) as last_order_at
  from orders o, win
  where o.shop_id = p_shop
    and o.created_at >= win.ts_from
    and o.created_at <  win.ts_to
    and o.status not in ('draft', 'quote', 'cancelled')
  group by o.customer_id
  order by 4 desc
  limit least(coalesce(nullif(p_limit, 0), 10), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------- 10. Cohort giữ chân khách (P2) ----------
-- cohort_month: tháng đơn đầu tiên; month_n: số tháng kể từ cohort (0 = tháng đầu).
create or replace function public.report_cohort(p_shop uuid, p_months int default 12)
returns table (cohort_month date, month_n int, buyers bigint, revenue numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;

  return query
  with base as (
    select o.customer_id, o.total, o.created_at
    from orders o
    where o.shop_id = p_shop
      and o.customer_id is not null
      and o.status not in ('draft', 'quote', 'cancelled')
  ),
  first_o as (
    select customer_id,
           date_trunc('month', (created_at at time zone 'Asia/Ho_Chi_Minh'))::date as cm
    from base
    group by customer_id
  ),
  act as (
    select b.customer_id,
           date_trunc('month', (b.created_at at time zone 'Asia/Ho_Chi_Minh'))::date as am,
           count(*) as cnt,
           sum(b.total) as rev
    from base b
    group by 1, 2
  )
  select f.cm as cohort_month,
         ((extract(year from a.am) - extract(year from f.cm)) * 12
          + (extract(month from a.am) - extract(month from f.cm)))::int as month_n,
         count(distinct a.customer_id)::bigint as buyers,
         sum(a.rev)::numeric as revenue
  from act a
  join first_o f on f.customer_id = a.customer_id
  where f.cm >= date_trunc('month', now() - make_interval(months => greatest(coalesce(p_months, 12), 1)))::date
  -- GROUP BY / ORDER BY dùng ordinal để không đụng biến OUT plpgsql (month_n...)
  group by 1, 2
  order by 1, 2;
end;
$$;

-- ---------- 11. Tồn kho biến chuyển (P1) ----------
-- stock_now = products.stock (snapshot hiện tại).
-- sold/returned/received/transferred = phát sinh trong kỳ.
-- est_start (ước tính tồn đầu kỳ) = stock_now - received + sold - returned + transferred
--   (đúng nếu stock chỉ đổi bởi 4 luồng trên; kiểm kho thủ công (stock_counts)
--    sẽ làm ước tính lệch — ghi chú trên UI).
create or replace function public.report_inventory(p_shop uuid, p_from date, p_to date)
returns table (product_id uuid, name text, sku text, unit text,
               stock_now numeric, sold numeric, returned numeric,
               received numeric, transferred numeric, est_start numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;

  return query
  with win as (
    select (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_from,
           ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh') as ts_to
  ),
  sold as (
    select oi.product_id as pid, sum(oi.qty)::numeric as q
    from order_items oi
    join orders o on o.id = oi.order_id
    cross join win
    where o.shop_id = p_shop
      and o.created_at >= win.ts_from
      and o.created_at <  win.ts_to
      and o.status not in ('draft', 'quote', 'cancelled')
      and oi.product_id is not null
    group by 1
  ),
  rtn as (
    select (it->>'product_id')::uuid as pid,
           sum(coalesce(nullif(it->>'qty', '')::numeric, 0))::numeric as q
    from return_notes r, win
         , jsonb_array_elements(case when jsonb_typeof(r.items) = 'array' then r.items else '[]'::jsonb end) it
    where r.shop_id = p_shop
      and r.created_at >= win.ts_from
      and r.created_at <  win.ts_to
      and coalesce(it->>'product_id', '') <> ''
    group by 1
  ),
  rec as (
    select (it->>'product_id')::uuid as pid,
           sum(coalesce(nullif(it->>'qty', '')::numeric, 0))::numeric as q
    from received_notes r, win
         , jsonb_array_elements(case when jsonb_typeof(r.items) = 'array' then r.items else '[]'::jsonb end) it
    where r.shop_id = p_shop
      and r.created_at >= win.ts_from
      and r.created_at <  win.ts_to
      and coalesce(it->>'product_id', '') <> ''
    group by 1
  ),
  trn as (
    select (it->>'product_id')::uuid as pid,
           sum(coalesce(nullif(it->>'qty', '')::numeric, 0))::numeric as q
    from transfers r, win
         , jsonb_array_elements(case when jsonb_typeof(r.items) = 'array' then r.items else '[]'::jsonb end) it
    where r.shop_id = p_shop
      and r.created_at >= win.ts_from
      and r.created_at <  win.ts_to
      and coalesce(it->>'product_id', '') <> ''
    group by 1
  )
  select p.id,
         p.name,
         p.sku,
         p.unit,
         p.stock::numeric as stock_now,
         coalesce(s.q, 0)::numeric as sold,
         coalesce(r.q, 0)::numeric as returned,
         coalesce(rc.q, 0)::numeric as received,
         coalesce(t.q, 0)::numeric as transferred,
         (p.stock - coalesce(rc.q, 0) + coalesce(s.q, 0) - coalesce(r.q, 0) + coalesce(t.q, 0))::numeric as est_start
  from products p
  left join sold s on s.pid = p.id
  left join rtn r  on r.pid = p.id
  left join rec rc on rc.pid = p.id
  left join trn t  on t.pid = p.id
  where p.shop_id = p_shop
    and (coalesce(s.q, 0) <> 0 or coalesce(r.q, 0) <> 0
         or coalesce(rc.q, 0) <> 0 or coalesce(t.q, 0) <> 0 or p.stock <> 0)
  order by coalesce(s.q, 0) desc, p.name asc;
end;
$$;

-- ---------- 12. Ghi audit log xuất khẩu (P2) ----------
create or replace function public.report_log_export(p_shop uuid, p_kind text, p_params jsonb, p_rows bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền ghi log cửa hàng này.';
  end if;
  insert into report_exports (shop_id, user_id, kind, params, rows)
  values (p_shop, auth.uid(), left(p_kind, 40), coalesce(p_params, '{}'::jsonb), coalesce(p_rows, 0));
end;
$$;

-- ---------- 13. Xem log (chỉ member, sắp xếp mới nhất) ----------
create or replace function public.report_export_logs(p_shop uuid, p_limit int default 50)
returns table (id uuid, kind text, params jsonb, rows bigint, user_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop) then
    raise exception 'Bạn không có quyền xem cửa hàng này.';
  end if;
  return query
  select e.id, e.kind, e.params, e.rows, e.user_id, e.created_at
  from report_exports e
  where e.shop_id = p_shop
  order by e.created_at desc
  limit least(coalesce(nullif(p_limit, 0), 50), 200);
end;
$$;
