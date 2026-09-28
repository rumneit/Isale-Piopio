# AUDIT ISALE — BÁN HÀNG (Thanh toán · Khách hàng · Ghi chú · Vận chuyển)
Nguồn: isale.online `#/order/multi-add` (session thật, chỉ đọc) — 27/09/2026
Áp dụng vào: PioPio `/sale` — commit `6d0ad39`, deploy `dpl_GyKfEKCemBWWxf7J13bS6kWDtwET`

## 1. Phát hiện từ ISale (frontend + backend + UI/UX)

### Cấu trúc trang
- Header: back · "Bán hàng" · Lưu (nút vàng)
- Tab đơn hàng: "Đơn hàng 1" + "+" → nhiều đơn song song, Lưu lưu cả lượt
- 4 segment trong thẻ đơn: **payment | contact | note | ship**
- Panel phải: lưới sản phẩm (ảnh, giá bán/nhập per đơn vị tính, "Còn lại: N", filter, phân trang)

### Tab Thanh toán
- Trạng thái (8): Nháp 0, Đang xử lý 1, Đang ship 2, Hoàn thành 3, Hủy 4, Công nợ 5, Ship có nợ 6, Ký gửi 7
- Thanh toán (10 mã): CASH, BANK-TRANSFER, CREDIT-CARD, APPLE-PAY, BANK-CARD, DEBIT-CARD, MOBILE-MONEY, CHEQUE, BITCOIN, OTHER
- Dòng tiền theo thứ tự: Tổng tiền hàng → Phí ship → Khách trả ship? (toggle) → Chiết khấu % → Tổng tạm tính → Thuế % → Tổng phải trả → Khách đưa → Tiền thừa → *VND
- "Chọn ví/tài khoản" (account/getdefault) + "Hiện QR Code thanh toán" (sepay/settings + sepay/transactions; QR = TK ngân hàng shop trong bảng shop)
- Backend: order/neworderdata trả shopConfigs (autoOrderCode, hideTax, allowPointPayment, outStockNotSell, dateFormat...) + pointConfigs + customerPrices/Discounts + defaultAccount

### Tab Khách hàng (contact)
- 3 trường nhập nhanh: Tên (Vd: John London), SĐT tel (Vd: 09123456789), Địa chỉ (Vd: London, UK)
- "Chọn KH có sẵn" + filter Gần đây; nguồn: data/list?table=contact&withPermission=true

### Tab Ghi chú (note)
- ion-textarea nhiều dòng

### Tab Vận chuyển (ship)
- 5 trường: Mã vận đơn (SHIP0123), Đơn vị vận chuyển (VN Post), Tên shipper, SĐT shipper, Nơi nhận hàng
- Tích hợp đối tác schema-driven: shipping/partners (GHTK: settingsSchemaJson với token/partnerId + addressFields province/ward/street/hamlet), shipping/connections, address/Provinces

### UX đáng chú ý (ISale)
- Mã đơn tự sinh (DH14920C2324, autoOrderCode), Ngày = datetime picker, NV/CTV selector
- Empty-state hướng dẫn khi chưa có SP; barcode input riêng + "Quét mã"/"Từ báo giá"
- Tiền thừa readonly; badge % cho Chiết khấu/Thuế

## 2. Đã triển khai vào PioPio
| Hạng mục | Trước | Sau |
|---|---|---|
| Tab đơn hàng | tĩnh, trang trí | thật: thêm/đổi/xóa, giữ data per-order, Lưu cả lượt |
| Tổng tiền hàng / Phí ship | thiếu | có, tính vào Tổng phải trả khi "Khách trả ship?" |
| Hình thức thanh toán | 4 nhãn VN | 10 mã ISale (CASH...) |
| Trạng thái | 3 | 11 (OrdersService.orderStatuses dùng chung, orders page tự hiểu) |
| QR thanh toán | toast placeholder | overlay VietQR thật (shops.bank_code/account/owner + amount + mã đơn) |
| Khách hàng | chỉ nút chọn | Tên/SĐT/Địa chỉ nhanh + chọn KH (điền SĐT/ĐC) |
| Ghi chú | input 1 dòng | textarea nhiều dòng |
| Vận chuyển | 1 input chung | 5 trường ISale |
| Backend | — | migration v22: orders 9 cột + shops.bank_code (additive, idempotent); app dò cột runtime nên vẫn chạy khi chưa migrate |

## 3. Kiểm chứng
- Unit 55/55 PASS · test-sale-catalog + test-sale-catalog-data PASS · test-sale-multi PASS (0 console errors)
- audit-deep 28/28 check sạch (1440px + 390px): 0 overflow, 0 broken img, 0 unnamed button
- Build local `main-B6E5RHSQ.js` = production (aliased quanlykhopiopio.vercel.app)

## 4. Việc còn lại (user)
1. Chạy `supabase-migration-v22.sql` trong Supabase SQL Editor (để lưu SĐT/ĐC khách + 5 trường vận chuyển + bank_code)
2. Cấu hình → Thông tin ngân hàng: chọn "Ngân hàng (VietQR)" + Số TK + Chủ TK → QR hoạt động
3. (Cũ) v18–v21 nếu chưa chạy; rotate API key đã lộ trong opencode.json
