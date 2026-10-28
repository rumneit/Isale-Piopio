# QA Packet — PioPio (cập nhật 2026-10-23, đợt 2)

| File | Nội dung |
|---|---|
| `01-test-plan.md` | Phạm vi, môi trường, chiến lược STLC, tiêu chí GO, rủi ro |
| `02-checklist.csv` | 148 mục đã kiểm tra / khai báo CHƯA TEST (PASS/CODE/PARTIAL/OPEN/BLOCKED/NOT_TESTED) |
| `03-bug-reports.md` | **17 bug đã sửa** + 9 vấn đề còn mở (P2/P3), đủ bước tái hiện & bằng chứng |
| `04-traceability.md` | Bản đồ kiến trúc, vòng đời đơn, RBAC, ma trận yêu cầu ↔ test ↔ bug |
| `05-go-no-go.md` | **NO-GO** — còn 3 bước vận hành (áp v44, deploy, UAT thật) |
| `06-regression.md` | Lệnh và kết quả regression đợt 2, ảnh bằng chứng |
| `07-live-uat-runbook.md` | Runbook UAT + 3 truy vấn đối soát 20 đơn / 20 phiếu nhập / 20 công nợ |
| `sql-integrity.test.mjs` | **42 assert** tiền–nợ–tồn–trả hàng–nhân sự trên PostgreSQL thật (PGlite) |
| `e2e-smoke.mjs` | **24 assert** UI trên build production với API giả lập |
| `probe-live.mjs` | Kiểm tra RPC/schema v43-v45 trên DB thật (chỉ dùng anon key công khai); v46 cần admin/staging |
| `prod-smoke.mjs` | Smoke bản deploy production (login, guard, reset route, 404) |
| `evidence/` | Ảnh chụp + JSON kết quả E2E |

## Trạng thái bằng chứng

| Hạng mục | Kết quả |
|---|---|
| Typecheck / lint / build | PASS |
| Unit test | **71/71** (13 file) |
| SQL integrity (PGlite) | **42/42** (T1–T10; v44 chạy 2 lần để kiểm tra idempotent) |
| E2E UI (mock API) | **24/24** (E1–E9) |
| DB production | v43-v48 đã áp; probe public 12/12 APPLIED, v46/v47/v48 đã introspect bằng SQL Editor |
| Deploy production | **ĐÃ DEPLOY** — bundle mới + prod smoke 7/7 |
| UAT dữ liệu thật (có đăng nhập) | **CHƯA CHẠY** — dùng `07-live-uat-runbook.md` |

## Chạy lại

```bash
npm ci
npm run test:ci        # 71 unit test
npm run lint
npm run build

npm i --no-save @electric-sql/pglite
node qa/sql-integrity.test.mjs   # 42/42
node qa/probe-live.mjs           # trạng thái migration trên DB thật
node qa/prod-smoke.mjs           # smoke production (cần Chromium + libs như dưới)

npx playwright install chromium
FONTCONFIG_FILE=/tmp/fonts.conf \
LD_LIBRARY_PATH=/tmp/pwlibs/root/usr/lib/x86_64-linux-gnu:/tmp/pwlibs/root/lib/x86_64-linux-gnu \
node qa/e2e-smoke.mjs            # 24/24
```

> VM không có sẵn font/lib NSS. Cách dựng lại trong môi trường này:
> tải `libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libxcomposite1 libxdamage1 libxfixes3
> libxrandr2 libxkbcommon0 libasound2t64 libatspi2.0-0t64 libcups2t64 libxrender1 libxi6
> libavahi-client3 libavahi-common3` + `fonts-dejavu-core` bằng `apt-get download`, giải nén vào
> `/tmp/pwlibs/root`, và trỏ `FONTCONFIG_FILE` vào thư mục font DejaVu.
> Thiếu font thì chữ trong form không render (E2E fail oan), không phải lỗi ứng dụng.

## Migration cần áp

| File | Trạng thái |
|---|---|
| `supabase-migration-v43-order-money-integrity.sql` | **Đã áp** (probe 4/4 RPC v43 = APPLIED) |
| `supabase-migration-v44-return-debt-staff.sql` | **CHƯA ÁP** — bắt buộc trước khi GO |

Chưa áp v44 thì BUG-15 (trả hàng đơn ghi nợ chi tiền mặt) và BUG-17 (quản lý nhân viên) chưa có hiệu lực.
