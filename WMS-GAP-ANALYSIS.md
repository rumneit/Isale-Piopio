# Báo cáo Đối chiếu & Nâng cấp WMS (PioPio)

Tài liệu này ghi lại kết quả **Giai đoạn 1 (Reverse Engineering)** và **Giai đoạn 2–3
(Đối chiếu & Thực thi)** theo yêu cầu.

- Trang mẫu: `https://isale.online/app/` (Angular SPA, backend REST `api2.isale.online`).
- Codebase đích: `piopio` (Angular 22 + Ionic 9 + Capacitor + Supabase), deploy Vercel.
- Ngày thực hiện: 2026-09-23.

---

## 1. Cách lấy dữ liệu (không đoán mò)

| Hạng mục | Cách lấy | Kết quả |
| --- | --- | --- |
| Session đăng nhập | `browser.evaluate` đọc localStorage/nav | Hợp lệ (có "Đăng xuất"/"Đổi mật khẩu") |
| Menu trang mẫu | DOM `nav a, ion-item` | 49 mục |
| Route tree trang mẫu | Fetch `main.cf6a5ed985517981.js` (3.45 MB) + regex `path:"..."` | **119 route** |
| API endpoints | Regex chuỗi `"/..."` trong bundle | 368 endpoint |
| Host API | Network interception | `api2.isale.online` (63 request) |
| Route codebase đích | `src/app/app.routes.ts` | 62 route (nay 64) |
| Data layer đích | `src/environments/*`, `supabase-*.sql` | Supabase Postgres + RLS |

**Khác biệt kiến trúc quan trọng:** trang mẫu dùng REST API riêng (`api2.isale.online`);
codebase đích dùng **Supabase trực tiếp**. Vì vậy "clone 100% backend" là không khả thi
và không nên — ta xây **năng lực tương đương** trên kiến trúc Supabase sẵn có.

---

## 2. Tree-map tổng quan

### 2.1 Trang mẫu (119 route, rút gọn theo nhóm)

```
Bán hàng      /order  /online-order  /quote  /promotion  /trade
Kho           /product  /product/import  /product/material  /received-note
              /received-note/import  /transfer-note  /stock-check  /shipping
Khách hàng    /contact  /contact/import  /contact/filter-duplicate
CRM           /contact/crm-leads  /contact/crm-pipeline  /contact/crm-deals
              /contact/crm-approvals  /contact/crm-forecast  /contact/crm-quota
              /contact/crm-stage-settings  /contact/crm-flow-settings  /help/crm
Tài chính     /debt  /debt-report  /money-account  /sepay-payment
Báo cáo       /report  /chart  /category-report  /product-report  /excel-report
              /timely-report  /delivery-note
Vận hành      /calendar  /note  /shift  /shift/start  /shift/end  /staff
              /staff/org-chart  /table  /table-import  /custom-field
Marketing     /fbpage  /zbs-marketing  /sms-marketing  /sales-route  /sales-channels
AI            /ai-services  /ai-dynamic-page
Hệ thống      /config  /change-password  /change-history  /external-api
              /integrations  /shipping-partners  /cyberlotus-tax  /request-pro
              /pricing  /level-config  /point-config
```

### 2.2 Codebase đích (sau nâng cấp: 64 route)

```
/home
Bán hàng   /order  /order/add  /order/:id  /order/:id/return  /sale
           /returns  /quote  /promotion  /promotion/add  /promotion/:id
           /online-order  /cafe-tables  /trade  /trade/add
Kho        /product  /product/add  /product/:id  /received-note  /received-note/add
           /transfer  /transfer/add  /stock-check  /stock-check/new  /stock-check/:id
           /material  /import  /scan
Khách hàng /contact  /contact/add  /contact/:id  /point  /note  /calendar
CRM        /crm  /crm/pipeline  /crm/add  /crm/:id  /crm-activities
Tài chính  /money-account  /debt
Báo cáo    /report  /report/chart  /report/orders  /report/customer
           /report/stock  /report/inout  /report/product  /report/debt
Hệ thống   /config  /staff  /permission  /activity-log  /integrations
           /support  /org-chart  /notifications  /shift  /help
```

