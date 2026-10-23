# TRACEABILITY MATRIX & SYSTEM MAP — PioPio

## 1. Bản đồ kiến trúc

```
Angular 22 standalone (Ionic 9)  ──hash router──►  91 route khai báo
        │                                              │
        │ services (60+)                               │ guards
        ▼                                              ▼
Supabase JS ──► Auth / PostgREST / Storage      authGuard + permissionGuard
        │                                              │
        ▼                                              ▼
PostgreSQL: 75 hàm/RPC + 42 migration + RLS      permissions.ts (5 quyền, 5 vai trò)
        │
        ├── orders / order_items ──trigger──► inventory_ledger ──► products.stock
        ├── transactions ──trigger──► orders.debt_amount ──► customers.debt
        └── received_notes ──RPC──► ledger + expense + supplier_debts
```

### Vòng đời đơn (thực tế theo code)

```
draft / quote ──(setStatus)──► pending / processing / shipping / delivered / completed
      │                                   │
      │                                   └─ tính tồn + doanh thu + bắt buộc có khoản thu (v43)
      ├──► debt / ship_debt / consignment ── tính tồn, KHÔNG doanh thu, cộng công nợ
      └──► cancelled ── hoàn tồn, xóa khoản thu "Bán hàng", giảm công nợ
```

`_inv_stock_status` = mọi trạng thái trừ `draft`, `quote`, `cancelled` (tính tồn).
`_inv_is_billable_status` (v43) = trừ thêm `debt`, `ship_debt`, `consignment`.

### Bản đồ quyền

