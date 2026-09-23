# ISALE → PIOPIO DEEP UI/UX AUDIT — PHASE 1: DISCOVERY
_Ngày: 23/09/2026 · Trạng thái: ĐANG TIẾN HÀNH · DATA = LOCKED_

## 1. NGUỒN AUDIT
- **Isale (REFERENCE)**: https://isale.online/app (tài khoản demo gói Miễn Phí, có 199 SP / 50 KH / 0 đơn)
- **PioPio (TARGET)**: https://quanlykhopiopio.vercel.app (data thật: 117 SP / 89 KH — KHÔNG ĐỘNG VÀO)

## 2. ISALE — ROUTE MAP (phát hiện bằng interaction thật)

### Sidebar (7 nhóm, 52 mục)
| Nhóm | Mục | Route |
|---|---|---|
| (root) | Trang chủ | `#/home` |
| Bán hàng | Bán hàng | `#/sale` (chưa verify) |
| | Tạo đơn: quét mã | action/modal trên home |
| | QL đơn hàng | `#/order` |
| | Đơn từ Website | `#/online-order` |
| | Quản lý công nợ | `#/debt` |
| | Quản lý Thu/Chi | `#/trade` |
| | Quản lý Báo giá | `#/quote` |
| | Đơn vận chuyển | `#/shipping` |
| | Báo cáo, biểu đồ | `#/excel-report` |
| | Quản lý Fanpage | `#/fbpage` |
| | Dịch vụ AI | `#/ai-services` |
| | Tạo trang với AI | `#/ai-dynamic-page` |
| Kho/Sản phẩm | Sản phẩm | `#/product` |
| | Phiếu nhập kho | `#/received-note` |
| | Phiếu chuyển kho | `#/transfer-note` |
| | Kiểm kê kho | `#/stock-check` |
| | Danh mục SP | `#/app/trade_category` |
| | Q/l nhiều shop/kho | `#/app/store` |
| | Nhập SP từ Excel | file-dialog (skip click) |
| | Xuất SP ra Excel | action trên product |
| | Nhập Phiếu Nhập từ Excel | file-dialog (skip) |
| | Báo cáo, biểu đồ | `#/excel-report` |
| Khách và Nhân viên | Khách hàng | `#/contact` |
| | Tuyến bán hàng | `#/sales-route` |
| | Quản lý nhân viên | `#/staff` |
| | Tích điểm | `#/point-config` |
| | Ghi chú - Ảnh | `#/app/note` |
| | Nhập khách Excel / Xuất khách Excel / Nhập danh bạ | file-dialog (skip) |
| | Lọc khách trùng | `#/contact/filter-duplicate` |
| | Quản lý ca | `#/app/shift_log` |
| CRM | CRM Help | `#/help/crm` |
| | Khách tiềm năng | `#/contact/crm-leads` |
| | Hoạt động | `#/contact/crm-activities` |
| | Đồng bộ điện thoại | `#/contact/crm-device-sync` |
| | Pipeline tiềm năng | `#/order/multi-add` |
| | Cài đặt CRM | `#/contact/crm-settings` |
| | Quy trình tự động / Sơ đồ tổ chức | action/modal |
| Cấu hình | Vận chuyển | `#/shipping-partners` |
| | Loa thông báo SePay | modal trên online-order |
| | Bảng dữ liệu tùy chỉnh | modal trên debt |
| | Ví/Tài khoản | `#/app/money_account` |
| | Cấu hình shop | `#/config` |
| | Nâng cấp gói | `#/request-pro` |
| | Trợ giúp | `#/help` |
| Tài khoản | Đổi mật khẩu | `#/change-password` |
| | Đăng xuất | (skip) |

## 3. DESIGN TOKENS (tính bằng computed style)
| Token | Isale | PioPio | Khác? |
|---|---|---|---|
| --ion-color-primary | `#6030ff` | `#6030ff` | ✅ |
| --ion-color-secondary | `#47bdb5` | `#47bdb5` | ✅ |
| --ion-color-success | `#2dd55b` | `#2dd55b` | ✅ |
| --ion-color-warning | `#ff0ade` | `#ffb400` | ❌ |
| --ion-color-danger | `#c5000f` | `#c5000f` | ✅ |
| --ion-font-family | Roboto stack | Segoe UI Variable stack | ❌ |
| body font | Roboto | (body rơi về Times New Roman — cần set) | ❌ |
| ion-title | 15.2px / weight 650 | 17px / weight 800 | ❌ |