---

## 3. Gap Analysis

### 🟢 Đã có, khớp mẫu (BỎ QUA)

Sản phẩm & danh mục, Nhập kho, Chuyển kho, Đơn hàng, Trả hàng, Bán hàng, Báo giá,
Khuyến mãi, Đơn từ website, Quản bàn, Thu/Chi, Công nợ, Khách hàng, Tích điểm,
Ghi chú, Lịch, Ca làm việc, CRM + Pipeline, Sơ đồ tổ chức, Báo cáo (8 loại),
Sổ tiền, Cấu hình shop, Quét mã, Nhập dữ liệu, Phân quyền, Lịch sử thay đổi.

### 🟡 Đã code nhưng sai/thiếu logic (ĐÃ SỬA — đợt 1)

| # | Vấn đề | Mức độ | Cách xử lý |
| --- | --- | --- | --- |
| 1 | **Phân quyền lưu mà không hề được thực thi.** `authGuard` chỉ kiểm tra đăng nhập; nhân viên không quyền vẫn vào mọi trang. | Cao (bảo mật) | Thêm `permissionGuard` + bản đồ `ROUTE_PERMISSIONS`; gắn cho 48 route. |
| 2 | Menu hiển thị mọi mục cho mọi vai trò. | Trung bình | `visibleMenuItems` lọc theo `auth.can()`. |
| 3 | Vai trò chỉ có `owner`/`staff`, không có preset chuẩn kho. | Trung bình | Thêm 5 vai trò + preset (Quản lý kho, Picker, Kế toán…). |
| 4 | Trang Kiểm kho **sửa thẳng `stock`**, không có phiếu, không lưu vết, không tính chênh lệch. | Cao (toàn vẹn dữ liệu) | Viết lại thành **phiếu kiểm kê** (draft → completed), tính diff, chỉ ghi tồn khi chốt. |
| 5 | RLS chỉ theo "thành viên shop", không phân biệt quyền ghi. | Cao (bảo mật) | Migration v12: `has_permission()` + siết policy ghi cho products/categories/transactions/money_accounts/customers/stock_counts. |
| 6 | Danh sách sản phẩm **tải toàn bộ SKU** rồi phân trang phía client → chậm/nặng với hàng nghìn SKU. | Trung bình (hiệu năng) | `ProductsService.listPaged()` — phân trang + sắp xếp + tìm kiếm **phía máy chủ** (`range`/`count`), UI chuyển trang gọi lại server. |

### 🔴 Chưa có → ĐÃ XÂY (đợt 2)

