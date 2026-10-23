# BUG REPORT — PioPio

Môi trường chung: Angular 22 + Ionic 9 + Supabase; nhánh `freebuff/8adbc358850df6f67320d216`; build production `www/`.
Bằng chứng chạy lại được: `qa/sql-integrity.test.mjs` (17 assert), `qa/e2e-smoke.mjs` (14 assert), `qa/evidence/*`.

Cập nhật đợt 2: thêm BUG-15→17 (v44). 17 bug đã sửa; 9 vấn đề còn mở (đều P2/P3, không chặn GO).

Quy ước: **P0** chặn ra mắt / sai tiền-tồn-nợ nghiêm trọng / sập; **P1** chức năng chính sai; **P2** phụ/UX/hiệu năng; **P3** nhỏ.

---

## ĐÃ SỬA & RETEST PASS

### BUG-01 — [Bán hàng] Retry sau lỗi mạng tạo đơn trùng, trừ tồn và ghi thu hai lần — P1

- **Tiền điều kiện:** giỏ có ≥1 sản phẩm; mạng chập chờn hoặc RPC trả 5xx sau khi server đã commit.
- **Bước:** 1) Bấm Lưu đơn. 2) Server xử lý nhưng client nhận lỗi/timeout. 3) Bấm Lưu lại.
- **Mong đợi:** lần 2 trả về đúng đơn đã tạo (idempotent), không tạo đơn/tồn/thu thứ hai.
- **Thực tế:** `OrdersService.create` sinh `crypto.randomUUID()` **mỗi lần gọi**
  (`orders.service.ts`, bản HEAD); màn Bán hàng không truyền `idempotencyKey`.
  Mỗi lần bấm Lưu là một nonce mới → đơn trùng, trừ tồn 2 lần, ghi thu 2 lần.
- **Bằng chứng:** E2E E4 giả lập 500 ở lần 1 rồi bấm lại; trước khi sửa hai request có nonce khác nhau.
  Sau khi sửa: `26f7e040-… / 26f7e040-…` (cùng nonce), `orderCreated=1`.
- **Nguyên nhân gốc:** nonce sinh ở tầng service thay vì gắn với “phiên lập đơn”.
- **Sửa:** thêm `nonce` ổn định vào `SaleOrderSnap`, giữ nguyên qua chuyển tab/retry, truyền `idempotencyKey`
  (`sale.page.ts`, `orders.service.ts`).
- **Retest:** PASS (E2E E4). **Regression:** tạo đơn mới vẫn nhận nonce mới (E2).

### BUG-02 — [Bán hàng] Khách đưa thiếu vẫn lưu đơn “đã thanh toán đủ” — P1

- **Bước:** 1) Đơn 115.000 ₫. 2) Nhập “Khách đưa” = 50.000. 3) Lưu.
- **Mong đợi:** chặn và hướng dẫn chọn Công nợ / thu phần thiếu.
- **Thực tế:** trước sửa, `customerPaid` chỉ dùng hiển thị “Tiền thừa”; `paid` lấy theo trạng thái
  nên đơn được ghi thu đủ 115.000 dù chỉ nhận 50.000.
- **Bằng chứng:** E2E E3; sau sửa không có request RPC nào được gửi (`rpc=0`) và toast nêu rõ số thiếu.
- **Sửa:** pre-flight toàn bộ lô đơn trước khi ghi; nếu `0 < khách đưa < phải trả` thì dừng.
- **Retest:** PASS (E2E E3). Lưu ý: thu một phần ngay khi bán vẫn chưa được hỗ trợ (P3, ngoài phạm vi đợt này).

### BUG-03 — [Báo cáo] Doanh thu cộng cả đơn Nháp/Báo giá/Đã hủy; “lợi nhuận gộp” trừ chi phí — P1

