# AUDIT REPORT — ISALE "BÁO CÁO & BIỂU ĐỒ" (360°)

> **Phạm vi:** 100% module Báo cáo của isale.online (web app Ionic/Angular + backend `api2.isale.online`), reverse-engine qua Edge CDP (read-only) + phân tích bundle.
> **Mục tiêu:** PRD nâng cấp chuẩn SaaS quốc tế + kiến trúc UI/UX + Frontend + Database/Backend + Security cho **PioPio** (Angular 22 + Ionic 8 + Supabase).
> **Bằng chứng:** payload/response thật (tài khoản test có dữ liệu thật T5–T7/2026: 181 đơn, ~394 triệu ₫), screenshot `audit-output/isale-report/shots/`, code decompile từ chunk đã lưu.
> **Ngày audit:** 28/09/2026 · Migration PioPio kế tiếp: **v26** (v25 = shipments đã dùng).

---

## PHẦN 0 — BẢN ĐỒ MODULE (100% route, không bỏ sót)

### 0.1 Route thực tế (đã điều hướng + chụp màn hình từng route)

| # | Route Isale | Title trang | Vai trò | Chunk (webpack) |
|---|---|---|---|---|
| 1 | `#/report` (= `#/excel-report`) | "Báo cáo, biểu đồ" | **Hub 9 thẻ** (2 nhóm) | 4155 + 8592 + 625 |
| 2 | `#/order/export` | "Báo cáo bán hàng" | **Trang báo cáo chính 4-in-1** (Theo đơn/Sản phẩm/Khách hàng/Nhân viên) | 4155/7393/8592/5616 + 2950 (order module) |
| 3 | `#/order/select-filter` | (form điều kiện) | Chọn khoảng ngày + loại báo cáo + KH/NV/SP + cửa hàng | 2950 |
| 4 | `#/timely-report` | "Báo cáo bán hàng" | **Alias** → /order/export | — |
| 5 | `#/category-report` | "Báo cáo bán hàng" | **Alias** → /order/export (+ module saved-report riêng 8025) | 4155+7393+8025 |
| 6 | `#/product-report` | "Báo cáo bán hàng" | **Alias** → /order/export (+ module saved-report riêng 892) | 4155+8592+892 |
| 7 | `#/timely-report/detail` | "Biểu đồ doanh thu" | Biểu đồ tuần/tháng + XEM XU HƯỚNG | 5616 |
| 8 | `#/chart/detail` | "Biểu đồ xu hướng" | Trend cả năm (bars tuần) + tab "Dữ liệu" | 6841+4155+2835 |
| 9 | `#/debt-report` | "Báo cáo vay/nợ" | Hub 4 loại nợ: Bạn đã vay / Đã vay bạn / Nợ phải trả / Nợ của khách | 4155+8592+4283 |
| 10 | `#/product/export` | "Báo cáo tồn kho" | Tồn kho tổng hợp **và** Xuất nhập (2 reportType) | 5616/3462 |
| 11 | `#/report/update/:id`, `/category-report/update/:id`, `/product-report/update/:id` | Sửa báo cáo tự tạo | **Hệ thống báo cáo lưu sẵn (custom saved reports)** | 7393/5616/892 |

Menu chính: entry `selling.excel-report`, icon `trending-up`, màu `#2C3E50`, section "Bán hàng".

### 0.2 Hub 9 thẻ (`#/report`)

**Nhóm "Báo cáo bán hàng":** Tổng hợp theo đơn hàng · Tổng hợp theo sản phẩm · Tổng hợp theo khách hàng · Tổng hợp theo nhân viên · Biểu đồ doanh thu · Báo cáo vay/nợ.
**Nhóm "Sản phẩm":** Xuất SP ra Excel · Báo cáo tồn kho tổng hợp · Báo cáo xuất nhập.

> ⚠️ Phát hiện cấu trúc: 4 thẻ "Tổng hợp theo…" **cùng trỏ 1 trang** `/order/export` — phân biệt bằng `reportType 0|1|2|3` gửi lên API. Không có 4 trang riêng.

---

## PHẦN 1 — VP OF PRODUCT: REVERSE-ENGINEERING METRICS & ĐIỂM YẾU

### 1.1 Toàn bộ metrics Isale đang có (đếm từng cái)

**A. Báo cáo bán hàng (`POST /excel/SalesReport`) — 13 KPI tổng:**

| KPI UI | Field API | Ghi chú |
|---|---|---|
| Tổng | `total` | Doanh thu có VAT |
| Tg ko VAT | `totalNoVAT` | |
| VAT | `totalVAT` | |
| Phí ship | `totalShip` | |
| Chiết khấu | `totalDiscount` | |
| Chi phí | `totalCost` | = giá vốn (COGS) |
| **Lợi nhuận** | `totalRevenue` | Đã xác minh công thức: `total − VAT − totalShip − totalCost` (183.268.860 − 6.268.160 − 50.000 − 118.418.550 = 58.532.150 ✓) |
| Số lượng | `totalQuantity` | 2.460,3 (Type sản phẩm) |
| Số sản phẩm | `totalProducts` | 57 |
| Số đơn | `totalItems` | 91 (Jun-2026) |
| Đã thu | `totalPaid` | |
| Tiền thối | `totalChange` | |
| Lợi nhuận NV | `totalStaffRevenue` | **BUG: = −20.137.828.500 khi đơn không gán NV** (thấy ở Type 3, Jun-2026) |

