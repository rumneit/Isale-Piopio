-- PioPio — kiểm tra sau khi chạy v41 (chỉ đọc, không sửa dữ liệu)
-- Chạy trong Supabase Dashboard > SQL Editor.

-- 1) Cấu trúc mới phải tồn tại
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'orders' and column_name in ('account_id', 'debt_amount'))
        or (table_name = 'money_accounts' and column_name = 'is_default'))
 order by table_name, column_name;

-- 2) Trigger mới phải được bật
select event_object_table, trigger_name, event_manipulation, action_timing
  from information_schema.triggers
 where trigger_schema = 'public'
   and trigger_name in (
     'orders_debt_before', 'orders_debt_after', 'transactions_debt_sync',
     'orders_nonbillable_after', 'orders_account_sync',
     'transactions_default_account', 'money_accounts_one_default',
     'money_accounts_ensure_default', 'money_accounts_after_delete'
   )
 order by event_object_table, trigger_name, event_manipulation;

-- 3) Không còn giao dịch thiếu ví (trừ shop chưa có ví nào)
select t.shop_id, count(*) as transactions_without_account
  from public.transactions t
 where t.account_id is null
 group by t.shop_id
 order by transactions_without_account desc;

-- 4) Số dư ví theo giao dịch (đối chiếu màn Sổ tiền)
select a.shop_id, a.name, a.is_default,
       a.balance as opening_balance,
       coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0) as movement,
       a.balance + coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0) as balance
  from public.money_accounts a
  left join public.transactions t on t.account_id = a.id and t.shop_id = a.shop_id
 group by a.id, a.shop_id, a.name, a.is_default, a.balance
 order by a.shop_id, a.created_at;

-- 5) Đơn còn nợ phải có debt_amount > 0 và khớp total - net đã thu
select o.shop_id, o.code, o.status, o.paid, o.total, o.debt_amount,
       coalesce(sum(case when t.type = 'income' then t.amount
                         when t.type = 'expense' then -t.amount else 0 end), 0) as net_collected,
       greatest(0, o.total - greatest(0, coalesce(sum(case when t.type = 'income' then t.amount
                                                          when t.type = 'expense' then -t.amount else 0 end), 0))) as expected_debt
  from public.orders o
  left join public.transactions t on t.order_id = o.id
 where o.status not in ('cancelled', 'quote')
 group by o.id
having o.debt_amount <> greatest(0, o.total - greatest(0, coalesce(sum(case when t.type = 'income' then t.amount
                                                                         when t.type = 'expense' then -t.amount else 0 end), 0)))
    or (o.paid and o.debt_amount <> 0)
 order by o.shop_id, o.created_at;

-- 6) Công nợ khách hàng phải bằng tổng nợ đơn + phần nợ thủ công.
--    (Không chênh lệch nghĩa là đồng bộ.)
select c.shop_id, c.id, c.name, c.debt,
       coalesce(sum(o.debt_amount), 0) as order_debt
  from public.customers c
  left join public.orders o on o.customer_id = c.id and o.debt_amount > 0
 where c.deleted_at is null
 group by c.id
having c.debt < coalesce(sum(o.debt_amount), 0) - 0.5
 order by c.shop_id, c.name;

-- 7) Ví mặc định: đúng một ví/shop
select shop_id, count(*) filter (where is_default) as default_accounts,
       count(*) as total_accounts
  from public.money_accounts
 group by shop_id
having count(*) > 0 and count(*) filter (where is_default) <> 1;

-- 8) Kiểm tra nhanh shop chính (PIOPIO)
select o.code, o.total, o.debt_amount, o.paid, o.status, c.name, c.debt
  from public.orders o
  left join public.customers c on c.id = o.customer_id
 where o.shop_id = 'bb17824d-e6dc-446a-9179-334ce16ef63f'
   and o.debt_amount > 0
 order by o.created_at;