- **Bước:** 1) Tạo 1 đơn hoàn tất 1.000.000 và 1 đơn báo giá 5.000.000. 2) Mở Biểu đồ doanh thu / BC theo sản phẩm.
- **Mong đợi:** doanh thu 1.000.000 (khớp Dashboard và `report_kpis` v26).
- **Thực tế:** `getReport()` lấy mọi đơn trong kỳ, không lọc trạng thái; cộng cả báo giá/hủy/nháp
  → 6.000.000. Đồng thời `profit = revenue − expense` nhưng UI ghi “Lợi nhuận gộp (đơn)”.
  Danh sách bị cắt im lặng ở 2.000 đơn và 500 đơn cho top sản phẩm.
- **Bằng chứng:** `git show HEAD:src/app/core/services/reports.service.ts` dòng 85–166;
  E2E E5 hiển thị đúng KPI server 1.234.500 ₫ và lợi nhuận gộp 734.500 ₫ sau sửa.
- **Sửa:** ưu tiên RPC v26 (`report_kpis`, `report_timeseries`, `report_top_products`); fallback lọc
  `draft|quote|cancelled`, lấy đủ item theo lô 100, tính COGS từ `products.cost`.
- **Retest:** PASS (E2E E5). Tồn tại: fallback vẫn giới hạn 2.000 dòng nếu DB chưa có v26 (ghi PARTIAL).

### BUG-04 — [Đơn hàng] Đơn Công nợ → Hoàn tất xóa nợ nhưng không ghi khoản thu — P1

- **Bước:** 1) Tạo đơn trạng thái “Công nợ” 100.000 (khách A). 2) Đổi trạng thái sang “Hoàn tất”.
- **Mong đợi:** nợ A = 0 **và** sổ quỹ có khoản thu 100.000.
- **Thực tế:** trigger v41 đặt `paid = true` khi rời nhóm không phát sinh doanh thu
  (`supabase-migration-v41…sql:162-163`) nhưng không tạo giao dịch. SQL test T1 (đường cũ) chứng minh
  `sum(income)=0`, nợ về 0 → doanh thu và sổ quỹ lệch.
- **Bằng chứng:** `qa/sql-integrity.test.mjs` T1: “đường cũ: không có khoản thu nào: 0”.
- **Sửa:** migration v43 `inv_set_order_status` gọi `_inv_ensure_order_income` trong cùng transaction;
  frontend đổi trạng thái qua RPC (`OrdersService.setStatus`).
- **Retest:** PASS (T1: thu đủ 100, nợ 0, debt_amount 0).

### BUG-05 — [Đơn hàng] “Chuyển về còn nợ” tạo khoản CHI giả, làm sai lợi nhuận và số dư ví — P1

- **Bước:** 1) Đơn đã thu 100.000 (có giao dịch thu). 2) Bấm “Chuyển về còn nợ”.
- **Mong đợi:** đảo khoản thu của đơn; công nợ 100.000; không phát sinh chi phí.
- **Thực tế:** code cũ tạo expense category “Chi khác” 100.000 (`order-detail.page.ts` HEAD dòng 430–440).
  Khoản này bị tính vào báo cáo chi phí và trừ số dư ví, dù không có tiền ra khỏi quỹ.
- **Bằng chứng:** SQL T2 trước sửa có expense; sau sửa `expense=0`, giữ khoản “Thu nợ” 20.000, nợ 80.000.
- **Sửa:** RPC v43 `inv_set_order_paid(false)` xóa đúng khoản thu “Bán hàng”, giữ “Thu nợ”;
  UI bỏ tạo expense.
- **Retest:** PASS (T2).

### BUG-06 — [Đơn hàng] Xóa đơn đã thu tiền để lại giao dịch mồ côi — P1

- **Bước:** 1) Đơn hoàn tất đã ghi thu 100.000. 2) Xóa đơn.
- **Mong đợi:** chặn xóa (khuyến nghị dùng Hủy) hoặc đảo toàn bộ bút toán trong 1 transaction.
- **Thực tế:** `orders` bị xóa; FK `transactions.order_id on delete set null` biến giao dịch thành mồ côi:
  doanh thu theo đơn mất nhưng sổ quỹ vẫn còn 100.000. Xóa nhiều đơn còn tệ hơn.
