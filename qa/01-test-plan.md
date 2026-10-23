# QA TEST PLAN — Website Quản Lý Kho PioPio

- **Ngày:** 2026-10-23 (Asia/Ho_Chi_Minh)
- **Người phụ trách:** QA Lead / SDET (một người, đủ vai trò theo brief)
- **Mã nguồn:** `rumneit/Isale-Piopio`, nhánh `freebuff/8adbc358850df6f67320d216`, nền commit `cc20ae1`
- **Quyết định cuối:** xem `05-go-no-go.md` — **NO-GO** ở thời điểm bàn giao.

## 1. Mục tiêu

1. Đối chiếu 3 lớp **UI ↔ API/RPC ↔ Database** cho các luồng tiền – tồn – công nợ.
2. Tìm và sửa lỗi gốc rễ ở các luồng xương sống: tạo đơn → nhập/xuất kho → in bill → quản lý đơn → công nợ → báo cáo.
3. Chứng minh bằng bằng chứng chạy được (test tự động, SQL test, E2E có mock, build/lint/typecheck).
4. Khai báo trung thực mọi hạng mục **CHƯA TEST** và rủi ro còn lại.

## 2. Phạm vi

### Trong phạm vi

- Toàn bộ 91 khai báo route trong `src/app/app.routes.ts` (77 route nghiệp vụ + redirect/404/param).
- 60+ service/page lõi + 75 hàm SQL/RPC trong 42 migration.
- Các bảng: `orders`, `order_items`, `transactions`, `customers`, `customer_debt_ledger`, `money_accounts`, `products`, `inventory_ledger`, `received_notes`, `supplier_debts`, `return_notes`, `settings`, `profiles`, `shops`, `api_tokens`…
- Bảo mật ứng dụng: RBAC route/API, RLS, injection, XSS, CSV injection, upload, session.
- In ấn: template hóa đơn/phiếu, A5/A4/80mm, QR/barcode, tiếng Việt.
- Phi chức năng: hiệu năng tĩnh (bundle, truy vấn không phân trang), i18n, accessibility (mức code).

### Ngoài phạm vi / không thể thực hiện trong môi trường này

- Ghi/đọc dữ liệu thật trên Supabase production: **không có tài khoản test**; anon key chỉ trả 401.
- Đa trình duyệt/thiết bị thật (Safari/iOS/Android), máy in thật, máy quét mã thật.
- Backup/PITR, rate limit, WAF, CDN, log retention: thuộc cấu hình Supabase/Vercel, không có quyền truy cập.
- Tải đồng thời 2 người trên cùng đơn với DB thật (đã mô phỏng bằng khóa advisory + SQL test, chưa chạy production).
- Nộp thuế CyberLotus, gửi Zalo/SMS/Facebook, webhook SePay, gọi AI: cần backend/API key ngoài repo.

## 3. Môi trường & công cụ

| Thành phần | Giá trị |
|---|---|
| OS | Linux (Cloud VM), không có root |
| Node / npm | v24.21.0 / 11.19.0 |
| Framework | Angular 22.2.1 + Ionic 9 + Supabase JS 2.116 |
| DB test | PGlite (PostgreSQL WASM) — chạy nguyên văn v41 + v43 |
| Browser test | Chromium 153 (Playwright 1.63), `www/` production build |
| Backend test | Supabase giả lập ở tầng HTTP (route interception), fixture xác định |
| Dữ liệu | Fixture 1 shop, 1 owner, 1 staff, 1 sản phẩm, đơn 100.000 ₫; SQL seed riêng cho từng test |

**Hạn chế môi trường:** Chromium cần libnspr4/libnss3/fontconfig không có sẵn; đã tải gói `.deb` vào `/tmp/pwlibs`, đặt `LD_LIBRARY_PATH` và `FONTCONFIG_FILE=/tmp/fonts.conf`. Đây là workaround của VM, không phải thay đổi dự án.

## 4. Chiến lược (STLC)

