-- ============================================================================
-- PioPio v43 — Kiểm tra sau khi chạy migration bán hàng theo đơn vị
-- Chạy trong Supabase SQL Editor sau supabase-migration-v43-sale-units.sql.
-- ============================================================================

-- 1) Bốn cột metadata phải tồn tại.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'order_items'
   and column_name in ('unit', 'unit_qty', 'unit_conversion', 'unit_price')
 order by column_name;

-- 2) Không còn dòng cũ nào thiếu metadata (đơn cũ được backfill về đơn vị gốc).
select count(*) as missing_unit_metadata
  from public.order_items
 where unit_qty is null
    or unit_price is null
    or unit_conversion is null
    or unit_conversion <= 0;

-- 3) Các đơn bán theo đơn vị thay thế gần đây (unit_qty khác qty).
select o.code,
       o.created_at,
       oi.name,
       oi.qty              as base_qty,
       oi.price            as base_price,
       oi.total,
       oi.unit,
       oi.unit_qty,
       oi.unit_conversion,
       oi.unit_price
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
 where oi.unit_conversion is distinct from 1
    or (oi.unit_qty is not null and oi.unit_qty is distinct from oi.qty)
 order by o.created_at desc
 limit 30;

-- 4) Đối chiếu một đơn cụ thể: sửa mã đơn nếu cần.
-- select o.code, oi.name, oi.qty, oi.price, oi.total,
--        oi.unit, oi.unit_qty, oi.unit_conversion, oi.unit_price,
--        round(oi.qty * oi.price, 2) as expected_total,
--        round(oi.unit_qty * oi.unit_price, 2) as expected_unit_total
--   from public.order_items oi
--   join public.orders o on o.id = oi.order_id
--  where o.code = 'DH-261023-WUXC';