- **Bằng chứng:** SQL T3 trước sửa xóa thành công; sau sửa bị chặn với thông báo rõ.
- **Sửa:** v43 `inv_delete_order` / `inv_delete_orders` chặn đơn có giao dịch hoặc phiếu trả;
  thu hồi `DELETE` trực tiếp; `OrdersService.remove/bulkRemove` gọi RPC.
- **Retest:** PASS (T3).

### BUG-07 — [Trả hàng] Trả vượt số đã mua, hoàn tiền theo giá client, trả được đơn đã hủy — P1

- **Bước:** 1) Đơn mua 5 sản phẩm giá 100.000. 2) Trả 3. 3) Trả tiếp 3. 4) Hoặc gửi `price=999.999`.
- **Mong đợi:** lần 3 bị chặn; tổng hoàn luôn theo giá gốc; không trả hàng cho đơn chưa từng trừ tồn.
- **Thực tế:** RPC v34 không kiểm tra số đã trả trước, nhận giá client, không kiểm tra trạng thái đơn
  → tồn kho và tiền hoàn có thể bị lạm dụng.
- **Bằng chứng:** SQL T4/T5. Trước sửa không có lỗi; sau sửa: tổng hoàn 300 (100×3, không phải 999×3),
  lần 3 bị chặn, đơn hủy bị chặn.
- **Sửa:** v43 thay `inv_create_return_note` (khóa theo đơn, lấy giá gốc, cộng dồn số đã trả, chặn trạng thái
  không tính tồn) + UI hiển thị số còn được trả.
- **Retest:** PASS (T4, T5).

### BUG-08 — [Trả hàng/Nhập kho] Retry tạo phiếu trùng — P2

- **Bước:** nhập kho/trả hàng, server lỗi sau commit, bấm Lưu lại.
- **Thực tế:** `crypto.randomUUID()` sinh mỗi lần gọi (`returns.service.ts:91`, `received-notes.service.ts:105`).
- **Sửa:** nonce ổn định theo phiếu đang lập (`order-return.page.ts`, `received-note-add.page.ts`).
- **Retest:** build/typecheck PASS; chưa có E2E cho 2 màn này (ghi PARTIAL).

### BUG-09 — [Bảo mật] `/shipments` không yêu cầu quyền — P2

- **Bước:** nhân viên chỉ có quyền `money` mở trực tiếp `/#/shipments`.
- **Mong đợi:** chuyển về `/home`.
- **Thực tế:** `ROUTE_PERMISSIONS` thiếu `shipments` → `permissionForRoute` trả `null` → mọi tài khoản đăng nhập đều vào được
  (dữ liệu địa chỉ/COD khách).
- **Bằng chứng:** E2E E6 sau sửa: URL `/#/home`.
- **Sửa:** `shipments: 'sell'` + unit test RBAC.
- **Retest:** PASS (E6, permissions.spec).

### BUG-10 — [Đơn hàng] Mã đơn 4 ký tự base36, không unique — P2

- **Bước:** tạo ~1.000 đơn/ngày; hoặc 2 client tạo cùng giây.
- **Mong đợi:** mã duy nhất trong shop.
- **Thực tế:** `Math.random().toString(36).slice(2,6)` = 1,68 triệu tổ hợp/ngày; xác suất trùng ~26%/ngày ở 1.000 đơn.
  Không có unique index trên `(shop_id, code)`.
- **Sửa:** `newDocumentCode` dùng 4 byte `crypto.getRandomValues` (8 hex) + unit test 5.000 mã;
  v43 tạo unique index có điều kiện (không phá dữ liệu đang trùng).
- **Retest:** PASS (unit 3 test; SQL v43 chạy trên DB sạch).

### BUG-11 — [Bảo mật] CSV injection khi xuất Excel — P2

