# AUDIT: ISale QL đơn hàng (route `/order`) → PioPio

Ngày audit: 27/09/2026 · Phương thức: CDP (Edge debug :9222), chỉ ĐỌC trên ISale.

## Thực trạng tài khoản ISale
- Tài khoản tạo ~2025, đã dò hết các tháng từ 07/2024 → 10/2026: **0 đơn hàng** (chỉ có sản phẩm).
- Không thể xem row thật / trang chi tiết trực tiếp; không tạo đơn vì quy tắc chỉ-đọc.
- Bù lại: đã trích xuất **12 chunk JS của OrderModule** (1.32MB) từ bundle tĩnh và phân tích i18n keys + template strings.

## Phát hiện từ ISale live
### Trang danh sách (`#/order`)
- Header: menu ☰, home, [Xuất Excel] [+], [⋮]
- **Dải tab Tháng**: infinite scroll cả 2 chiều (dò tới 07/2024 vẫn sinh tab cũ); hiển thị 3 tháng xung quanh tháng hiện tại
- **Dải tab Trạng thái**: `Toàn bộ | Đang ship | Hoàn thành | Hủy | •••`
- **••• mở alert radio các trạng thái phụ**: Nháp, Hủy, Đang xử lý, Công nợ, Ship có nợ, Ký gửi (→ đủ 8 trạng thái + 3 tab nhanh)
- **Toolbar**: funnel (lọc nâng cao), search, `Tổng: N đơn hàng / Tổng tiền: X`, ☑ select-mode, ✏ bulk-edit, ⬇ export Excel, ☁↑ import, ▦ view toggle, ⚙ settings
- FAB giữa "+" (tạo đơn), FAB phải AI
- **Empty state** chi tiết: hướng dẫn cập nhật/quét vạch/tính tổng, xem báo cáo, in đơn, xuất Excel qua Gmail/Facebook
- Hộp gói Miễn Phí / PRO (không clone — PioPio không có hệ gói)

### Lọc nâng cao (route riêng `/custom-field/filter`)
- Hệ query-builder đa bảng: "Điều kiện N" (Trường lọc + toán tử), tab **Lọc | Sắp xếp**, **Lưu bộ lọc** theo tên
- API: `data/StandardFields?table=order` (schema trường), `data/listequal` (query danh sách), `data/CountGroup` (đếm nhóm)

### Trang chi tiết đơn (từ chunk JS — i18n keys)
- `order-detail.status-*`: draft / inprogress / shipping / done / cancel / has-debt / shipping-has-debt / deposit (8 mức)
- `order-detail.total-amount`, `old-debt` (nợ cũ của KH), `status`, `title`
- 10 payment-type: cash/bank-transfer/credit-card/apple-pay/bank-card/debit-card/mobile-money/cheque/bitcoin/other
- `order-print`: hóa đơn nhiệt (STT/tên/đơn vị/SL/đơn giá/CK/thành tiền, tổng bằng chữ, người mua, ký tên, **QR thanh toán trên bản in**)
- `order-export`: xuất Excel theo Đơn hàng/Sản phẩm/Khách hàng/Nhân viên (FileSaver + jszip)
- Bulk: `multi-delete-no-order-alert` (xóa hàng loạt)
- order-add: đ province/ward (GHTK), pay-by-point, combo, khuyến mãi tổng

## Đã clone vào PioPio (commit `1059ffa`)
| ISale | PioPio |
|---|---|
| ••• = trạng thái phụ (radio) | ••• = Action Sheet 8 trạng thái phụ + "Tất cả trạng thái"; tab sáng khi đang lọc |
| ☑ select-mode + bulk edit/delete | Nút checkbox toolbar → checkbox từng đơn + bulk bar: Chọn tất cả/Đổi trạng thái (11 mức)/Xóa/Thoát |
| Tổng N đơn / Tổng tiền | có sẵn, giữ nguyên |
| Export/Import Excel | export CSV (có sẵn) + import (có sẵn) |
| Badge màu trạng thái | `OrdersService.statusColor` (11 màu) |
| Hình thức thanh toán trên row/detail | `paymentLabel` (10 mã) |
| Đổi trạng thái trên chi tiết | Action Sheet 11 mức → `orders.update` |
| Đổi hình thức thanh toán | Action Sheet 10 mã (chỉ khi cột tồn tại — `detectPaymentMethod`) |
| Thông tin vận đơn/shipper/địa chỉ/SLA | Khối "Vận chuyển" khi có cột v22 (`detectOrderExtras`) + giá trị |
| QR trên hóa đơn in | `img.vietqr.io` nhúng vào bản in khi shop có `bank_code`+`bank_account` |
| In: trạng thái/TT thanh toán/SDT/phi ship/van don | đã thêm vào bản in nhiệt |
| Tổng tiền hàng | tính ngược: total + CK − ship (nếu khách trả) |
| Infinite month scroll | giữ 3 tab tháng (tháng trước/hiện/sau) — đủ dùng, ISale-only nicety |
| View toggle (lưới), settings cột, saved filters | chưa clone — cần backend riêng (custom fields), cân nhắc sau |

## Files
- `src/app/pages/orders/orders.page.ts|html|scss` — ••• đúng nghĩa, bulk select, row nâng cấp
- `src/app/pages/orders/order-detail.page.ts|html|scss` — đổi trạng thái/thanh toán, vận chuyển, QR in
- `src/app/core/services/orders.service.ts` — statusColor, paymentLabel, bulkUpdateStatus, bulkRemove
- `test-order-ql.mjs` — smoke test mới (PASS)

## Verification
- Build OK, bundle `main-5PCYDXEK.js`
- test-order-ql.mjs PASS · test-sale-multi.mjs PASS · test-sale-catalog(.data).mjs PASS
- Unit 55/55 PASS · audit-deep 28/28 sạch (1440px + 390px)
- Deploy `dpl_GBb2iQr5d2knXmvBUe3kC8naG3Pc` READY → production = `main-5PCYDXEK.js`
- Pushed: origin/master = `1059ffa`

## Chưa làm (cần quyết định/backend)
- Saved filters + query-builder nâng cao như `/custom-field/filter` (cần thiết kế backend Supabase)
- Xuất Excel nhiều sheet (đơn/sp/kh/NV) — hiện CSV 1 sheet
- View lưới (grid) cho danh sách đơn