| Giai đoạn | Cách thực hiện | Bằng chứng |
|---|---|---|
| 0. Phân tích | Đọc routes, 42 migration, 60+ service/page; vẽ luồng trạng thái đơn và bản đồ RBAC | `02-checklist.csv`, mục 6 |
| 1. Test plan | Tài liệu này | file này |
| 2. Thiết kế test | Phân vùng tương đương, biên, bảng quyết định, chuyển trạng thái, error guessing | `04-traceability.md` |
| 3. Môi trường & dữ liệu | PGlite + fixture HTTP + seed SQL | `qa/sql-integrity.test.mjs`, `qa/e2e-smoke.mjs` |
| 4. Smoke | Build, đăng nhập (render), bán hàng, báo cáo, RBAC | E2E 14/14 |
| 5. Functional | Ưu tiên luồng tiền–tồn–nợ; các module còn lại review mã + test đơn vị | Bug report |
| 6. Non-functional | Bundle/build, console, RBAC, injection, CSV, i18n tĩnh | Regression |
| 7. DB/API | Chạy v41+v43 trên PostgreSQL; kiểm tra bất biến bằng SQL | 17 assert |
| 8. Quản lý lỗi | Bug ID, phân loại P0–P3, sửa, retest | `03-bug-reports.md` |
| 9. Regression | test:ci, lint, tsc, build, SQL, E2E | `06-regression.md` |
| 10. UAT/Gate | Mô phỏng ngày vận hành ở mức dữ liệu; kết luận | `05-go-no-go.md` |

## 5. Tiêu chí bắt đầu / kết thúc

**Bắt đầu:** repo build được, có `package-lock.json`, test unit chạy được, có thể dựng HTTP fixture.

**Kết thúc (GO) — theo brief:**
- 0 lỗi P0, 0 lỗi P1 mở.
- 100% checklist PASS hoặc khai báo lý do CHƯA TEST.
- Mọi bug đã sửa được retest PASS; regression hành trình vàng PASS.
- Tiền – tồn – công nợ khớp 100% ở mọi lớp kiểm chứng được.

## 6. Rủi ro chính

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | Không có tài khoản/DB test → không kiểm chứng được RLS, số liệu thật | Cao | SQL test trên PostgreSQL; E2E mock; khai báo BLOCKED |
| R2 | Migration v43 chưa áp lên Supabase | Cao | Hướng dẫn áp dụng + rollback; frontend có fallback |
| R3 | Nghiệp vụ trả hàng/công nợ chưa có quy tắc sản phẩm | Cao | Đưa thành điều kiện NO-GO, đề xuất thiết kế |
| R4 | Dữ liệu production có thể đã lệch từ trước | Cao | Script đối soát SQL độc lập (mục 7 bug report) |
| R5 | Khác biệt môi trường (font, timezone, locale) | Trung bình | Ghi nhận, test ở VN timezone + fixture |
| R6 | Bundle lớn, danh sách không phân trang | Trung bình | Đo build; đề xuất pagination |

## 7. Dữ liệu test

- **Đơn 100.000 ₫**, CK 10%, VAT 5%, ship 20.000 → phải trả 115.000 ₫ (đã assert).
- **Đơn công nợ 100.000 ₫** → `customers.debt = 100.000`, `orders.debt_amount = 100.000`.
- **Thu nợ một phần 20.000 ₫** → nợ còn 80.000 ₫.
- **Trả hàng 3/5 rồi 2/5** → lần 3 bị chặn; giá hoàn lấy 100.000 từ đơn, không lấy 999.000 client gửi.
- **Xóa đơn đã thu tiền** → bị chặn; đơn nháp chưa phát sinh → xóa được.
- **Staff chỉ có quyền `money`** → `/sale`, `/shipments` phải chuyển về `/home`.

## 8. Bàn giao

`01-test-plan.md`, `02-checklist.csv`, `03-bug-reports.md`, `04-traceability.md`,
`05-go-no-go.md`, `06-regression.md`, `qa/sql-integrity.test.mjs`,
`qa/e2e-smoke.mjs`, `qa/evidence/*`, `supabase-migration-v43-order-money-integrity.sql`.