- **Bước:** đặt tên khách `=cmd|' /C calc'!A0`, xuất CSV, mở bằng Excel.
- **Mong đợi:** ô được vô hiệu hóa công thức.
- **Thực tế:** chỉ escape `" , \n`; chuỗi bắt đầu `= + - @` được Excel thực thi.
- **Sửa:** `escapeCsvCell` thêm tiền tố `'`; test 3 case PASS.

### BUG-12 — [Cấu hình/Phân quyền] Báo “thành công” khi Supabase trả lỗi — P2

- **Vị trí:** `config.page.ts` (lưu shop, tên, đổi mật khẩu), `login.page.ts` (quên mật khẩu),
  `permissions.page.ts` (lưu quyền).
- **Nguyên nhân:** supabase-js trả `{ error }`, không throw; code cũ không đọc `error`.
- **Thực tế:** đổi mật khẩu thất bại (mật khẩu yếu, mất mạng) vẫn hiện “Đã đổi mật khẩu”;
  lưu quyền bị trigger chặn vẫn hiện “Đã lưu quyền”.
- **Sửa:** kiểm tra `error` và throw; UI hiển thị lỗi thật.
- **Retest:** tsc/lint/build PASS; chưa chạy live (BLOCKED).

### BUG-13 — [In bill] Số tiền bằng chữ sai từ 1.000 tỷ — P3

- **Thực tế:** mảng đơn vị chỉ tới `tỷ`; đơn 1.000.000.000.000 đọc thiếu nhóm.
- **Sửa:** thêm `nghìn tỷ`, `triệu tỷ`.
- **Retest:** code review; chưa có test số rất lớn (PARTIAL).

### BUG-14 — [Trả hàng] Ghi chú sai “trừ điểm tích lũy” — P3

- **Thực tế:** UI nói trừ điểm nhưng RPC trả hàng không đụng điểm; module điểm đã gỡ (v32).
- **Sửa:** đổi ghi chú cho đúng hành vi (tồn kho + giới hạn số trả). Retest: E2E render PASS.

---

## ĐÃ SỬA BỔ SUNG (đợt 2 — v44)

### BUG-15 — [Trả hàng ↔ Công nợ] Hoàn hàng đơn ghi nợ vẫn ghi chi tiền mặt, không giảm nợ — P0 (ĐÃ SỬA)

- **Bước:** 1) Bán chịu 3 món × 100.000 = 300.000 (trạng thái Công nợ). 2) Trả 2 món, bật “Hoàn tiền”.
- **Mong đợi:** không chi tiền mặt (khách chưa trả đồng nào); công nợ giảm 200.000, còn 100.000.
- **Thực tế trước sửa:** RPC v43 tạo expense “Trả hàng” đủ 200.000 và không đụng `orders.debt_amount` / `customers.debt`.
  Quỹ mất 200.000 trong khi khách vẫn nợ 300.000 → sai cả tiền lẫn nợ.
- **Nguyên nhân gốc:** RPC trả hàng không phân biệt phần khách đã trả và phần còn nợ; công nợ đơn chỉ tính
  `total − đã thu`, không trừ hàng đã trả.
- **Sửa (v44):**
  - thêm `return_notes.cash_refund` / `debt_credit`;
  - `order_debt_value` trừ luỹ kế hàng đã trả và cộng lại tiền hoàn mặt vào “đã trả”;
  - `inv_create_return_note` chỉ hoàn tiền mặt phần đã thu vượt giá trị hàng còn giữ, phần còn lại bù nợ;
  - giao dịch chi “Trả hàng” gắn `order_id` để báo cáo theo đơn khớp;
  - UI hiển thị rõ “chỉ hoàn tiền mặt phần khách đã trả”, toast nêu số hoàn mặt / số giảm nợ.
