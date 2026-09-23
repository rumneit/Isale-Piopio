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

### 🟡 Đã code nhưng sai/thiếu logic (ĐÃ SỬA)

| # | Vấn đề | Mức độ | Cách xử lý |
| --- | --- | --- | --- |
| 1 | **Phân quyền lưu mà không hề được thực thi.** `authGuard` chỉ kiểm tra đăng nhập; nhân viên không quyền vẫn vào mọi trang. | Cao (bảo mật) | Thêm `permissionGuard` + bản đồ `ROUTE_PERMISSIONS`; gắn cho 48 route. |
| 2 | Menu hiển thị mọi mục cho mọi vai trò. | Trung bình | `visibleMenuItems` lọc theo `auth.can()`. |
| 3 | Vai trò chỉ có `owner`/`staff`, không có preset chuẩn kho. | Trung bình | Thêm 5 vai trò + preset (Quản lý kho, Picker, Kế toán…). |
| 4 | Trang Kiểm kho **sửa thẳng `stock`**, không có phiếu, không lưu vết, không tính chênh lệch. | Cao (toàn vẹn dữ liệu) | Viết lại thành **phiếu kiểm kê** (draft → completed), tính diff, chỉ ghi tồn khi chốt. |
| 5 | RLS chỉ theo "thành viên shop", không phân biệt quyền ghi. | Cao (bảo mật) | Migration v12: `has_permission()` + siết policy ghi cho products/categories/transactions/money_accounts/customers/stock_counts. |

### 🔴 Chưa có (ghi nhận — chưa xây trong đợt này)

| # | Module mẫu | Ghi chú |
| --- | --- | --- |
| 1 | `/sales-route` — Tuyến bán hàng | Nghiệp vụ riêng, cần bảng `sales_routes` + gán khách theo tuyến. |
| 2 | `/sales-channels` — Kênh bán hàng | Danh mục + gắn vào đơn. |
| 3 | `/contact/filter-duplicate` — Lọc khách trùng | Thuật toán so khớp SĐT/tên. |
| 4 | `/contact/crm-deals`, `crm-forecast`, `crm-quota`, `crm-approvals`, `crm-flow-settings` | Mở rộng CRM nâng cao. |
| 5 | `/fbpage`, `/zbs-marketing`, `/sms-marketing` | Tích hợp marketing (cần API bên thứ ba). |
| 6 | `/ai-services`, `/ai-dynamic-page` | Dịch vụ AI (cần API key nhà cung cấp). |
| 7 | `/table`, `/custom-field` — Bảng & trường tùy chỉnh | Metadata-driven, khối lượng lớn. |
| 8 | `/sepay-payment` — Loa/đối soát SePay | Cần webhook + API SePay. |
| 9 | `/excel-report`, `/timely-report`, `/category-report` | Biến thể báo cáo. |
| 10 | `/external-api`, `/request-pro`, `/pricing` | Vận hành SaaS/đối tác. |

### Ghi chú về ảo hóa & barcode (chuẩn WMS)

- **Barcode/QR**: đã có `scan.page.ts` (camera `BarcodeDetector` + nhập tay + tra theo SKU).
- **Ảo hóa (virtualization)**: codebase hiện **chưa** dùng `cdk-virtual-scroll`/`ion-virtual-scroll`.
  Danh sách hiện tải toàn bộ theo shop. Với hàng nghìn SKU cần bổ sung — ghi nhận là hạng mục
  tiếp theo, chưa thực hiện trong đợt này để tránh thay đổi rộng chưa kiểm thử.

---

## 4. Đã thực thi trong đợt này

**File mới**
- `src/app/core/permissions.ts` — nguồn duy nhất cho RBAC (quyền, vai trò, preset, map route→quyền).
- `src/app/core/permissions.spec.ts` — 9 test đơn vị cho RBAC.
- `src/app/core/services/stock-counts.service.ts` — nghiệp vụ phiếu kiểm kê.
- `src/app/pages/stock-check/stock-count-detail.page.ts` — tạo/sửa/chốt phiếu kiểm kê.
- `supabase-migration-v12.sql` — bảng `stock_counts`, hàm `has_permission()`, siết RLS.

**File sửa**
- `src/app/core/services/auth.service.ts` — thêm `can()`, `canAccessRoute()`, `isOwner`.
- `src/app/core/guards/auth.guard.ts` — thêm `permissionGuard`.
- `src/app/app.routes.ts` — gắn guard cho 48 route + 2 route kiểm kê mới.
- `src/app/app.component.ts|html` — menu lọc theo quyền.
- `src/app/pages/permissions/permissions.page.ts` — chọn vai trò + preset.
- `src/app/pages/stock-check/*` — danh sách phiếu kiểm kê.
- `src/app/core/models/models.ts` — `Profile.permissions`, `StockCount`, `StockCountItem`.
- `audit.mjs`, `package.json` — thêm route kiểm kê + script `test:ci`.

---

## 5. Kết quả kiểm chứng

| Kiểm tra | Lệnh | Kết quả |
| --- | --- | --- |
| Icon hợp lệ | `npm run check:icons` | 108 icon, **0 lỗi** |
| Lint | `npm run lint` | **All files pass** |
| Build | `npm run build` | **exit 0** |
| Test đơn vị | `npm run test:ci` | **9/9 pass** |
| Audit route (Playwright) | `npm run audit` | **54/54 PASS, 0 FAIL** |

---

## 6. Việc còn lại / cần quyết định

1. **Chạy migration v12** trên Supabase Dashboard (SQL Editor) để bảng `stock_counts`
   và RBAC cấp DB có hiệu lực.
2. **Push & deploy**: repo local chưa có `.git`, chưa có credential GitHub/Vercel
   (`GITHUB_TOKEN`, `VERCEL_TOKEN` đều trống, `gh`/`vercel` chưa đăng nhập) → **chưa thể push**.
3. Ưu tiên đợt sau: ảo hóa danh sách SKU, Tuyến bán hàng, Lọc khách trùng.