| # | Module mẫu | Trạng thái | Ghi chú |
| --- | --- | --- | --- |
| 1 | `/sales-route` — Tuyến bán hàng | ✅ Hoạt động | Bảng `sales_routes` + `customers.route_id`; CRUD + đếm số khách mỗi tuyến. |
| 2 | `/sales-channels` — Kênh bán hàng | ✅ Hoạt động | Bảng `sales_channels` + `orders.channel_id`; CRUD + doanh thu theo kênh. |
| 3 | `/contact/filter-duplicate` — Lọc khách trùng | ✅ Hoạt động | Thuật toán chuẩn hoá SĐT/tên/email (thuần, có unit test) + xoá bản trùng. |
| 4 | `/crm/deals`, `/crm/forecast`, `/crm/quota`, `/crm/approvals` | ✅ Hoạt động | Bảng `crm_deals`, `crm_quotas`, `crm_approvals`; dự báo có trọng số + pipeline + chỉ tiêu + luồng duyệt. |
| 5 | `/fbpage`, `/zbs-marketing`, `/sms-marketing` | 🟡 Cấu hình | Bảng `integration_settings`: lưu Page ID/Token/OA… Bật/tắt + nhập khoá. **Gửi tin thật cần backend worker + API nhà cung cấp.** |
| 6 | `/ai-services` | 🟡 Cấu hình | Lưu base URL/model/API key theo shop. Gọi AI thật cần backend giữ khoá. |
| 7 | `/table`, `/custom-field` | ✅ Hoạt động | `custom_fields` (metadata trường) + `custom_tables`/`custom_table_rows` (bảng động, nhập dòng, xuất CSV). |
| 8 | `/sepay-payment` | 🟡 Cấu hình | Lưu số TK + webhook token. **Nhận webhook cần endpoint công khai.** |
| 9 | `/excel-report`, `/timely-report`, `/category-report` | ✅ Hoạt động | `AdvancedReportsService` — doanh thu theo danh mục, theo giờ/thứ, xuất CSV toàn bộ đơn. |
| 10 | `/external-api`, `/request-pro`, `/pricing` | ✅ Hoạt động | `api_tokens` (tạo/thu hồi token cho hệ thống ngoài) + `upgrade_requests` + trang bảng giá 3 gói. |
| 11 | `/change-password` | ✅ Hoạt động | `AuthService.changePassword()` (Supabase `updateUser`). |
| 12 | Ảo hóa danh sách SKU | ✅ Hoạt động | Phân trang phía máy chủ (xem mục 🟡 #6) — thay cho virtual-scroll CDK để không thêm phụ thuộc. |

**Trung thực về phạm vi:** các module đánh dấu 🟡 quản lý **cấu hình** đúng nghĩa
(lưu trữ theo shop, RLS theo quyền, UI đầy đủ). Phần "gửi/nhận thật" (webhook SePay,
gửi Zalo/SMS/Facebook, gọi AI) **bắt buộc có backend worker + API key của nhà cung cấp**
— không thể và không nên nhúng khoá bí mật vào frontend. Đây là giới hạn kiến trúc,
không phải code giả.

---

## 4. Đã thực thi trong đợt này

**Đợt 1**
- `src/app/core/permissions.ts` — nguồn duy nhất cho RBAC (quyền, vai trò, preset, map route→quyền).
- `src/app/core/permissions.spec.ts` — 9 test đơn vị cho RBAC.
- `src/app/core/services/stock-counts.service.ts` — nghiệp vụ phiếu kiểm kê.
- `src/app/pages/stock-check/stock-count-detail.page.ts` — tạo/sửa/chốt phiếu kiểm kê.
- `supabase-migration-v12.sql` — bảng `stock_counts`, hàm `has_permission()`, siết RLS.

**Đợt 2 (module còn thiếu)**
- `supabase-migration-v13.sql` — 10 bảng mới: `sales_routes`, `sales_channels`,
  `crm_deals`, `crm_quotas`, `crm_approvals`, `custom_fields`, `custom_tables`,
  `custom_table_rows`, `integration_settings`, `api_tokens`, `upgrade_requests` + RLS.
- Service mới: `sales-routes`, `sales-channels`, `crm-deals`, `custom-fields`,
  `custom-tables`, `integrations`, `api-tokens`, `upgrade-requests`, `advanced-reports`.
- Logic thuần + test: `src/app/core/duplicate-detection.ts` (+ spec),
  `crm-deals.spec.ts` (dự báo có trọng số, pipeline).
- Trang mới: `sales-routes`, `sales-channels`, `duplicate-customers`, `crm-deals`,
  `crm-forecast`, `crm-quota`, `crm-approvals`, `custom-fields`, `custom-tables`,
  `custom-table-detail`, `integration-config` (dùng chung cho fbpage/zbs/sms/sepay/ai),
  `external-api`, `pricing`, `change-password`, `report-category`, `report-timely`,
  `report-excel`.
- `ProductsService.listPaged()` + `products.page` — phân trang phía máy chủ.
- `AuthService.changePassword()`, `Customer.route_id`, `Order.channel_id`.
- `app.routes.ts` (86 route), `app.component.ts` (menu), `reports.page.ts`,
  `integrations.page.ts`, `audit.mjs` (76 route audit).

---

## 5. Kết quả kiểm chứng

| Kiểm tra | Lệnh | Kết quả |
| --- | --- | --- |
| Icon hợp lệ | `npm run check:icons` | 121 icon, **0 lỗi** |
| Lint | `npm run lint` | **All files pass** |
| Build | `npm run build` | **exit 0** |
| Test đơn vị | `npm run test:ci` | **55/55 pass** (RBAC 9, trùng khách 7, CRM 4, vận chuyển 8, tích điểm 10, thuế 8, trang AI 9) |
| Audit route (Playwright) | `npm run audit` | **82/82 PASS, 0 FAIL**, 0 lỗi console thật, 0 cảnh báo ionicon, 43 mục menu |

---

## 6. Đợt 3 — Các module còn lại (đã xây)

| # | Module mẫu | Trang đích | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | `/shipping-partners` | `/shipping-partners` | ✅ Hoạt động | Bảng `shipping_partners`; CRUD, đặt mặc định, bảng giá theo 3 vùng (nội/ngoại/liên tỉnh) tính từ chiết khấu đối tác. Logic phí thuần + 8 test. |
| 2 | `/point-config` | `/point-config` | ✅ Hoạt động | Bảng `point_configs` + `loyalty_tiers`; 4 tab: lịch sử tích điểm, cấu hình thanh toán, quy tắc tích điểm, hạng thành viên. Logic tích điểm/thăng hạng thuần + 10 test. |
| 3 | `/level-config` | `/level-config` | ✅ Hoạt động | Cấu hình thăng hạng theo chi tiêu + điểm, chiết khấu mỗi hạng; tạo bộ 4 hạng mặc định. |
| 4 | `/ai-dynamic-page` | `/ai-dynamic-page` + `/ai-page/:id` | ✅ Hoạt động (mẫu) | Bảng `ai_pages`; thư viện 4 mẫu trang, chạy cấu hình trên **dữ liệu thật** (orders/customers/products) → KPI/bảng/bar. Sinh cấu hình từ chat cần backend AI. Logic thuần + 9 test. |
| 5 | `/cyberlotus-tax` | `/cyberlotus-tax` | ✅ Hoạt động (tính + xuất) | Bảng `tax_profiles` + `tax_declarations`; hồ sơ thuế, tính GTGT trực tiếp/khấu trừ từ doanh thu thật, xuất tờ khai 01/GTGT CSV. Nộp qua API cần tài khoản đối tác. Logic thuần + 8 test. |

**Đã xác nhận có sẵn từ đợt 2 (không cần làm lại):** gán tuyến bán hàng trong
màn hình khách hàng (`customer-edit`) và gán kênh bán hàng trong màn hình tạo đơn
(`order-add`) — cả hai đã được nối với `SalesRoutesService` / `SalesChannelsService`.

**Trung thực về phạm vi (đợt 3):** hai module cần backend giữ khoá bí mật được
triển khai đúng phần frontend có thể làm:
- **Trang AI**: chọn mẫu dựng sẵn → hiển thị số liệu thật. Sinh cấu hình từ câu
  chat cần gọi mô hình AI qua backend.
- **CyberLotus**: lưu hồ sơ + tính + xuất tờ khai. Nộp lên cơ quan thuế cần tài
  khoản đối tác CyberLotus + backend.

---

## 7. Việc còn lại / cần quyết định

1. **Chạy migration v12, v13, v14** trên Supabase Dashboard (SQL Editor) để các
   bảng `stock_counts`, `sales_routes`, `sales_channels`, `crm_deals`, `crm_quotas`,
   `crm_approvals`, `custom_fields`, `custom_tables`, `custom_table_rows`,
   `integration_settings`, `api_tokens`, `upgrade_requests`, `shipping_partners`,
   `point_configs`, `loyalty_tiers`, `ai_pages`, `tax_profiles`,
   `tax_declarations` và RBAC cấp DB có hiệu lực.
2. **Bảo mật:** thu hồi/xoay khoá API `sk-27a67…` đã từng bị đẩy lên GitHub.
3. **Backend worker** (ngoài phạm vi frontend) nếu muốn gửi Zalo/SMS/Facebook,
   nhận webhook SePay, sinh trang bằng AI, hoặc nộp tờ khai CyberLotus — giữ khoá
   bí mật ở server.