- **Bằng chứng:** SQL `qa/sql-integrity.test.mjs` T7 (nợ 300 → trả 200 → hoàn mặt 0, bù nợ 200, nợ còn 100),
  T8 (đơn đã trả: hoàn mặt đúng 100/lần, tổng chi 200), T9 (đơn trả một phần: hoàn mặt 0, nợ về 0).
  E2E E9: toast “giảm công nợ 200.000 ₫”, không có chữ “hoàn tiền mặt”. Ảnh `qa/evidence/e2e-return-debt.png`.
- **Retest:** PASS trên PostgreSQL (PGlite) + UI mock. **Chưa chạy trên DB thật** — xem runbook mục 2.

### BUG-16 — [Auth] Link quên mật khẩu không có màn hình đặt mật khẩu mới — P1 (ĐÃ SỬA)

- **Bước:** 1) Quên mật khẩu → nhận email. 2) Bấm link recovery.
- **Thực tế trước sửa:** không có route xử lý `type=recovery`; token nằm trong hash nên hash-router nuốt mất,
  người dùng vào /home mà không đổi được mật khẩu.
- **Sửa:**
  - `src/app/core/utils/recovery-link.ts` tách tham số khỏi hash (kể cả trường hợp Supabase nối thêm `#`
    sau `#/reset-password`);
  - `main.ts` chặn trước khi router/Supabase khởi tạo, lưu token vào sessionStorage rồi chuẩn hoá URL;
  - trang `/#/reset-password`: kiểm tra link hết hạn, nhập mật khẩu 2 lần, gọi `updateUser`, đăng xuất, về /login;
  - `resetPasswordForEmail` đổi `redirectTo` sang `/#/reset-password`.
- **Bằng chứng:** 4 unit test (`recovery-link.spec.ts`); E2E E7 (URL chuẩn hoá, 2 ô mật khẩu, đổi xong về /login)
  và E8 (link không token → báo lỗi rõ). Ảnh `qa/evidence/e2e-reset.png`.
- **Retest:** PASS ở tầng UI + logic hash. **Chưa gửi email thật** (phụ thuộc SMTP Supabase) — khai báo PARTIAL.

### BUG-17 — [Nhân sự] Không có luồng thêm/xoá nhân viên; mọi đăng ký đều thành owner — P1 (ĐÃ SỬA, còn hạn chế)

- **Thực tế trước sửa:** `handle_new_user` luôn tạo `role='owner'`; màn Phân quyền chỉ sửa quyền của profile
  đã có trong shop, không thêm/gán/xoá được ai.
- **Sửa (v44 + UI):**
  - RPC `inv_add_shop_member(shop,email,role)`: chỉ chủ shop gọi được; tìm tài khoản theo email;
    gán `shop_id`, vai trò và preset quyền; từ chối tài khoản đã có dữ liệu ở shop riêng;
  - RPC `inv_remove_shop_member`: thu hồi `shop_id`, role về staff, quyền rỗng; không xoá dữ liệu shop;
  - trigger `profiles_protect_privileges` chỉ mở cờ chuyển profile trong transaction của RPC;
  - `AuthService` ưu tiên shop được gán cho nhân viên (trước đây localStorage trỏ về shop rỗng của chính họ);
  - UI Phân quyền: nút “Thêm nhân viên” (email + vai trò) và nút xoá từng người, có xác nhận.
- **Bằng chứng:** SQL T10 (gán đúng shop/vai trò/preset; xoá về null + quyền rỗng; chặn tài khoản có dữ liệu riêng;
  báo đúng email chưa đăng ký). tsc/lint/build PASS.
- **Hạn chế còn lại (không chặn GO, ghi nhận P3):** không gửi email mời — nhân viên tự đăng ký rồi chủ shop thêm;
  không ban tài khoản ở tầng `auth.users` — xoá khỏi shop là thu hồi quyền truy cập dữ liệu shop.

## CÒN MỞ — KHÔNG CHẶN GO (theo dõi tiếp)

### OPEN-04 — [Kho] Có quyền `inventory` có thể PATCH thẳng `products.stock`, bỏ qua sổ cái — P2

