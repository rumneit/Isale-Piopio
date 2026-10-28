# REGRESSION REPORT — đợt 2 (sau v44)

Thời điểm: 2026-10-23 18:0x (Asia/Ho_Chi_Minh)
Phạm vi: toàn bộ thay đổi đợt 1 + đợt 2 (19 file sửa, 8 file mới, migration v43/v44).

## 1. Kết quả tổng hợp

| Hạng mục | Lệnh | Kết quả | Ghi chú |
|---|---|---|---|
| Typecheck | `npx tsc -p tsconfig.app.json --noEmit` | **PASS**, exit 0 | |
| Unit test | `npm run test:ci` | **71/71 PASS** (13 file) | +4 recovery-link; +8 test từ main sau hợp nhất |
| Lint | `npm run lint` | **PASS** — All files pass | |
| Build production | `npm run build` | **PASS**, exit 0 | 3 warning style budget + 2 CommonJS (P3) |
| SQL integrity | `node qa/sql-integrity.test.mjs` | **42/42 PASS** | PGlite; v44 chạy 2 lần |
| E2E UI | `node qa/e2e-smoke.mjs` | **24/24 PASS** | build `www/`, Chromium 153 |
| Probe DB thật | `node qa/probe-live.mjs` | **12/12 APPLIED** | v43-v48 đã áp; v46/v47/v48 đã introspect bằng SQL Editor |
| Legacy route audit | `npm run audit` | **KHÔNG HOÀN TẤT** | script cũ chờ 401/timeout; thay bằng E2E mục tiêu |
| Production smoke | `node qa/prod-smoke.mjs` | **7/7 PASS** | `quanlykhopiopio.vercel.app` |
| UAT DB thật (có đăng nhập) | `07-live-uat-runbook.md` | **CHƯA CHẠY** | cần phiên đăng nhập thật |

## 2. Chi tiết

### 2.1 Unit test

```
13 file, 71 test PASS — permissions, shipping, tax, invoice-template,
duplicate-detection, crm-deals, customer-tools, csv-export, document-code,
settings, postgrest-search, recovery-link (mới) và product-units (từ main).
+4 test recovery-link của đợt này; +8 test đơn vị/hoá đơn khi hợp nhất nhánh main.
Test Files 13 passed | Tests 71 passed
```

### 2.2 SQL integrity (PGlite)

```
T1  Đơn Công nợ → Hoàn tất: PASS (nợ 100 → 0; thu 0 → 100; debt_amount 0)
T2  Chuyển về còn nợ: PASS (expense 0; giữ Thu nợ 20; nợ 80)
T3  Xóa đơn đã thu tiền: PASS (bị chặn; đơn nháp xóa được)
T4  Trả hàng: PASS (giá gốc 300; chặn 3+3>5; trả nốt 2)
T5  Trả hàng đơn đã hủy: PASS (bị chặn)
T6  UPDATE trực tiếp orders bằng role authenticated: PASS (permission denied)
T7  Trả hàng đơn ghi nợ: PASS (hoàn mặt 0; bù nợ 200; nợ đơn/khách còn 100; không chi)
T8  Trả hàng đơn đã trả: PASS (hoàn mặt 100/lần; tổng chi 200; nợ 0)
T9  Đơn trả một phần: PASS (hoàn mặt 0; bù nợ 200; nợ về 0)
T10 Thêm/xoá nhân viên: PASS (shop/role/preset đúng; xoá về null + {}; chặn tài khoản có dữ liệu riêng)
42 passed, 0 failed
```

File: `qa/sql-integrity.test.mjs`. Chạy nguyên văn v41 → v43 → v44 (hai lần) trên schema tối thiểu
mô phỏng đúng quan hệ tiền–nợ–kho.

### 2.3 E2E UI (mock API)

```
E1  Login render: PASS
E2  Thêm SP → 100.000 ₫: PASS
E3  CK 10% + VAT 5% + ship 20.000 → 115.000 ₫: PASS
E4  Khách đưa 50.000 → chặn, 0 request: PASS
E5  Lần 1 lỗi 500 → lần 2 retry cùng nonce → 1 đơn: PASS
E6  Payload RPC đúng CK/VAT/ship: PASS
E7  Không lỗi console: PASS
E8  Báo cáo KPI 1.234.500 ₫: PASS
E9  Lợi nhuận gộp 734.500 ₫ từ server: PASS
E10 Không lỗi console báo cáo: PASS
E11 Staff money-only bị chặn /shipments: PASS
E12 Staff money-only bị chặn /sale: PASS
E13 Link recovery → URL chuẩn hoá, 2 ô mật khẩu, đổi xong về /login: PASS
E14 Link reset không token → báo lỗi + nút về đăng nhập: PASS
E15 Trả hàng đơn nợ → cảnh báo đúng, toast “giảm công nợ 200.000 ₫”, không nói hoàn mặt: PASS
24/24 passed
```