**Request thật (bắt qua hook fetch):**
```json
POST https://api2.isale.online/excel/SalesReport
{ "dateFrom": "2026-06-01 00:00:00", "dateTo": "2026-06-30 00:00:00",
  "reportType": "0", "lang": "vn", "storeId": 0,
  "orderIds": null, "contactId": 0, "productId": 0 }
```

**Response thật (1 DTO phẳng dùng chung 4 reportType — "God DTO"):**
```json
{ "total": 183268860.0, "totalDiscount": 0.0, "totalShip": 50000.0,
  "totalNoVAT": 176950700.0, "totalVAT": 6268160.0, "totalPaid": 183268860.0,
  "totalChange": 0.0, "totalCost": 118418550.0, "totalRevenue": 58532150.0,
  "totalStaffRevenue": 0.0, "totalQuantity": 2460.3, "totalProducts": 57.0,
  "fromDate": "2026-06-01T00:00:00", "endDate": "2026-06-30T00:00:00",
  "totalItems": 91, "type": 0,
  "items": [ { "id": 384449, "code": "DH12C6EEB2B3",
    "createdAt": "2026-06-30T09:56:23+07:00", "unit": null,
    "discount": 0, "netValue": 2440000, "tax": 0, "shippingFee": 0,
    "paid": 2440000, "change": 0,
    "contact": "Ngọc Nguyên | 0932437696",   // ← Type 0/2: tên KH; Type 1: TÊN SẢN PHẨM
    "contactAddress": "E50 cư xá phú lâm B, p13, q6",
    "status": 3, "total": 2440000, "cost": 2400000, "revenue": 40000,
    "staffRevenue": 0, "staff": "", "billOfLadingCode": null,
    "shippingPartner": null, "shipperName": null, "shipperPhone": null,
    "shipCostOnCustomer": false, "deliveryAddress": null,
    "quantity": 4,                            // ← Type 1/2: số lượng; Type 0: null
    "items": null,
    "subItems": [ ... ] } ] }                 // ← Type 2/3: danh sách SP con
```

| reportType | Ý nghĩa | `items[]` là gì | Drill-down |
|---|---|---|---|
| `"0"` | Theo đơn | 91 dòng đơn hàng (mã, ngày, trạng thái, KH, NV, tạm tính, ship, chiết khấu, thuế, tổng) | click → `/order/detail/:id` |
| `"1"` | Theo sản phẩm | 57 dòng SP (`contact` = tên SP, `quantity`, `total/cost/revenue`) | click → `/product/detail/:id` |
| `"2"` | Theo khách hàng | 50 dòng KH (`quantity` = số đơn, `subItems` = SP đã mua) | click → `/contact/detail/:id` |
| `"3"` | Theo nhân viên | 1 dòng (NV rỗng) — **số liệu sai** | click → `/staff/detail/:id` |

**B. Biểu đồ doanh thu (`#/timely-report/detail` + `#/chart/detail`):**
- Nguồn dữ liệu: `POST /trade/list` với payload **`{"dateFrom":"","dateTo":"","isReceived":-1}`** = kéo **TOÀN BỘ giao dịch thu/chi**, không lọc ngày, không phân trang.
- Aggregate **client-side** (xem 1.2). Grain: Ngày / Tuần / Tháng; thanh Trước–Tới–Hiện tại; type Đường/Cột; XEM XU HƯỚNG → trend cả năm theo tuần ISO (labels "Tuần 1…39", peak ~59 triệu/tuần, filter auto `01/01`→`hôm nay`).
- Tab "Dữ liệu" = bảng số liệu tương ứng.
- Chart lib: **ng2-charts (Chart.js)** — options v1-style `{scaleShowVerticalLines:false, responsive:true, bezierCurve:false}`.

**C. Báo cáo vay/nợ (`#/debt-report`):** 4 thẻ → `POST /debt/list` `{dateFrom, dateTo, debtType, storeId, staffId?}` (`getDebtsByType/getDebtsByOrder/getDebtsByReceivedNote`).

**D. Tồn kho & xuất nhập (`#/product/export`):** `POST /excel/ProductReport` `{dateFrom, dateTo, reportType:0, lang, productId, storeId}` → `{fromDate, endDate, totalCost, totalSale, totalItems, items[]}`. Bảng: **Mã SP · Tên SP · Đơn vị · Tồn đầu kỳ · Nhập · Xuất · Tồn cuối kỳ · Tổng bán · Tổng chi phí**.

**E. Xuất SP ra Excel:** thẻ bắn luôn `POST /excel/products` `{lang:"vn"}` (trigger download server).

**F. Báo cáo tự tạo (saved reports)** — ít người biết nhưng quan trọng: tạo báo cáo theo **Mục hàng / Khách hàng / Sản phẩm / Theo ngày**, có `dataSources` (JSON filter: chọn/khác trừ danh sách contact/product), `dateType` (ngày/tuần/tháng/quý), chart bar + xuất Excel + share ảnh (canvas `toDataURL`). Tính toán bằng `reportService.calculate*()` (mục 1.2).

### 1.2 Điểm yếu phân luồng dữ liệu (đối chiếu code đã decompile)

