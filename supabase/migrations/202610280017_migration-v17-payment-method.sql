-- ============================================================================
-- PioPio v17 — Hình thức thanh toán của đơn hàng (additive)
--
-- File gốc của migration này bị thiếu trong repository. Production đã có cột
-- orders.payment_method; v34/v40 cũng thêm cột này để phòng hờ. File này giữ
-- đúng lịch sử migration và bảo đảm fresh install có cột trước v18.
--
-- An toàn khi chạy lại nhiều lần.
-- ============================================================================

alter table public.orders add column if not exists payment_method text;