| Quyền | Route tiêu biểu | Ghi chú |
|---|---|---|
| `sell` | sale, order, returns, shipments, delivery, quote, trade, promotion, channels | v43 bổ sung shipments |
| `inventory` | product, received-note, transfer, stock-check, suppliers, import, scan | |
| `money` | money-account, debt, supplier-debts | |
| `report` | report/* | |
| `crm` | contact, crm/*, note, calendar, activity-log | |
| `owner` (không cấp cho staff) | permission, config, integrations, external-api, custom-table, shipping-partners, cyberlotus-tax | fail-closed |

## 2. Ma trận yêu cầu ↔ kiểm thử ↔ lỗi

| Yêu cầu (brief) | Checklist | Test/Bằng chứng | Bug |
|---|---|---|---|
| 5.1 Đăng nhập/xuất, quên/đổi mật khẩu | A01–A06 | E2E E1, E13, E14; 4 unit test hash | BUG-12, BUG-16 |
| 5.1 Phân quyền từng nút/route, IDOR | A11–A16 | E2E E6; permissions.spec | BUG-09 |
| 5.1 Tạo/khóa nhân viên | A11 | SQL T10; tsc/lint/build | BUG-17 |
| 5.2 Dashboard | B01–B05 | code review | BUG-03 (báo cáo) |
| 5.3 Sản phẩm (CRUD, biến thể, giá, ảnh, Excel) | C01–C12 | code review + CSV test | OPEN-07 |
| 5.4 Nhập kho (atomic, một phần, NCC, hủy) | D01–D09 | code review | BUG-08 |
| 5.5 Tạo đơn (tiền, CK, VAT, ship, double-click) | E01–E15 | E2E E2–E4, E15; SQL T1, T7–T9 | BUG-01, BUG-02, BUG-15 |
| 5.6 Vòng đời đơn & chuyển trạng thái | F01–F17 | SQL T1–T3; code | BUG-04, BUG-06, OPEN-05 |
| 5.7 Tồn kho (thực tế/giữ/về, kiểm kê, chuyển kho) | G01–G10 | code review | OPEN-04, OPEN-08 (FIFO) |
| 5.8 In bill (A4/A5/80mm, QR, tiếng Việt) | H01–H09 | 7 unit test; E2E render | BUG-13 |
| 5.9 Công nợ & thu chi (sai 1 đồng = P0) | I01–I13 | SQL T1–T3, T7–T9 | BUG-05, BUG-06, BUG-15 |
| 5.10 Khách hàng & NCC | J01–J06 | unit duplicate; code | — |
| 5.11 Báo cáo (doanh thu, lợi nhuận, tồn) | K01–K10 | E2E E5; code | BUG-03, OPEN-08 |
| 5.12 Hệ thống (tìm kiếm, thông báo, backup, log) | L01–L08 | code | OPEN-06, OPEN-09, OPEN-12 |
| 6 UI/UX/Frontend | M03–M06, M12–M16 | build/E2E | OPEN-10 |
| 6 Backend/API (validation server, race, transaction) | E01–E12, F01–F13 | SQL + code | BUG-01, BUG-04, BUG-06 |
| 6 SQL/DB (PK/FK/unique/kiểu tiền/index) | I13, G01 | schema review | BUG-10 (unique mã đơn) |
| 6 Bảo mật OWASP | A13–A14, M07–M11 | code + unit | BUG-09, BUG-11, OPEN-04, OPEN-06 |
| 6 Tương thích / đa ngôn ngữ | M13–M15 | chưa chạy | OPEN-08 |
| 7 Edge case (rỗng, emoji, 500 ký tự, 29/02…) | E02–E07, K05 | một phần | K05 NOT_TESTED |

## 3. Đường đi của một đồng tiền (đã kiểm chứng bằng SQL)

```
Tạo đơn 100.000 (completed, paid)
  orders.total=100.000, paid=true
  → trigger orders_debt_before: debt_amount = 0
  → inv_create_order recordIncome: transactions(income, "Bán hàng", 100.000)
  → khách.debt không đổi

Đổi sang Công nợ (v43)
  → paid=false, debt_amount=100.000
  → orders_nonbillable_after xóa income "Bán hàng"
  → customers.debt += 100.000

Thu nợ 20.000
  → transactions(income, "Thu nợ", 20.000, order_id)
  → transactions_debt_sync: debt_amount=80.000
  → orders_debt_after: customers.debt -= 20.000 → 80.000

Chuyển về Hoàn tất (v43)
  → paid=true, debt_amount=0, customers.debt -= 80.000
  → _inv_ensure_order_income: còn thiếu 80.000 → ghi income "Bán hàng" 80.000
  → sổ quỹ: 20.000 + 80.000 = 100.000; doanh thu 100.000
```

```
Trả hàng đơn ghi nợ 200.000 (v44)
  orders.total=300.000, net_paid=0, luỹ kế trả=200.000
  → cash_refund = min(200.000, max(0, 0 − (300.000−200.000))) = 0
  → debt_credit = 200.000 (chỉ hiển thị; công nợ tính theo total − hàng đã trả)
  → order_debt_value = 300.000 − 200.000 − 0 = 100.000
  → customers.debt: 300.000 → 100.000, không có giao dịch chi
```

Mọi bước trên có assert trong `qa/sql-integrity.test.mjs` (T1, T2, T7–T9).

## 4. Truy vết bug → file sửa

| Bug | File sửa chính |
|---|---|
| BUG-01 | `src/app/pages/sale/sale.page.ts`, `src/app/core/services/orders.service.ts` |
| BUG-02 | `src/app/pages/sale/sale.page.ts` |
| BUG-03 | `src/app/core/services/reports.service.ts` |
| BUG-04/05/06/07 | `supabase-migration-v43-order-money-integrity.sql`, `orders.service.ts`, `order-detail.page.ts`, `order-return.page.ts` |
| BUG-08 | `returns.service.ts`, `received-notes.service.ts`, 2 page |
| BUG-09 | `src/app/core/permissions.ts` + spec |
| BUG-10 | `src/app/core/utils/document-code.ts` + spec, v43 |
| BUG-11 | `src/app/core/services/csv-export.service.ts` + spec |
| BUG-12 | `config.page.ts`, `login.page.ts`, `permissions.page.ts` |
| BUG-13 | `invoice-template.service.ts` |
| BUG-14 | `order-return.page.html` |
| BUG-15 | `supabase-migration-v44-return-debt-staff.sql`, `returns.service.ts`, `order-return.page.*`, `returns.page.html` |
| BUG-16 | `main.ts`, `core/utils/recovery-link.ts` + spec, `pages/reset-password/*`, `app.routes.ts`, `login.page.ts` |
| BUG-17 | `supabase-migration-v44-return-debt-staff.sql`, `permissions.page.ts`, `auth.service.ts` |