| # | Vấn đề | Bằng chứng code/payload | Hậu quả |
|---|---|---|---|
| Y1 | **Full-table scan cho biểu đồ** | `reportService.calculateChartOnReport()` → `tradeService.getTrades()` **không tham số** → `POST /trade/list {"dateFrom":"","dateTo":"","isReceived":-1}`. `#/chart/detail` gọi **2 lần** | Mỗi lần mở chart tải TOÀN BỘ giao dịch lịch sử qua mạng; NLarge → chậm, tốn băng thông, crash tab |
| Y2 | **Aggregate O(P×S×N) client-side** | Vòng lặp `for (period) { for (source) { for (trade) calculateReportTotal() } }` trong main bundle | CPU-kill trên điện thoại; không scale quá ~50–100k giao dịch |
| Y3 | **God DTO 4-in-1** | `/excel/SalesReport` 1 schema, `contact` = tên KH **hoặc** tên SP tùy `reportType`; `quantity` đổi nghĩa | Không type-safe, client phải if/else render, dễ sai |
| Y4 | **Bug ngày kết thúc** | Month-picker sinh `dateTo: "2026-06-30 00:00:00"` (thiếu 23:59:59) — còn thấy "đến 01/10/2026" ở filter mặc định | **Mất toàn bộ đơn phát sinh ngày cuối kỳ** |
| Y5 | **Bug số liệu nhân viên** | Type 3 Jun-2026: `staffRevenue: -20137828500` (âm 20 tỷ) khi `staff:""` | Số liệu tài chính sai trực tiếp |
| Y6 | Không PoP, không cohort, không forecast | — | Không trả lời được "tháng này vs tháng trước", "tỷ lệ quay lại" |
| Y7 | Drill-down nửa vời | Bar chart **không click được**; chỉ list row → trang chi tiết entity; không có ngày→tuần→tháng drill | Người dùng phải đổi filter thủ công |
| Y8 | Xuất Excel không async | `excelService.exportExcel()` dựng file **trong UI thread** (web); web download chỉ truyền `orderIds` | >10–50k dòng treo trình duyệt; không có job/queue |
| Y9 | Không cache | Không thấy cache layer; mỗi nav = refetch; `/trade/list` full-table lặp lại | Server tự đâm mình |
| Y10 | Phân quyền mỏng | Menu ẩn bằng `hidden:()=>…` phía client; API phân quyền theo token; không thấy audit log export | Cào dữ liệu/xe dữ liệu liên shop không có vết |

### 1.3 TOP 1% — Tính năng nâng cấp (thiết kế cho PioPio)

#### 1.3.1 Drill-down / Drill-through 4 tầng
```
Năm → Quý → Tháng → Tuần → Ngày → HÓA ĐƠN (danh sách) → Chi tiết đơn
```
- **Nguyên tắc:** mọi "cây" biểu đồ đều click được; click cột Tháng 6 = 183.268.860₫ → tự hẹp vùng thời gian & vẽ lại 30 cột ngày; click cột ngày → sheet danh sách hóa đơn hôm đó; click hóa đơn → trang chi tiết có sẵn.
- **Breadcrumb điều hướng:** `2026 ▸ Q2 ▸ Tháng 6 ▸ 15/06` + nút ⤴ để bật lại tầng.
- **Triển khai PioPio:** 1 RPC `report drilldown` nhận `(metric, ts_from, ts_to, grain)` → trả mốc con; UI giữ stack `drillStack[]`.

#### 1.3.2 Cohort Analysis (giữ chân khách)
- Ma trận cohort theo tháng đầu mua: hàng = cohort, cột = M0…M12, ô = % khách quay lại + GMV mỗi ô.
- SQL gốc (PioPio/Postgres, chạy trên view `fact_order_line`):
```sql
with first_order as (
  select contact_id, date_trunc('month', min(ordered_at)) as cohort_month
  from orders where shop_id = auth_shop() and status = 'done'
  group by contact_id
),
activity as (
  select o.contact_id, date_trunc('month', o.ordered_at) as act_month,
         sum(o.total) as gmv, count(*) as orders
  from orders o join first_order f using (contact_id)
  where o.shop_id = auth_shop() and o.status = 'done'
  group by 1, 2
)
select f.cohort_month,
       (extract(year from act_month) - extract(year from cohort_month)) * 12
       + (extract(month from act_month) - extract(month from cohort_month)) as month_n,
       count(distinct a.contact_id) as buyers,
       sum(a.gmv) as gmv
from activity a join first_order f using (contact_id)
group by 1, 2;
```
- UI: heatmap (xanh đậm = giữ chân cao), toggle **% giữ chân / GMV / số đơn**; hover ô = tooltip "Cohort T5/2026 · M3 · 18% (9/50 khách)".

#### 1.3.3 Period-over-Period (PoP) động
- Mọi KPI card có **3 số**: giá trị kỳ này, Δ% vs kỳ trước, Δ% vs cùng kỳ năm trước + sparkline 12 kỳ.
- Chế độ so sánh: biểu đồ 2 series chồng (kỳ này vs kỳ trước) + bảng chênh lệch tuyệt đối/%.
- Ky Selector: `Hôm nay / Tuần / Tháng / Quý / Năm / Tùy chọn` ↔ tự đảo `period = from–to`, `prev = period − 1`, `yoy = period − 1 năm`.