## 4. KHÁC BIỆT CẤU TRÚC TOÀN CỤC (evidence)

### 4.1 FAB TRIO trên mọi trang danh sách (Isale) — PioPio THIẾU
Isale luôn có 3 FAB nổi góc phải: `add` (thêm mới), `sparkles-outline` (AI), `caret-up-outline` (lên đầu trang).
PioPio: KHÔNG có FAB — đã chuyển thành icon trên header.
**Fix**: tạo shared component FAB trio, áp dụng cho product/contact/order/debt/trade/received-note/…

### 4.2 Header action icons
Isale dùng icon **sharp/filled** (barcode-sharp, add-circle-sharp, person-add filled, notifications filled).
PioPio dùng **outline** (barcode-outline, add-circle-outline, notifications-outline).

### 4.3 Product card (Isale) vs Product item (PioPio)
- Isale: `ion-card` — hiện: Tên, Số lượng, Đơn giá, **Giá nhập**, Đơn vị, Serial/IMEI
- PioPio: `ion-item` — hiện: Tên, Số lượng, Đơn giá, Đơn vị, Serial/IMEI → **thiếu Giá nhập**
- Isale: phân trang "Trang 1/10", 20 card/trang, "Tổng: N sản phẩm"
- Isale filter: "Lọc theo | Danh mục | CHỌN NHÓM HÀNG"; PioPio thêm "Gần đây"

### 4.4 Contact page
- Segment giống nhau (Tất cả | Quan trọng | Gần đây) — Isale mặc định active **Gần đây**, PioPio **Tất cả**
- Card khách: cùng cấu trúc (Tên, Điện thoại, Giới tính, Địa chỉ, Quan trọng, Hoạt động cuối) ✅
- Isale FAB: person-add + sparkles + caret-up

### 4.5 Order / Debt / Trade
- Segments tháng + chips trạng thái: GIỐNG NHAU ✅ (Toàn bộ/Đang ship/Hoàn thành/Hủy)
- Trade: search "Tìm kiếm giao dịch" — giống ✅
- Empty-state text: gần giống từng chữ ✅

