# RELEASE GATE — GO / NO-GO

**Cập nhật:** 2026-10-23 (đợt 2)
**Phiên bản:** nhánh `freebuff/8adbc358850df6f67320d216`, nền `main` + sửa QA + **migration v44**
**Quyết định: NO-GO** — P0/P1 đã đóng trong mã, nhưng **v44 chưa được áp lên DB** và **UAT tiền–tồn–nợ
trên dữ liệu thật chưa chạy**. Không thể ký GO khi hành vi production vẫn là bản cũ.

## 1. Trạng thái từng điều kiện GO

| # | Điều kiện | Thực tế | Đạt? |
|---|---|---|---|
| 1 | Không còn P0 | BUG-15 (trả hàng đơn nợ chi tiền mặt) đã sửa bằng v44 + SQL T7–T9 + E2E E9. **Chưa áp v44** nên production vẫn còn hành vi cũ. | ⏳ |
| 2 | Không còn P1 | BUG-16 (trang đặt lại mật khẩu) và BUG-17 (thêm/xoá nhân viên) đã có mã + test. Email recovery thật chưa gửi thử. | ✅ (code) |
| 3 | 100% checklist đã test hoặc khai báo lý do | 148 mục: 33 PASS, 15 PARTIAL, 66 CODE, 22 BLOCKED, 10 OPEN (P2/P3), 2 NOT_TESTED. Đã khai báo đủ; **66 mục mới chỉ đọc mã**. | ⚠️ |
| 4 | Mọi bug retest PASS | 17 bug đã sửa; 12 bug có test chạy lại PASS, 5 bug chỉ verify bằng build/typecheck (ghi PARTIAL). 9 vấn đề P2/P3 còn mở, không chặn GO. | ⚠️ |
| 5 | Regression hành trình vàng PASS | Unit 71/71, SQL 42/42, E2E 24/24, lint/tsc/build PASS. Chưa chạy trên DB thật. | ⚠️ |
| 6 | Tiền–tồn–công nợ khớp 100% | SQL chứng minh 10 nhóm kịch bản; **chưa đối soát 20 đơn + 20 phiếu nhập + 20 công nợ trên DB thật**. | ❌ |
| 7 | Hạ tầng an toàn | Chưa có bằng chứng backup/restore, PITR, rate limit, security headers. | ❌ |

## 2. Điểm chất lượng

| Loại | Đã sửa | Còn mở |
|---|---|---|
| P0 | 1 (BUG-15) | **0** |
| P1 | 8 (BUG-01→07, 16, 17) | **0** |
| P2 | 5 | 7 (OPEN-04…09, 11) |
| P3 | 2 | 2 (OPEN-10, 12) |

> 17 bug đã sửa. Các bug tiền–nợ chỉ có hiệu lực trên production **sau khi chạy v44** và deploy frontend.

## 3. Ba bước còn lại để GO (theo thứ tự)

1. **Áp migration v44** `supabase-migration-v44-return-debt-staff.sql` (sau backup).
   Xác nhận: `node qa/probe-live.mjs` → **8/8 APPLIED**.
2. **Deploy frontend** từ build hiện tại (`npm run build` → `www/`).
   Kiểm tra `/#/reset-password` mở được, không 404.
3. **Chạy `qa/07-live-uat-runbook.md`** trên staging rồi production:
   - R1–R7 (trả hàng ↔ công nợ) có ảnh + SQL;
   - 3 truy vấn đối soát 20/20/20 trả **0 dòng lệch**;
   - 4 vai trò, link reset, backup/restore.

Sau khi có 3 bằng chứng trên, QA ký GO. Không tuyên bố “không còn lỗi” trước đó.

## 4. Đã đạt trong đợt 2

- **P0 trả hàng ↔ công nợ:** tách `cash_refund` / `debt_credit`, công nợ đơn trừ hàng đã trả,
  chỉ hoàn tiền mặt phần đã thu; chi “Trả hàng” gắn đúng đơn.
- **Quên mật khẩu:** trang `/#/reset-password`, xử lý token hash trước khi router khởi tạo (kể cả hash lồng),
  báo link hết hạn, đổi xong đăng xuất.
- **Nhân sự:** thêm/xoá nhân viên theo email, preset quyền theo vai trò, chặn kéo tài khoản đã có dữ liệu riêng,
  ưu tiên đúng shop được gán cho nhân viên.
- **Bằng chứng mới:** 42 assert SQL (T7–T10), 24 assert E2E (E7–E9), 71 unit test, ảnh `e2e-reset.png`,
  `e2e-return-debt.png`.
- **Công cụ:** `qa/probe-live.mjs` kiểm tra migration trên DB thật; `qa/07-live-uat-runbook.md` để UAT.

## 5. Rủi ro còn lại (đã biết)

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Phiếu trả cũ trên đơn chưa thanh toán đã từng chi tiền mặt | P2 dữ liệu | v44 in `NOTICE` + truy vấn kiểm tra; cần rà tay các phiếu trước ngày áp v44 |
| Không gửi email mời nhân viên | P3 | Nhân viên tự đăng ký rồi chủ shop thêm |
| Không ban tài khoản ở `auth.users` | P3 | Xoá khỏi shop = thu hồi quyền dữ liệu shop |
| Chưa phân trang danh sách lớn | P2 | OPEN-07 |
| Timezone/tiền tệ hard-code | P2 | OPEN-08 |
| Direct PATCH `products.stock` | P2 | OPEN-04 |
| `inv_update_order_full` đụng “Thu nợ” | P2 | OPEN-05 |
| Chưa test WCAG/ma trận trình duyệt | P2 | OPEN-11 |

## 6. Ký duyệt

| Vai trò | Kết luận | Điều kiện |
|---|---|---|
| QA Lead | **NO-GO** | 3 bước mục 3 + kết quả đối soát 0 lệch |
| Release Manager | Chưa ký | Chờ QA re-gate |
| Product Owner | Đã chốt quy tắc trả hàng: hoàn mặt phần đã trả, bù nợ phần chưa trả | — |

> Kết luận dựa trên bằng chứng trong `qa/03-bug-reports.md`, `qa/06-regression.md` và `qa/07-live-uat-runbook.md`.
