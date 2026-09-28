# AUDIT: ISale «Quản lý công nợ» (/debt) → PioPio

Ngày audit: 27/09/2026 · Phương pháp: CDP vào Edge debug (read-only) + bóc tách JS chunks tĩnh
Session ISale: 0 khoản vay/nợ (tài khoản trống) → UI/Form/Flow lấy từ template compiled + i18n `assets/i18n/vn.json?v=v1.0.49`

## 1. Định tuyến & module ISale
- Menu home: handler `viewDebts` → `navigateRoot('/debt', {page:'debts'})`, icon hand-holding-usd, ẩn khi `!canCreateUpdateDebt`.
- Route `/debt` (list) — chunks 7489,6841,3064,9679,971,8592,159 · Route `/debt-report` (báo cáo) — chunks 4155,8592,4283.
- Chi tiết khoản nợ: `/change-history/debt/:id` (lịch sử thay đổi) từ action sheet detail.

## 2. Model dữ liệu (từ template compiled + i18n)
- Bảng backend: `debt` (hệ data-table chuẩn ISale: `table:"debt"`, `query`, `fieldsFromDb`, `hasCustomFields`).
- Trường (từ form debt-add + detail): contact, product, money, type(0–3), categories, createdAt, maturityDate, interestRate, isPaid, note, orderId, receivedNote (phiếu nhập kho), productCount, isPurchase.

### 4 kiểu vay/nợ (giá trị số trong compiled template)
| value | i18n key | Nhãn VN | Hướng tiền khi trả |
|---|---|---|---|
| 0 | debt-add.you-borrowed | Bạn đã vay | TIỀN RA |
| 1 | debt-add.borrowed-you | Đã vay bạn | TIỀN VÀO |
| 2 | debt-add.you-owned | Nợ phải trả | TIỀN RA |
| 3 | debt-add.owned-you | Nợ của khách | TIỀN VÀO |

- Form thêm chỉ render option 0/1 ở select thường; report debtType filter hiện đủ 4.

## 3. Logics đặc biệt (bóc từ compiled JS)
- `getDebtsByOrder(orderId,…)` + `isPaidChange()`: khi mọi khoản nợ của 1 đơn đều Đã trả → **tự set `order.status = 3` (Hoàn thành)**.
- `debt.paid-alert`: đánh dấu đã trả → hỏi «tạo một giao dịch tương ứng?» (thu/chi).
- `debt.loan-alert`: tạo khoản vay thực → hỏi tạo giao dịch tương ứng.
- `saveDebt` còn gọi `saveCategoriesToContact` / save lastActive; analytics `debt-add-save-success`.
- Action sheet detail: Xóa khoản vay/nợ / Xem khoản vay/nợ / Lịch sử thay đổi / Đóng.
- List: đếm «Tổng: N công nợ / Tổng giá trị: X», «Nợ còn lại» (debt.total-amount-left), filter «Chỉ hiện các khoản vẫn còn nợ» (show-left-only), tìm «Tìm kiếm khoản vay/nợ».
- Báo cáo `/debt-report`: nhóm theo KH/hạng mục/sản phẩm (type-for-customer/category/product), lọc debtType (4), tổng từng kiểu (youBorrowedReport, borrowedYouReport…), export `debt-report.xlsx`.

## 4. Mapping → PioPio (đã hiện thực)
| ISale | PioPio |
|---|---|
| type 0 Bạn đã vay | `loans.type='borrowed'` (legacy 'loan' → cùng nhãn) |
| type 1 Đã vay bạn | `'lent'` |
| type 2 Nợ phải trả | `'payable'` |
| type 3 Nợ của khách | `'receivable'` (legacy 'debt') |
| debt-add form | `debt-form.modal.ts`: kiểu, đối tác*, số tiền*, mục, lãi suất %, ngày tạo, ngày đến hạn, Đã trả?, ghi chú |
| confirm-paid | toggle Đã trả → alert xác nhận «…sang trạng thái Đã trả/Chưa trả?» |
| paid-alert → giao dịch | alert «Tạo giao dịch tương ứng?» → `transactions.create(income 'Thu nợ' / expense 'Trả nợ')` theo hướng tiền |
| show-left-only | chip «Chỉ còn nợ» + option trong funnel |
| funnel | chip row (Tất cả/4 kiểu) + action sheet `openFilter()` |
| total-amount-left | 2 ô «Còn phải thu» (in) / «Còn phải trả» (out) |
| toolbar tổng | «Tổng: N công nợ / Tổng giá trị: X» |
| delete-alert | nút trash trên card + alert «…không thể khôi phục…» |
| debt-report.xlsx | CSV export mở rộng (Kiểu, Đối tác, Số tiền, Mục, Lãi suất, Đến hạn, Trạng thái, Ghi chú, Thời gian) |
| maturity/interest trên card | chip «Đến hạn dd/MM», «Quá hạn» (đỏ + icon), «Lãi N%» |

## 5. Migration v23 (BẮT BUỘC chạy trước khi dùng)
`supabase-migration-v23.sql` (idempotent):
- Nới `loans_type_check`: ('loan','debt','borrowed','lent','payable','receivable')
- Thêm cột: `interest_rate numeric(6,2)`, `maturity_date timestamptz`, `category text`

## 6. Không clone (chênh lệch có chủ đích)
- Thanh toán từng phần «Lần thanh toán» (debt-payments) — cần bảng payments riêng; PioPio giữ 1 trạng thái Đã trả/Chưa trả.
- Tự động Hoàn thành đơn khi hết nợ gắn đơn — PioPio chưa có trường debt.order_id.
- `/change-history/debt/:id` — không có bảng lịch sử thay đổi tương ứng.
- debt-report theo danh mục/sản phẩm — `/report/debt` hiện tại là BC theo khách (orders), giữ nguyên.
- Đính kèm ảnh khoản nợ, Nhắc nợ qua Zalo/SMS (nút send trên card ISale) — không có service tương ứng.

## 7. Kiểm chứng
- Build: OK (bundle `main-MKUUK3IM.js` local).
- Unit: 55/55 PASS.
- `test-debt.mjs` (Playwright :8347): PASS — frame (title/3 tab tháng/6 chip + funnel), chip lọc active, toggle Chỉ còn nợ, action sheet funnel đủ 5 mục + left-only, modal Thêm đủ 9 trường + 2 date input, empty state ISale, 0 lỗi console thật.
- Lưu ý: label Ionic 8 render trong shadow DOM → test đọc attribute `[label]` của ion-input/select/toggle.