#### 1.3.4 Export & Share BẤT ĐỒNG BỘ (1 triệu dòng không đứng máy)
```
[User] → POST /export-jobs {metric, filters, format: xlsx|pdf|csv}
       ← 202 {job_id, status:"queued"}            (không chặn UI)
[Edge Function/Deno] queue job → chunk query 50k dòng/lượt (cursor)
       → stream vào ExcelJS Web Worker → ghi file vào Supabase Storage
       → UPDATE export_jobs (status, file_path, rows, finished_at)
[Client] realtime subscribe export_jobs → toast "Xong ⬇" → signed URL (hạn 24h)
[ Luôn ] INSERT export_audit (ai, IP, filter gì, file nào, bao nhiêu dòng)
```
- Trạng thái job: `queued → running (progress %) → done | failed` — thấy được trong trang "Xuất khẩu của tôi".
- Chặn sync-export > 20k dòng; nhỏ hơn thì vẫn cho tải trực tiếp.

---

## PHẦN 2 — PRINCIPAL DESIGNER: UI/UX THEO TUFTE (ANTI COGNITIVE LOAD)

### 2.1 Nguyên tắc áp dụng cho trang Dashboard

| Nguyên tắc Tufte | Áp dụng cụ thể vào PioPio |
|---|---|
| **Data-Ink Ratio tối đa** | Bỏ khung card (dùng khoảng trắng + divider 1px mờ), bỏ nền gradient; gridline chỉ giữ 3–4 mốc ngang, màu `--border` 8% opacity; bỏ trục Y khi data label đã hiện giá trị |
| **Sparklines thay lời** | Mỗi KPI line = số lớn + sparkline 12 kỳ + chip Δ% (xanh/đỏ); không vẽ biểu đồ riêng nếu chỉ có 1 series nhỏ |
| **Small multiples > dashboard ôm đồm** | 6 small-multiple (Doanh thu/Đơn/Lợi nhuận/Khách mới/Giỏ TB/Quay lại) cùng trục thời gian — soi xu hướng chéo tức thì |
| **Chartjunk = 0** | Không đổ bóng, không 3D, không bevel; legend chỉ khi ≥2 series; label trực tiếp đầu đường line thay legend |
| **Color = dữ liệu, không trang trí** | 1 màu chủ đạo (xanh hàng hóa), đỏ chỉ cho âm/rủi ro; every-non-data-ink greyed (#94A3B8) |

### 2.2 Bảng màu Semantic — WCAG 3.0 (APCA) + color-blind safe

| Token | Hex | Dùng | Contrast trên nền trắng (APCA) |
|---|---|---|---|
| `--pos` | `#0B7A4B` | tăng trưởng, thu | Lc ≈ 7.2 ✓ text |
| `--neg` | `#C2372E` | giảm, chi, rủi ro | Lc ≈ 7.0 ✓ |
| `--brand` | `#3B4CC0` | series chính | ✓ |
| `--warn` | `#B45309` | cảnh báo | ✓ |
| `--ink-2` | `#475569` | nhãn phụ | ✓ |
| series palette | `#3B4CC0 #0B7A4B #B45309 #6D28D9 #0891B2` | 5 series tối đa | phân biệt được bởi **người mù màu 3 loại** (kiểm tra deuteranopia/protanopia/tritanopia) |

- **Quy tắc cứng:** xanh/đỏ KHÔNG bao giờ là tín hiệu duy nhất → luôn kèm mũi tên ▲▼ và dấu +/−; Pie/Donut (nếu có) ≤5 lát + label trực tiếp, nếu >5 chuyển thanh ngang 100%.
- Donut chỉ dùng cho cơ cấu 1 tổng (ví dụ doanh thu theo kênh); so sánh nhiều nhóm dùng bar ngang.

### 2.3 Progressive Disclosure — Mobile-first layout

**Màn 1 (above the fold, 390×844):**
```
┌──────────────────────────────────────┐
│ Báo cáo            [01/09–30/09 ▾] ⚙ │  ← 1 hàng: chip kỳ + icon filter
├──────────────────────────────────────┤
│ DOANH THU            ▲ 12,4% vs T7   │
│ 183,3tr₫   ╱╲╱╲╱╲_╱╱ (sparkline)     │  ← KPI #1
├──────────────────────────────────────┤
│ LỢI NHUẬN 58,5tr₫   ▲8,1% │ ĐƠN 91 ▼3│  ← KPI #2, #3 cạnh nhau
├──────────────────────────────────────┤
│ [Biểu đồ chính — cột theo ngày]      │  ← 1 biểu đồ duy nhất
│  ▁▂▄▆█▅▃▂▄▆...  (tap = drill)        │
├──────────────────────────────────────┤
│  Top sản phẩm ▾ | Top khách ▾ | CTV ▾│  ← segmented, 1 list 5 dòng
└──────────────────────────────────────┘
```
- **Chỉ 3 KPI + 1 chart + 1 top-list** trên màn đầu. Còn lại: sheet "Thêm chỉ số" (bottom-sheet, kéo chọn KPI gắn vào màn chính, lưu user-profile).
- Filter phức tạp (loại báo cáo, nhân viên, cửa hàng, nhóm hàng, so sánh PoP) → **off-canvas trái** (swipe) với nút "Áp dụng" sticky; chip filter đang bật hiện dưới header, xóa từng chip 1 chạm.

**Wireframe trang Desktop (≥1024px):**
```
┌ Filters bar (kỳ · so sánh · NV · cửa hàng · nhóm hàng) ─ [Áp dụng] ┐
├ 6 KPI strip (sparkline + ΔPoP + ΔYoY) ────────────────────────────┤
├ Main chart 2/3  │  Cơ cấu theo nhóm hàng (bar ngang) 1/3 ─────────┤
├ Cohort heatmap (full-width, collapsible) ─────────────────────────┤
├ Leaderboards: SP │ KH │ NV (tabs, 10 dòng, cột số + Δ) ───────────┤
└ [Xuất Excel] [Xuất PDF] [Lưu báo cáo] ────────────────────────────┘
```

### 2.4 Micro-interactions (kịch bản animation)

| Tình huống | Kịch bản |
|---|---|
| **Hover line chart (desktop)** | Crosshair dọc 1px `--border`; dot 6px tại điểm gần nhất; tooltip ở **右** lệch 12px, cấu trúc: ngày (semibold) → giá trị (mono 600) → Δ% vs cùng kỳ (chip màu); nền tooltip `.96` blur; flip sang trái khi gần mép |
| **Touch bar (mobile)** | Long-press 150ms = crosshair + haptic light; thả tay = tooltip biến mất 200ms |
| **Drill-in** | Cột được tap scale 0.97 + highlight; biểu đồ cũ slide-left 240ms ease-out, chart mới fade+slide-in; breadcrumb hiện tầng mới |
| **Loading** | Skeleton: KPI = khối 64×24 shimmer; chart = 12 cột xám nhấp nhô theo dữ liệu mẫu (giữ layout, không CLS); **không** spinner toàn trang |
| **Empty state** | "Chưa có đơn trong kỳ này" + nút "Chọn kỳ khác"; không vẽ trục rỗng |
| **Số chạy (count-up)** | 450ms, chỉ khi ≤ 1 triệu; tắt respect `prefers-reduced-motion` |
| **Stale-while-revalidate** | Vẽ dữ liệu cache ngay (mờ 0.6 + badge "đang cập nhật"), refetch rồi cross-fade |

---

## PHẦN 3 — STAFF FRONTEND ENGINEER: RENDER HIỆU SUẤT CAO

### 3.1 Engine lựa chọn

| Nhu cầu | Lựa chọn | Lý do |
|---|---|---|
| < 5k điểm/series (90% dashboard) | **SVG — ngx-charts/ECharts SVG renderer** | nét, dễ a11y, DOM rẻ ở scale này |
| 5k–500k điểm (trend tick giây, heatmap lớn) | **ECharts WebGL (gl renderer) / Canvas** | 60fps, brush/zoom nhanh |
| Custom 100% (heatmap cohort) | **Canvas 2D thuần** trong 1 component | kiểm soát từng pixel |
| Isale đang dùng | ng2-charts/Chart.js | không WebGL, kém ở >10k điểm |

**Quyết định PioPio: Apache ECharts (ngx-echarts)** — 1 lib phủ cả SVG lẫn WebGL, built-in dataZoom = drill/brush miễn phí, SSR-safe, bundle ~380kB lazy (chỉ load chunk report).

### 3.2 Virtualization + Web Workers (pseudocode)

```ts
// report-data.worker.ts (Web Worker — không block UI thread)
type RawTxn = { id: string; ts: string; type: 'sale'|'refund'|'expense';
                total: number; cost: number; contact_id: string; product_id: string };
type Grain = 'day'|'week'|'month'|'quarter'|'year';

self.onmessage = (e: MessageEvent<{
  raw: RawTxn[]; grain: Grain; from: number; to: number;
  compare?: { from: number; to: number };
}>) => {
  const { raw, grain, from, to, compare } = e.data;

  // 1) Bucket theo grain — 1 lượt quét O(N), dùng Int/epoch thay string Date
  const buckets = new Map<number, Agg>();       // key = epoch bucket đầu kỳ
  for (let i = 0; i < raw.length; i++) {        // không .filter()/.map() chuỗi → 0 GC pressure
    const t = raw[i];
    if (t.ts < from || t.ts > to) continue;
    const k = bucketOf(t.ts, grain);
    const b = buckets.get(k) ?? emptyAgg();
    if (t.type === 'sale')  { b.revenue += t.total; b.cogs += t.cost; b.orders++; b.contacts.add(t.contact_id); }
    if (t.type === 'expense') b.expense += t.total;
    buckets.set(k, b);
  }
  // 2) PoP: chạy 2 vòng như trên cho prev/yoy rồi zip theo index kỳ
  // 3) Downsample LTTB về ≤ 2000 điểm trước khi trả cho chart
  postMessage({ series: [...buckets], pop: zip(prevBuckets, buckets) });
};
```
```ts
// ReportFacade (main thread)
private cache = new Map<string, AggPage>();          // key = metric+grain+range hash
async load(metric, grain, range) {
  const hit = this.cache.get(key(metric, grain, range));
  if (hit) return paintStale(hit);                   // SWR: vẽ ngay
  const { data } = await this.supabase.rpc('report_timeseries', {...});  // server aggregate (P4)
  const agg = await this.workerPool.run(data);       // OffscreenCanvas-ready pool = navigator.hardwareConcurrency-1
  this.cache.set(key(...), agg);
  return agg;
}
// Pool: transferable ArrayBuffer (Structured Clone) — zero-copy
```

### 3.3 State Management (Angular 22 signals — không cần Zustand)

```ts
@Injectable({ providedIn: 'root' })
export class ReportState {
  // nguồn sự thật duy nhất cho cả dashboard
  readonly range     = signal<Range>(thisMonth());
  readonly compare   = signal<'prev'|'yoy'|'none'>('prev');
  readonly filters   = signal<Filters>({ staffId: 0, storeId: 0, categoryId: 0, channel: 'all' });
  readonly grain     = signal<Grain>('day');
  readonly drill     = signal<DrillLevel[]>([]);       // stack drill-down

  // derived — mọi chart đọc từ đây ⇒ đổi filter = toàn bộ re-render đồng bộ
  readonly query = computed(() => ({ ...untrack(this.range), grain: this.grain(),
                                     ...this.filters(), cmp: this.compare() }));
  readonly data   = resource(() => this.query(), this.facade.load);  // fetch + cache + abort
  readonly series = computed(() => toECharts(this.data(), this.compare()));
}
```
- Header đổi ngày → `range.set()` → `query` đổi → **tất cả 10 chart/tài nguyên tự recompute** (signals graph), chart chỉ re-render khi series thật sự đổi (reference equality).
- Abort in-flight khi query đổi (AbortController trong facade); không Waterfall: prefetch cácRPC song song `Promise.all`.

### 3.4 GenericChartComponent (Atomic Design)

```
molecules/ChartSkeleton, KpiCard, SeriesLegend
organisms/ChartBox  ← GenericChartComponent
  props: { spec: ChartSpec; height; loading; empty; onDataPick(point); ariaLabel }
  ChartSpec = { kind: 'bar'|'line'|'heat'|'hbar'; series; xKey; yKeys[]; stack?; colorMap }
```
- **ResizeObserver** → set `chart.resize()` debounce rAF; breakpoint mobile chuyển bar↔line tự động.
- **Error Boundary** = `ErrorHandler` scope + `@if (err) { <RetryBox/> }` trong template — chart lỗi không đổ vỡ dashboard.
- A11y: `role="img"` + `aria-label` mô tả xu hướng ("Doanh thu 6/2026 tăng 12% so với 5/2026"); bảng dữ liệu ẩn (`sr-only`) song song chart.
- Zoneless PioPio: mọi event chart qua `NgZone.runOutsideAngular` không cần (đã zoneless) — nhớ `inject(ChangeDetectorRef)` không lạm dụng; signals đủ.

---

## PHẦN 4 — SENIOR DATA ARCHITECT: <200ms BẤT KỂ 10 HAY 100 TRIỆU DÒNG

### 4.1 Đối tượng lỗi của Isale (nhắc lại bằng chứng)
`/trade/list` rỗng ngày = full scan + client aggregation → kiến trúc ngược với OLAP. PioPio cần **pre-aggregation** ngay từ đầu.

### 4.2 Database Design (Supabase/Postgres trước, ClickHouse sau nếu >100M dòng)

```
OLTP (đã có): orders, order_items, trades, products...
        │  (không query report trực tiếp nữa)
        ▼
fact_order_line  (bảng wide, 1 dòng = 1 dòng hóa đơn, append-only,
                  index (shop_id, ordered_at DESC), (shop_id, product_id, ordered_at))
        ▼
MV/aggregates   : agg_daily(shop_id, day, revenue, cogs, vat, ship, discount,
                            orders, qty, new_customers, returning_customers)
                  agg_product_daily(shop_id, day, product_id, qty, revenue, cogs)
                  agg_contact_daily(shop_id, day, contact_id, orders, revenue)
                  agg_staff_daily(shop_id, day, staff_id, orders, revenue, profit)
        ▼
RPC báo cáo     : report_timeseries(), report_leaderboard(), report_cohort(),
                  report_drilldown(), report_inventory()   ← tất cả đọc agg_*
```
- **Materialized View + refresh tăng đoạn:** `REFRESH MATERIALIZED VIEW CONCURRENTLY agg_daily` chỉ range đổi, hoặc bảng agg thường + upsert nightly.
- **Time-scale/khi nào cần ClickHouse:** PioPio ≈ 10⁵–10⁷ dòng/năm → Postgres + partition theo tháng là đủ; ClickHouse chỉ khi >10⁸ dòng hoặc analytics phức tạp đa biến.

### 4.3 Pre-aggregation Pipeline (ETL nửa đêm + incremental)

```
[pg_cron 00:05]  CALL etl_rebuild_daily(CURRENT_DATE - INTERVAL '3 days')
                 → xoá/insert lại agg_* của 3 ngày gần nhất (idempotent, catch-up giao dịch muộn)
[Trigger OLTP]   AFTER INSERT/UPDATE ON orders/trades → INSERT staging_delta
                 (chỉ ghi key: shop_id, day, product_id…) — không tính nặng trong trigger
[Edge Function mỗi 1 phút]  xử lý staging_delta → upsert agg_ tương ứng (MERGE)
                 → xoá dòng đã xử lý → NOTIFY 'agg_changed'
[Realtime]       client subscribe agg_daily (supabase realtime) → chart "hôm nay" tự nhích
```
- Đảm bảo:agg idempotent (rebuild trùng không nhân đôi), first-load fallback: nếu agg thiếu ngày → RPC tự cộng thêm từ fact trên range thiếu.

### 4.4 Caching nhiều lớp + Invalidation đúng chỗ

| Lớp | Nội dung | TTL/Invalidation |
|---|---|---|
| L1 Browser | signals cache (3.3) + `sessionStorage` | SWR 60s; đổi filter = key mới |
| L2 Edge/API | Supabase Edge cache (Deno KV) key=`shop:metric:grain:range:ver` | TTL 5 phút cho kỳ đã đóng; **kỳ mở (hôm nay) không cache** hoặc TTL 10s |
| L3 DB | MV/agg đã pre-compute | chính là "cache" vĩnh viễn + delta |
| Redis (tùy chọn P2) | hot dashboard per shop | pub/sub invalidation |

**Invalidation Real-time khi có đơn mới (chỉ đau "hôm nay", không xóa toàn bộ):**
```
POST /orders (thành công)
  → trigger ghi delta + NOTIFY
  → Edge Function bump ver của key "…:day:today:shop X" (XOÁ ĐÚNG 1 KEY)
  → realtime đẩy event `agg_daily:changed` tới client shop X
  → client chỉ refetch series [today] và splice vào chart (không tải lại 10 chart)
```

### 4.5 API Contract (REST/RPC chuẩn cho PioPio)

**GET-style RPC `report_timeseries`**
```jsonc
// Request
{ "metric": "revenue|profit|orders|qty|customers",
  "grain": "day|week|month|quarter|year",
  "from": "2026-06-01", "to": "2026-06-30",
  "compare": "prev|yoy|none",
  "dims": ["product_id"],             // optional breakdown
  "filters": { "staff_id": 0, "store_id": 0, "category_id": 0 },
  "cursor": null }                    // cursor-based pagination cho breakdown dài
// Response 200
{ "meta": { "grain": "day", "tz": "Asia/Ho_Chi_Minh", "generated_in_ms": 87 },
  "points": [ { "bucket": "2026-06-01", "value": 5819500,
                "cmp_prev": +12.4, "cmp_yoy": null } ],
  "totals": { "value": 183268860, "orders": 91, "cogs": 118418550 },
  "next_cursor": null }
```
- Pagination **cursor** (base64 của `last_bucket`) cho leaderboard/breakdown (default page 50, max 500).
- GraphQL (nếu cần): 1 query `report { timeseries(...) {...} leaderboards {...} }` — khuyến nghị bắt đầu bằng RPC cho đơn giản + RLS tự áp.
- Validation schema (zod) mọi tham số: `from<=to`, `to-from <= 366 ngày` với grain day, `metric ∈ enum`, `dims ∈ enum` — chặn SQLi/phạm vi lớn.

---

## PHẦN 5 — PRINCIPAL SECURITY ENGINEER: ĐA TÊN HÀNG & CHỐNG LẠI QUÁ TẢI

### 5.1 Data Isolation (Multi-tenant RLS — bắt buộc ở tầng DB)

```sql
-- Mọi bảng agg/fact đều có shop_id; RLS bật 100% (không ngoại lệ)
alter table agg_daily enable row level security;
create policy agg_daily_read on agg_daily
  for select using ( shop_id = (select public.auth_shop_id()) );  -- dùng SECURITY DEFINER function, search_path cứng
create policy agg_daily_write on agg_daily
  for all using (public.has_permission(shop_id,'report')) with check (public.has_permission(shop_id,'report'));

-- auth_shop_id(): lấy shop từ JWT (claim shop_id) — KHÔNG nhận từ client
create or replace function public.auth_shop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'shop_id','')::uuid $$;
```
- Nguyên tắc: **không bao giờ tin `shop_id` từ payload** — mọi RPC `report_*` ignore tham số shop từ client, ép bằng `auth_shop_id()`.
- Service-role key chỉ tồn tại trong Edge Function env, không bao giờ xuống browser.
- Test tự động: 2 shop A/B — mọi RPC gọi bằng token A phải assert không có dòng B (đưa vào smoke test).

### 5.2 Throttling & Rate Limiting (Token Bucket ở Edge)

```
Bucket: report_api, refill 10 req/s, capacity 30   (mỗi shop_id + IP)
Check:  DENY khi burst >30/phút hoặc >2k req/ngày/shop trên RPC report_*
Chặn scrape: pagination cursor ép bước nhẽ có limit ≤500; từ chối range > 366 ngày (grain day)
 + Cloudflare/WAF: rule challenge khi GET report liên tục >5 req/s/IP
429 response kèm Retry-After; client hiển thị "Quá nhiều yêu cầu, thử lại sau Xs"
```

### 5.3 Input Validation (payload test chống SQLi)

| Tham số | Luật | Payload test phải bị chặn |
|---|---|---|
| `from`,`to` | `^\d{4}-\d{2}-\d{2}$` + `date` parse + `from<=to` + range cap | `2026-01-01' OR 1=1--`, `2026-13-99` |
| `metric`,`grain`,`dims` | **enum whitelist**, không nội suy SQL | `revenue; DROP TABLE orders` |
| `cursor` | base64(json) chữ ký HMAC | cursor giả mạo shop khác |
| `orderBy` | whitelist `bucket|value` (không cho client đưa cột) | `(select pg_sleep(5))` |
| `limit` | int 1..500 | `9999999999` |
- Tất cả query qua PostgREST/RPC parameterized — không concat string SQL; audit kèm fuzz test định kỳ.

### 5.4 Audit Logs (ai, IP nào, lúc nào, xuất tháng nào)

```sql
create table export_audit (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null, user_id uuid not null,
  action text not null,               -- 'export_excel' | 'view_report' | 'share_link'
  metric text, params jsonb,          -- đúng filter user chọn (vd month=2026-06)
  rows bigint, file_path text,
  ip inet, user_agent text,
  created_at timestamptz default now()
);
-- RLS: chỉ role 'owner' trong shop đọc được; append-only (không update/delete policy)
```
- Trang "Nhật ký xuất khẩu": Owner xem lịch sử xuất (ai xuất doanh thu tháng nào, bao nhiêu dòng, IP nào) — đáp ứng cả kiểm toán nội bộ.
- Báo cáo xem cũng log (sampling 1:10 cho view thường, 1:1 cho export) để phát hiện đọc chui bất thường.

---

## PHẦN 6 — ĐỐI CHIẾU PIOPIO & KẾ HOẠCH TRIỂN KHAI

### 6.1 Tài nguyên PioPio sẵn có mà module này sẽ dùng
- Supabase `orders`/`order_items`/`trades` (Thu/Chi v21?) + RLS `is_shop_member`/`has_permission` (v12/v14 pattern).
- Realtime đã dùng ở shipments (postgres_changes) → tái dùng cho "hôm nay".
- Modal/sheet pattern, tiền `Intl.NumberFormat('vi-VN')`, zoneless signals — đồng bộ codebase.
- Migration kế tiếp: **v26** (nếu sau này làm Báo giá thì v27 trở đi — ghi nhận để tránh xung đột số).

### 6.2 Phân giai đoạn

| Giai đoạn | Nội dung | File/migration chính | Ước lượng |
|---|---|---|---|
| **P0 — Dashboard lõi** | Trang `/report`: 3 KPI (Doanh thu, Lợi nhuận, Số đơn) + chart cột theo ngày/tháng (ECharts lazy) + drill-down ngày→hóa đơn + chip filter kỳ | `migration-v26.sql` (fact view + agg_daily + RPC `report_timeseries` + RLS), `reports.service.ts`, `reports.page.*`, route + menu entry | ~1 session |
| **P1 — So sánh & bảng xếp hạng + tồn kho** | PoP prev/YoY mọi KPI, Top SP/KH/NV (drill vào detail), báo cáo tồn kho biến chuyển (tồn đầu/nhập/xuất/tồn cuối từ order_items + received/transfer notes) | RPC `report_leaderboard`, `report_inventory`; UI leaderboards + sheet | ~1 session |
| **P2 — Async export + audit + cohort** | Export job (Edge Function + Storage + signed URL), trang "Xuất khẩu của tôi", export_audit; heatmap cohort | `export-jobs` table + function; worker chunking | ~1–1.5 session |
| **P3 — Sau đó** | Saved reports tự tạo (như Isale nhưng server-side), forecast đường xu hướng, alert ngưỡng (Slack/Telegram) | — | theo nhu cầu |

### 6.3 Rủi ro & lưu ý
- **Không giả định:** chưa biết Supabase của PioPio đã có pg_cron chưa → P0 dùng RPC on-demand + realtime, pg_cron chỉ là tối ưu P1 (hỏi user khi tới giai đoạn).
- ECharts tăng ~380kB lazy chunk — chấp nhận (chỉ vào /report), hoặc gói Chart.js nhẹ hơn nhưng mất WebGL.
- Đơn "hủy/hoàn" phải loại trừ nhất quán ở mọi metric (định nghĩa `status='done'` rõ ràng như công thức Lợi nhuận Isale đã xác minh, cộng thêm loại trừ hoàn).
- Isale bugs phải tránh: dateTo mất 23:59:59, staffRevenue âm, God-DTO.

---

## PHỤ LỤC — BẰNG CHỨNG THU THẬP

| File (temp/opencode) | Nội dung |
|---|---|
| `isale-report-*.png`, `rpt-*.png`, `pg-*.png`, `rp*-type-*.png`, `dp-*.png`, `oe-*.png` | 20+ screenshot UI từng trang/trạng thái |
| `rpt-00-net.json` … `pg-*-net.json`, `rp2/3/4/5/6-*-net.json` | toàn bộ request/response API thật |
| `rp5-*-items.json`, `rp6-type-*-body.json` | items[] thật của 4 reportType (Jun-2026) |
| `isale-report-chunks.js`, `isale-chunk-{4155,5616,7393,8025,2835,2950,5690,3462}.js` | code decompile phục vụ trích dẫn |
| kịch bản probe | `isale-report-net/cards/types/final/sweep/678/extra.mjs` |

**Kết luận 1 dòng:** Isale có bộ KPI bán hàng đúng công thức và ý tưởng saved-reports tốt, nhưng kiến trúc dữ liệu (full-scan + client aggregation + God DTO + 3 bug số liệu) chỉ đủ cho shop nhỏ; PioPio sẽ vượt ở tầng OLAP pre-agg + drill-down + PoP/cohort + async export + RLS/audit — đúng chuẩn SaaS quốc tế.
