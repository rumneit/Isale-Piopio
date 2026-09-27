-- =============================================================
-- PioPio - Migration v23: Nang cap Vay/No (loans) dong bo ISale
--   - loans.type: mo rong 2 -> 6 gia tri (giu 2 gia tri cu)
--       'borrowed'   = Ban da vay     (ban no; khi tra  -> tien ra)
--       'lent'       = Da vay ban     (ho no;  khi tra  -> tien vao)
--       'payable'    = No phai tra    (ban no NCC; tra  -> tien ra)
--       'receivable' = No cua khach   (khach no; tra    -> tien vao)
--   - them cot: interest_rate (lai suat %), maturity_date (ngay den han),
--               category (muc)
-- =============================================================
-- Chay trong Supabase Dashboard > SQL Editor > New query
-- An toan chay lai (idempotent).
-- =============================================================

alter table public.loans drop constraint if exists loans_type_check;
alter table public.loans add constraint loans_type_check
  check (type in ('loan', 'debt', 'borrowed', 'lent', 'payable', 'receivable'));

alter table public.loans add column if not exists interest_rate numeric(6, 2);
alter table public.loans add column if not exists maturity_date timestamptz;
alter table public.loans add column if not exists category text;