Ảnh: `qa/evidence/e2e-sale-total.png`, `e2e-report.png`, `e2e-sale.png`, `e2e-reset.png`,
`e2e-return-debt.png`. JSON: `qa/evidence/e2e-smoke.json`.

### 2.4 Build

Không lỗi biên dịch. Cảnh báo: `sale.page.scss` 17,57 kB, `product-edit` 9,62 kB,
`product-detail` 9,88 kB (budget 8 kB); `jsbarcode`/`handlebars` CommonJS → OPEN-10 (P3).

## 3. Hành trình vàng — trạng thái kiểm chứng

| Bước | Kiểm chứng | Kết quả |
|---|---|---|
| Đăng nhập | render form + guard | PASS (render); login thật BLOCKED |
| Quên/đặt lại mật khẩu | unit hash + E2E E13/E14 | PASS (UI); gửi email thật CHƯA TEST |
| Tạo đơn + tính tiền | E2E UI + payload | PASS |
| Chống đơn trùng khi retry | E2E nonce | PASS |
| Ghi thu/không ghi thu theo trạng thái | SQL T1/T2 | PASS |
| Trả hàng đơn nợ ↔ công nợ | SQL T7–T9 + E2E E15 | PASS (mô phỏng) |
| Nhập kho → tồn + NCC | code review | CODE (chưa chạy live) |
| In bill | unit template + E2E render | PARTIAL (chưa in thật) |
| Thu công nợ | SQL T2 | PASS |
| Hủy/xóa đơn | SQL T3 + code | PASS (DB); UI dùng RPC |
| Báo cáo cuối ngày | E2E KPI server | PASS (mock); DB thật BLOCKED |
| Thêm/xoá nhân viên | SQL T10 + build | PASS (DB); UI chưa bấm thử trên trình duyệt |
| Đối chiếu tồn kho | chưa chạy cùng DB thật | BLOCKED |

## 4. Việc phải chạy sau khi áp v44

1. `supabase-migration-v44-return-debt-staff.sql` trên staging → production (sau backup).
2. `node qa/probe-live.mjs` phải **12/12 APPLIED**; function body v46/v48 phải khớp kết quả introspection quản trị.
3. Deploy frontend; mở `/#/reset-password` xác nhận không 404.
4. Chạy `qa/07-live-uat-runbook.md`: R1–R7, 3 truy vấn đối soát 20/20/20, 4 vai trò, backup/restore.
5. Chạy lại E2E trên domain thật với tài khoản thật cho 3 luồng: bán → in → thu nợ; trả hàng đơn nợ;
   thêm/xoá nhân viên.

## 5. Bằng chứng production (2026-10-23 18:30 UTC)

- Push `cefb65c` lên `main`; Vercel auto-deploy; `index.html` đổi hash trong ~15 giây.
- Bundle `main-MVQAIBGU.js`: có `piopio-recovery-hash`; chunk nhân viên chứa `inv_add_shop_member`,
  chunk trả hàng chứa `cash_refund`/`debt_credit`/“giảm công nợ”.
- `qa/prod-smoke.mjs`: login render, guard `/home` → `/login`, route reset không 404,
  báo link hết hạn, trang 404 — 7/7, không lỗi console. Ảnh `prod-login.png`, `prod-reset.png`.
- Headers: HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.

## 6. Môi trường repro

```bash
npm ci
npm run test:ci && npm run lint && npm run build
npm i --no-save @electric-sql/pglite
node qa/sql-integrity.test.mjs
node qa/probe-live.mjs

# Chromium trong VM thiếu 12+ thư viện và font:
npx playwright install chromium
# tải .deb vào /tmp/pwlibs (danh sách trong 00-README), giải nén, rồi:
FONTCONFIG_FILE=/tmp/fonts.conf \
LD_LIBRARY_PATH=/tmp/pwlibs/root/usr/lib/x86_64-linux-gnu:/tmp/pwlibs/root/lib/x86_64-linux-gnu \
node qa/e2e-smoke.mjs
```

`@electric-sql/pglite` cài `--no-save`, không đổi `package.json`/lockfile.