### 4.6 HOME
- 4 tab nhóm giống nhau: Bán hàng | Kho/Sản phẩm | Khách và Nhân viên | CRM
- Isale mặc định active tab **Kho/Sản phẩm**; PioPio **BÁN HÀNG**
- Isale tab label viết thường ("Bán hàng"); PioPio IN HOA ("BÁN HÀNG")
- CẤU HÌNH section: Isale có "Nâng cấp gói" — PioPio thiếu (có route #/pricing, #/request-pro sẵn)
- Isale có 4 widget: Tài khoản/Ví mặc định, Mã giới thiệu, Liên hệ/Báo lỗi, Gói Miễn Phí — PioPio không có (SaaS-marketing — cân nhắc giữ "Ví mặc định" + "Báo lỗi")

### 4.7 Route mapping khác tên
| Chức năng | Isale | PioPio |
|---|---|---|
| Đơn vận chuyển | `#/shipping` | `#/delivery` |
| Phiếu chuyển kho | `#/transfer-note` | `#/transfer` (+ `/add`) |
| Kiểm kê kho | `#/stock-check` | `#/stock-check` (+ new/:id) |
| Ghi chú | `#/app/note` | `#/note` |
| Quản lý ca | `#/app/shift_log` | `#/shift` |
| Danh mục SP | `#/app/trade_category` | (cần map) |
| Ví/Tài khoản | `#/app/money_account` | `#/money-account` |
| Báo cáo | `#/excel-report` | `#/report/excel` (+ bộ report/*) |
| CRM leads | `#/contact/crm-leads` | `#/crm` |
| CRM activities | `#/contact/crm-activities` | `#/crm-activities` |
| CRM settings | `#/contact/crm-settings` | (cần map) |

## 5. GHI CHÚ KỸ THUẬT AUDIT
- Tab browser ẨN → rAF throttle → Ionic transition không hoàn tất → trang mới kẹt `ion-page-invisible` (Isale). **Cần cửa sổ browser hiển thị** để audit + screenshot.
- Isale điều hướng KHÔNG phản ứng với `location.hash` trực tiếp — phải click menu item.
- PioPio `.ion-page` computed display:inline (bất thường — verify khi có screenshot).
- Đợi xác minh thêm: sale page, product/:id form chi tiết, contact/:id, order/:id, config tabs, report/*, modals/drawers, responsive.

## 6. PIOPIO PAGES KHÔNG CÓ TRONG ISALE (đợt-3, giữ nguyên — không xóa)
crm/pipeline, crm/deals, crm/forecast, crm/quota, crm/approvals, sales-channels, promotion, material, level-config, integrations, cyberlotus-tax, zbs-marketing, sms-marketing, sepay-payment, external-api, calendar, cafe-tables, scan, notifications, custom-field, permission, activity-log, import…

---

# PHASE 2 — BUNDLE FORENSICS (nguồn: main.js / styles.css / runtime.js + 13 lazy chunks)

## 6b. Xác nhận design tokens từ styles.css của Isale
- Palette **:root** của Isale = **GIỐNG HỆT** PioPio light palette (primary #6030ff, secondary #47bdb5, tertiary #e6bf00, success #2dd55b, danger #c5000f, dark #2f2f2f, medium #5f5f5f, light #f6f8fc) → PioPio là fork đúng gốc.
- Khác biệt duy nhất: **`--ion-color-warning: #ff0ade`** (magenta) — PioPio từng đổi thành #ffb400.
- `--app-page-bg: #f5f7fa` — token này CỦA ISALE (PioPio giữ đúng) ✅
- Font: Roboto stack (Ionic default). ion-title: ~15.2px / weight 650 / màu tím / canh trái.

## 6c. Kiến trúc trang danh sách của Isale (từ chunk `shared-2402.js`)
- Mọi trang list dùng **DataTable component dùng chung** (`app-page-wide` trên ion-content, template `table` với props query/totalList/searchFields/canAdd/filterObjects/actions...).
- Grid card: `ion-list` bị override thành **CSS grid** — computed `403px 403px 403px` @1296px viewport → tương đương `repeat(auto-fill, minmax(~380px, 1fr))` (không media-query).
- ion-card: radius **12px**, shadow Ionic md mặc định, margin 0 (gap thay thế).

## 6d. Deep-boot audit (tab mới + reload thẳng vào hash)
Phương pháp: mở **tab mới** mỗi route (history sạch) → render đúng 100%, khỏi cần click menu. Kết quả:
- **product**: filter "Lọc theo [Gần recently ▾] | Danh mục [CHỌN NHÓM HÀNG]"; toolbar funnel+search+Tổng+checkbox/pen/download/cloud/grid/gear + "Trang 1/10"; **grid card 3 cột** (Tên | Số lượng | Đơn giá | Giá nhập | Đơn vị | Serial toggle); FAB add + sparkles + caret-up; banner gói Miễn Phí.
- **contact**: 3 segment **khối lớn icon trên chữ** (Tất cả 👥 / Quan trọng ★ / Gần đây 🕐 — active = nền tím đặc); "Tổng: 50 khách/đối tác", "Trang 1/3"; card grid 3 cột (Tên | Điện thoại + icon call/chat inline | Giới tính | Địa chỉ | Quan trọng toggle | Hoạt động cuối); FAB person-add + AI + caret-up; toast "Đang tải…".
- **order**: header ☰ home "Đơn hàng" + excel-icon + add-circle + ⋮; segment 2 hàng (Tháng + trạng thái, underline tím); toolbar Tổng + bulk icons; empty-state inbox "Không có đơn hàng nào."; banner Miễn Phí; FAB trio.
- **transfer-note**: "Phiếu chuyển kho" + month segments + "Từ 01/09/2026 đến 30/09/2026" + empty-state.
- **stock-check**: "Kiểm kê kho" + month segments + "Tổng: + 0 ₫".
- **excel-report**: thư mục tile báo cáo (Bán hàng: Tổng hợp theo đơn/sản phẩm/khách/NV + Biểu đồ doanh thu + Vay/nợ; Sản phẩm: Xuất Excel + Tồn kho tổng hợp + Xuất nhập...).
- **config**: 4 segment "Thông tin shop | Cấu hình Website | Cấu hình khác | Template hóa đơn" + nút Lưu + card "website miễn phí" + card "Mã giới thiệu".
- **money-account**: "Ví/Tài khoản ngân hàng — Tổng: 0 tài khoản".
- **quote**: "Quản lý Báo giá" + gate gói Miễn Phí + card Liên hệ/Báo lỗi (hotline (+84) 0938.21...).
- Home tile config (main.js): icon+color từng tile — /product `cart`+warning vàng, /received-note `clipboard`+tertiary, /transfer-note fa-truck `#f88962`, /stock-check `clipboard` `#184fc7`, /contact fa-address-card `#3dc2ff`, /order fa-store `#3880ff`, /excel-report `trending-up` `#2C3E50`, /config `settings` `#aaa`…

---

# PHASE 4 — IMPLEMENTATION LOG (đợt này — mọi thay đổi UI-only, KHÔNG đụng data/backend)

## 7. DESIGN TOKENS
| Token | Trước | Sau | Bằng chứng |
|---|---|---|---|
| `--ion-color-warning` (light) | #ffb400 | **#ff0ade** | styles.css Isale §6b |
| Font | Segoe UI Variable | **Roboto** (Google Fonts import) | computed style Isale |
| ion-title | 17px/800 dark | **15.2px/650 màu tím** | computed style Isale |
| ion-segment-button | uppercase | **none** | screenshot Isale (label viết thường) |
| ion-fab-button | gradient tím-xanh, radius 18 | **tím đặc, tròn 50%** | screenshot Isale |

## 8. FAB TRIO — component dùng chung `app-fab-trio`
`src/app/shared/fab-trio/fab-trio.component.ts` — FAB chính (giữa đáy) + AI sparkles (phải dưới) + caret-up hiện khi cuộn >240px. Tích hợp: **products, customers, orders, debt, trades, quotes, received-notes, stock-check** (8 trang danh sách).

## 9. PRODUCTS
- Header: `home` (filled) + `barcode-sharp` + `add-circle-sharp` + `apps` (đúng dump DOM Isale).
- Grid card responsive `repeat(auto-fill, minmax(360px,1fr))`, card radius 12, tên màu navy #1f2a5a + divider; field 2 cột; serial row full-width.
- **Giá nhập luôn hiển thị** (null → "—") đúng card Isale.
- Container full-width (`products-container`, max-width none).

## 10. CUSTOMERS
- Header: `home` + `person-add` + `apps` (filled).
- Segment **khối lớn icon-trên-chữ**, active nền tím đặc (đúng screenshot Isale).
- Grid card 3 cột + divider dưới tên + field 2 cột; Địa chỉ span full.
- Default tab `recent` (Gần đây) — trùng Isale ✅ (đã có sẵn).
- Container full-width.

## 11. HOME
- Default tab: `selling` → **`inventory` (Kho/Sản phẩm)** đúng Isale.
- Tab Kho: thêm tile **"Báo cáo, biểu đồ"** (trending-up #2C3E50 → /report) — Isale có 10 tile, PioPio còn 9.
- CẤU HÌNH: thêm **"Nâng cấp gói"** (rocket → /pricing) — đúng thứ tự Isale.
- Tile icons: đổi sang **filled** (cart, clipboard, checkbox, people, star, time, cash, cloud, reader, storefront, boat...) + **màu đúng config Isale** (§6d); bỏ nền pastel, icon 30px.
- Grid **5 cột** desktop (4 @1024, 3 @640).
- Tip banner: nền **hồng warning** rgba(#ff0ade, 0.1) + viền + X đỏ (đúng Isale).
- Thêm card **"Liên hệ/Báo lỗi"** (hotline + email + nút Báo lỗi → /help) đúng widget Isale (bỏ Mã giới thiệu + Gói Miễn Phí vì là SaaS-marketing của Isale).
- Header: `notifications` (filled).
- section-title bỏ uppercase.

## 12. Còn lại (TODO đợt sau — không chặn deploy)
- Bulk toolbar icons (checkbox/pen/grid/gear) trên product/contact — cần backend bulk-action thật, tránh nút chết.
- Isale filter chips "Còn Hạn SD / Còn số lượng" (product) — cần field expiry trong schema.
- Detail pages (product/:id, contact/:id, order/:id), modals/drawers, config tabs — audit sâu chưa xong.
- Responsive verify 4 breakpoint + dark mode regression (warning #ff0ade trong dark palette đang sẵn — kiểm tra không break).