- **Thực tế:** trigger `_inv_products_stock_watch` chỉ ghi audit, không chặn; RLS cho phép update products.
  Tồn kho và `inventory_ledger` có thể lệch mà không có phiếu.
- **Đề xuất:** thu hồi UPDATE cột `stock` (dùng view/RPC), hoặc trigger chặn khi không có cờ ledger.

### OPEN-05 — [Sửa đơn] `inv_update_order_full` sửa cả giao dịch “Thu nợ” của khách — P2

- **Thực tế:** khi đơn đã trả và tổng thay đổi, RPC chọn mọi `income source='order'` (gồm “Thu nợ” do
  khách trả từng phần) để tăng/giảm/xóa, làm sai lịch sử thu nợ.
- **Đề xuất:** chỉ điều chỉnh dòng `category='Bán hàng'`, giữ “Thu nợ” bất biến (áp dụng như v43 đã làm cho setPaid).

### OPEN-06 — [Bảo mật] API token & secrets lưu plaintext, chưa có verifier — P2

- **Thực tế:** `api_tokens.token` lưu nguyên giá trị, hiển thị lại trong UI; integration_settings lưu token
  nhà cung cấp. Chưa có Edge Function/worker xác thực token bên ngoài.
- **Ảnh hưởng:** rò rỉ token nếu DB/backup bị lộ; không nên marketing như “external API production”.

### OPEN-07 — [Hiệu năng] Danh sách không phân trang — P2

- `orders.service.list()` tải toàn bộ đơn; `sale.page` tải toàn bộ sản phẩm/khách; `reports` fallback 2.000 dòng.
  Với 50k–100k đơn, UI chậm/tràn RAM. Cần phân trang server như `products.listPaged`.

### OPEN-08 — [Toàn cầu hóa] Thời gian/tiền tệ hard-code — P2

- Báo cáo RPC dùng `Asia/Ho_Chi_Minh`; export CSV hard-code `+07:00`; format `vi-VN`; không có catalog dịch
  ngoài login. Chưa đạt yêu cầu “ra mắt toàn cầu” về locale/timezone.

### OPEN-09 — [Hạ tầng] Không có bằng chứng backup/PITR, tải, security headers — Gate

- Không có quyền Supabase/Vercel. Cần log backup + diễn tập restore, rate limit, CSP/HSTS, log retention.

### OPEN-10 — [UI] Vượt budget CSS, cảnh báo CommonJS — P3

- `sale.page.scss` 17,57 kB (budget 8 kB), product-edit 9,62 kB, product-detail 9,88 kB;
  `jsbarcode`, `handlebars` CommonJS → optimization bailout. Không chặn chức năng.

### OPEN-11 — [Accessibility] Chưa chứng minh WCAG 2.2 AA — P2

- Có service gán aria-label cho nút icon, nhưng chưa test screen reader/bàn phím toàn bộ; không tuyên bố AA.

### OPEN-12 — [Thông báo] Trạng thái “đã đọc” lưu theo shop, không theo user — P3

- Cùng máy, hai nhân viên dùng chung trình duyệt sẽ chia sẻ trạng thái đã đọc.

---

## ĐỐI SOÁT MẪU (theo yêu cầu brief)

Chưa thể lấy 20 đơn + 20 phiếu nhập + 20 công nợ thật vì **không có tài khoản/DB production**.
Thay thế đã thực hiện:
- 6 kịch bản SQL độc lập (17 assert) trên PostgreSQL thật (PGlite) cho tiền–nợ–xóa–trả hàng.
- 14 assert E2E trên UI build production với API giả lập xác định.
- Đối soát 3 lớp cho luồng bán: UI (115.000 ₫) ↔ payload RPC (`discount_percent=10`, `tax_percent=5`,
  `ship_fee=20.000`, `p_nonce`) ↔ công thức server v42/v43.
- **Chưa đối soát** UI ↔ DB thật: khai báo BLOCKED, không tuyên bố PASS.
