# 360° FULL-STACK AUDIT — MODULE ĐƠN VẬN CHUYỂN (ISale `/shipping`) → PioPio

Ngày audit: 27/09/2026 · Phương pháp: Reverse engineering qua CDP (read-only) + bóc tách JS chunks compiled (`4551` shipping, `9337` partners, `1170` delivery-note, `8592` config, order chunks) + i18n `vn.json` (shipping 25 keys, shipping-partners 19, order-add ~54 keys vận chuyển) + ảnh chụp live `/shipping`.
Tài khoản đang trống vận đơn (tính năng mới) → cấu trúc bóc 100% từ compiled code + i18n, không đoán.

---

## 0. KIẾN TRÚC ISALE BÓC ĐƯỢC (bằng chứng)

### 0.1 Kiến trúc tổng thể: Backend Proxy, KHÔNG gọi 3PL từ client
```
Client (order-add / shipping)                Server ISale                        3PL
─────────────────────────────                ────────────                        ───
shippingService.getPartners()      →  apiUrl/...  (catalog + settingsSchemaJson)
shippingService.getConnections()   →  credentials LƯU SERVER (token không bao giờ về client)
shippingService.quoteFee(payload)  →  gọi GHN/GHTK tính phí   →  trả giá
shippingService.createShipment()   →  gọi API hãng tạo vận đơn → trackingCode + labelUrl
shippingService.getTracking(id)    →  gọi API hãng lấy lịch sử → {events[]} chuẩn hoá
shippingService.cancelShipment(id) →  gọi API hãng hủy
shippingService.linkShipmentToOrder(shipmentId, orderId)
```
- **API token đối tác lưu phía server** sau khi connect — client chỉ nhận `status: connected|disconnected|error`.
- **Không polling, không WebSocket**: cập nhật trạng thái bằng nút refresh thủ công từng dòng (`refreshTracking → getTracking(id) → loadShipments()`) và load-on-open ở trang chi tiết.
- Danh sách: `getShipments({storeId, take:100, partnerCode?, status?, trackingCode?})` — phân trang 100 bản ghi/lần.

### 0.2 Model `shipment` (tần suất refs trong compiled code)
| Field | refs | Ý nghĩa |
|---|---|---|
| `fromAddress` / `toAddress` | 13/13 | Địa chỉ gửi/nhận (snapshot text) |
| `events` | 7 | **Timeline nhúng** trên bản ghi: `[{status, description?, location?, eventTime}]` |
| `weight` | 7 | **Gram**; hiển thị `>=1000 ? (w/1000)+' kg' : w+' gram'` |
| `orderId` | 2 | FK đơn hàng |
| `codAmount` | 2 | Tiền thu hộ, render `| COD {x} VND` khi >0 |
| `trackingCode` / `partnerCode` | 1/1 | Mã vận đơn hãng + mã đối tác |
| `shippingFee` | 1 | Phí vận chuyển (VND) |
| `labelUrl` | 1 | **URL PDF vận đơn** (do hãng cấp) — nút In mở link |
| `status` | 2 | Enum 11 trạng thái (dưới) |
| `createdAt` / `deliveredAt` | 2/2 | Thời gian tạo / giao |

### 0.3 State machine 11 trạng thái (i18n `shipping.status`)
`draft` Nháp → `submitted` Đã tạo → `picking` Đang lấy hàng → `in_transit` Đang vận chuyển → `out_for_delivery` Đang phát → `delivered` Đã giao | `failed` Giao thất bại | `returning` Đang hoàn → `returned` Đã hoàn | `cancelled` Đã hủy | `exception` Lỗi
- **Có cả nhánh RTO** (returning/returned) + `exception` — đúng chuẩn 3PL VN.
- `canCancel(status)` ẩn/hiện nút Hủy theo trạng thái + confirm dialog.

### 0.4 Luồng tạo vận đơn (nhúng trong order-add)
1. Chọn **Đối tác vận chuyển** (ion-select, load `getConnections + getPartners` khi mở form; preselect theo `order.shippingPartner`).
2. Hiện hint *"Một vận đơn sẽ được tạo tự động"* (auto-create khi lưu đơn).
3. **Báo phí trước khi tạo**: `quote-shipping-fee` (Tính phí vận chuyển) + `cod-fee` (Phí COD) — gọi hãng trả giá realtime (`quoteResult/quoteLoading`).
4. **Wizard địa chỉ hành chính VN đầy đủ**: Tỉnh/thành → Quận/Huyện → Xã/Phường → Địa chỉ chi tiết + **Thôn/ấp/xóm/tổ (hamlet — spec GHN)** + tìm kiếm tỉnh/ward + `save-pickup-address` (lưu địa chỉ lấy mặc định). Có `addressService` riêng.
5. **Khối lượng** (gram) + COD.
6. Rule bóc được: `create-shipment-before-save` = *"Vui lòng tạo vận đơn trước khi lưu đơn khi đã chọn đối tác"* — hoặc để tự tạo khi lưu; sau khi lưu đơn chạy `linkShipmentToOrder(shipmentId, orderId)`.
7. Sau tạo: panel *"Đã tạo vận đơn"* hiện trackingCode + status + **Xem vận đơn** + mở `labelUrl`.

### 0.5 Kết nối đối tác (`/shipping-partners`, modal `app-shipping-partner-connect`)
- Catalog đối tác do **server trả kèm `settingsSchemaJson`**: `{"fields":[{name,label,type,required}]}` → form nhập **sinh động** (mặc định `token` password; GHN thêm `shop_id`; GHTK thêm `partner_id` — khớp i18n `shop-id-placeholder "Nhập Shop ID (GHN)"`, `partner-id-placeholder "Nhập Partner ID (GHTK)"`).
- Connection per-store: `status connected/disconnected/error`, `isDefault` (Đặt làm mặc định), ngắt kết nối có confirm.
- Menu đặt ở **Cấu hình** (icon truck), ẩn với account không có full access.

### 0.6 Nguồn tạo vận đơn khác
- *"Tạo vận đơn từ đơn hàng **hoặc phiếu xuất kho**"* — `/delivery-note` (Phiếu xuất kho) cũng là nguồn; rule đã bóc ở audit trước: phiếu xuất lập bởi Đơn hàng thì không sửa được (inventory lock).

### 0.7 Trang danh sách `/shipping` (ảnh chụp thật)
- Card **Lọc**: Đối tác (select) | Trạng thái (select) | Mã vận đơn (input) + nút Tìm kiếm; nút refresh ở header.
- Card vận đơn: trackingCode + badge trạng thái (màu theo `getStatusColor`) + partnerCode + phí VND + COD + `#orderId` + createdAt; nút **In** (labelUrl) + **Hủy** (theo canCancel) + refresh tracking; click → `/shipping/detail/:id`.
- Detail: Thông tin chung (phí, khối lượng, COD, đơn #, ngày tạo, ngày giao, địa chỉ gửi/nhận) + **Lịch sử vận chuyển** (timeline events, empty state "Chưa có sự kiện nào") + In + Hủy.
- Empty state: *"Chưa có đơn vận chuyển nào / Tạo vận đơn từ đơn hàng hoặc phiếu xuất kho"*.

**ISale KHÔNG có**: bulk in vận đơn hàng loạt, quét mã vạch cập nhật trạng thái, bản đồ, realtime push, xử lý giao một phần/thất lạc có workflow (chỉ badge trạng thái).

---

## 1. UI/UX & TRACKING JOURNEY

### 1.1 Đối chiếu ISale ↔ chuẩn ngành
| Năng lực | ISale | Đánh giá / PioPio nên làm |
|---|---|---|
| In vận đơn | Per-row, mở `labelUrl` PDF hãng | Giữ; thêm **Bulk print** (P3): gom nhiều label PDF vào 1 lệnh in (iframe nối tiếp) |
| Visual Tracking Timeline | Timeline dọc từ `events[]` (status + description + location + eventTime), icon theo trạng thái | Giữ nguyên thiết kế — tốt; thêm thanh tiến trình 6 bước (Đã tạo→Lấy hàng→Vận chuyển→Phát→Giao/ Hoàn) phía trên timeline |
| Quét mã vạch cập nhật kho | ❌ Không có (chỉ nhập tay mã tìm kiếm) | **Lợi thế PioPio (P3)**: ô quét ở `/shipments` — scan mã vận đơn → dialog xác nhận đổi trạng thái (đã xuất kho / đã giao / đã hoàn) |
| Tạo vận đơn từ đơn | Wizard 5 bước trong order-add + auto-create | Copy y — đây là điểm mạnh UX của ISale |
| Hủy vận đơn | Confirm + canCancel theo status | Giữ |

### 1.2 Số bước thao tác (ISale)
| Nhiệm vụ | Luồng | Click |
|---|---|---|
| Tạo vận đơn từ đơn | order-add → chọn đối tác → điền địa chỉ/gram → Tính phí → Tạo vận đơn → Lưu đơn | ~8 |
| Xem hành trình | /shipping → click card → timeline | 2 |
| Làm mới tracking | Nút refresh row (hoặc mở detail) | 1 |
| In label | Row → In | 1 |

---

## 2. FRONTEND & REAL-TIME

| Vấn đề | ISale thực tế | Khuyến nghị PioPio |
|---|---|---|
| Render hàng ngàn vận đơn | `take:100` mỗi lần load, card list, không virtualize | Giữ phân trang 100 + `@for track shipment.id`; >500 dòng thì dùng virtual scroll của Ionic (`[virtualScroll]` hoặc CDK) |
| Real-time khi hãng đổi trạng thái | **Không có** — pull thủ công (refresh row) | **Supabase Realtime**: subscribe `postgres_changes` trên `shipments` (filter `shop_id`) — khi Edge Function webhook ghi DB, UI tự đổi badge không cần F5. Đơn giản, không cần WebSocket server riêng |
| Bản đồ | Không có tọa độ | Không cần view bản đồ: nút "Chỉ đường" mở Google Maps từ `to_address` (đủ 95% nhu cầu shop VN); map canvas để P3+ |
| Lắng nghe hãng | Server proxy + client pull | Edge Function webhook → ghi `shipments` + `shipment_tracking_logs` → Realtime đẩy UI (event-driven đúng chuẩn, không giữ kết nối tới hãng) |
| Fee quote realtime | `quoteResult/quoteLoading` trong form | Copy: gọi Edge Function `shipment-quote`, skeleton loading trên nút |

---

## 3. BACKEND & 3PL INTEGRATION

### 3.1 Kiến trúc đề xuất cho PioPio (Supabase Edge Functions thay ISale backend)
```
PioPio FE ──create/quote──► Edge Function (giữ secrets, gọi hãng, chuẩn hoá) ──► GHN/GHTK/ViettelPost
3PL ──webhook──► Edge Function /functions/v1/shipping-webhook?provider=ghn
                    ├─ verify HMAC signature
                    ├─ webhook_inbox (idempotent: unique provider+event_id)
                    ├─ map status → enum 11 trạng thái
                    ├─ insert shipment_tracking_logs + update shipments.status
                    └─ (Supabase Realtime tự đẩy UI)
pg_cron mỗi 5 phút: retry webhook_inbox failed (backoff x2, tối đa 8 lần)  ← thay RabbitMQ/Kafka
```
> Không tự host MQ: `webhook_inbox` + `pg_cron` là message-queue-lite đủ dùng ở quy mô shop; giữ đơn giản như phần còn lại của PioPio.

### 3.2 Bảng map trạng thái 3 hãng → enum PioPio
| PioPio | GHN | GHTK | Viettel Post |
|---|---|---|---|
| draft | — | — | — |
| submitted | created | -1 (Đã tạo) | NEW_ORDER |
| picking | picking | 1 (Lấy hàng) | READY_TO_PICK/PICKING |
| in_transit | transporting | 2 (Vận chuyển) | FORWARDED/TRANSIT |
| out_for_delivery | delivering | 5 (Đang giao) | DELIVERING |
| delivered | delivered | 3 (Giao thành công) | SUCCESSFUL |
| failed | delivery_fail | 4 (Giao không thành công) | FAILED |
| returning | returning | 10 (Đang hoàn) | IN_RETURN |
| returned | returned | 11 (Đã hoàn) | RETURNED |
| cancelled | cancel | 12 (Hủy) | CANCELED |
| exception | exception | exception | EXCEPTION |

### 3.3 API Endpoints (Edge Functions)
| Endpoint | Method | Chức năng | Auth |
|---|---|---|---|
| `/functions/v1/shipment-quote` | POST | Báo phí 1 hãng (weight, route, COD) | user JWT + RLS shop |
| `/functions/v1/shipments` | POST | Tạo vận đơn (gọi hãng), ghi DB, trả trackingCode + labelUrl | user JWT, `Idempotency-Key` |
| `/functions/v1/shipments/:id/cancel` | POST | Hủy vận đơn qua hãng | user JWT + own shop |
| `/functions/v1/shipments/:id/refresh` | POST | Pull tracking ngay (thay nút refresh ISale) | user JWT + own shop |
| `/functions/v1/shipping-webhook/:provider` | POST | Nhận callback hãng (HMAC verify) | signature + service_role |
| `/rest/v1/shipments` | GET | List + filter (RLS shop) | user JWT |
| `/rest/v1/shipment_tracking_logs` | GET | Timeline (RLS shop) | user JWT |

### 3.4 JSON mẫu — Create Shipment
Request (`POST /functions/v1/shipments`):
```json
{
  "order_id": "7f2c...a1",
  "partner_id": "sp_ghn_01",
  "service_type": "standard",
  "cod_amount": 450000,
  "parcel": { "weight_g": 1200, "length_cm": 20, "width_cm": 15, "height_cm": 10 },
  "from": { "use_shop_default": true },
  "to": {
    "name": "Nguyễn Văn A", "phone": "0903123456",
    "province": "TP. Hồ Chí Minh", "district": "Quận 7", "ward": "Phường Tân Thuận",
    "hamlet": "Khu phố 3", "address": "12 Nguyễn Hữu Thọ"
  },
  "note": "Hàng dễ vỡ - nhẹ tay",
  "idempotency_key": "ord-7f2c-a1-ship-1"
}
```
Response:
```json
{
  "id": "shp_9d2...e7", "tracking_code": "GHN8842KLMN", "partner_code": "ghn",
  "status": "submitted", "shipping_fee": 32000, "cod_amount": 450000,
  "label_url": "https://5s.ghn.vn/label/8842KLMN.pdf",
  "expected_delivered_at": "2026-09-29T18:00:00+07:00",
  "events": [{ "status": "submitted", "description": "Đã tạo vận đơn", "eventTime": "2026-09-27T10:05:00+07:00" }]
}
```

### 3.5 JSON mẫu — Webhook 3PL → Edge Function (chuẩn hoá)
```json
{
  "provider": "ghn",
  "event_id": "ghn-ev-771233",
  "tracking_code": "GHN8842KLMN",
  "shop_id": "ndsr...bpm",
  "event": {
    "status": "out_for_delivery",
    "description": "Shipper Đỗ Văn B đang giao (0903888xxx)",
    "location": "Bưu cục Q.7",
    "eventTime": "2026-09-28T08:12:00+07:00",
    "raw": { "status": "delivering", "area": "Q7", ... }
  }
}
```

---

## 4. DATABASE SCHEMA (Supabase, migration v26)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `shipments` | id, **shop_id**, order_id FK nullable, delivery_note_id FK nullable, **partner_id** FK `shipping_partners`, provider (`ghn/ghtk/vtp/manual`), **tracking_code**, **status** enum 11 trạng thái, shipping_fee, cod_amount, **weight_g** int, length_cm/width_cm/height_cm int nullable (**Parcels D-W-H để tính phí**), from_address jsonb, to_address jsonb, **label_url**, expected_delivered_at, delivered_at, cancelled_at, fail_reason, note, external_ref, created_by, created_at, updated_at | RLS `is_shop_member`; unique (shop_id, tracking_code) khi tracking_code not null |
| `shipment_tracking_logs` | id, shipment_id FK, shop_id, status, description, location, event_time, raw jsonb, created_at | **Append-only**: RLS chỉ SELECT/INSERT cho shop — không UPDATE/DELETE (khoá lịch sử) |
| `webhook_inbox` | id, provider, event_id, payload jsonb, status (`received/done/failed`), retry_count, next_retry_at, last_error, created_at | Unique (provider, event_id) = idempotency; pg_cron retry failed với backoff |
| `shipping_partners` (v14 có sẵn) | + `settings jsonb` (credentials động theo schema: token/shop_id/partner_id), `fee_percent` đã có | **P1: dời api_token sang Vault/Edge secrets** — hiện đang lưu plain trong bảng FE-readable |

**Logic trừ tồn kho (Inventory allocation)** — ISale tách bạch: *Đơn hàng* → *Phiếu xuất kho* (xuất kho tại đây, khoá sau khi lập) → *Vận đơn* (chỉ logistics, không đụng kho). PioPio giữ đúng: `shipments` KHÔNG trừ tồn kho; trừ/khôi phục tồn kho vẫn nằm ở order/delivery-note:
- `delivered` → không làm gì thêm (kho đã trừ lúc xuất).
- `returned` → tạo phiếu nhập trả (khôi phục tồn kho) + gắn event.
- Giao một phần → line-level `received_qty` trên shipment_items (P3), chênh lệch → phiếu nhập lại phần thiếu.

---

## 5. SECURITY & EDGE CASES

| Rủi ro | Biện pháp |
|---|---|
| **Token 3PL lộ** (lỗ hổng lớn nhất hiện tại của PioPio: `api_token` trong bảng FE) | P1: secrets chuyển sang Supabase **Vault** / Edge env; bảng `shipping_partners` chỉ giữ mask (`*last4`). Edge Function là cổng duy nhất chạm hãng |
| **Webhook giả mạo** | Verify HMAC/signature từng hãng (GHN: token trong header; ViettelPost: token tự cấp); luôn tra cứu tracking_code **từ DB** (không tin status trong payload trước khi khớp external_ref) |
| **Webhook trùng/lặp** | `webhook_inbox` unique (provider, event_id) — INSERT conflict → bỏ qua (idempotent) |
| **Webhook lỗi/timeout khi gọi hãng** | Inbox ghi received → xử lý; fail → `retry_count++, next_retry_at = now() + 5min * 2^n`; pg_cron pick-up ≤8 lần rồi đánh `failed` + cảnh báo UI |
| **IDOR** | RLS mọi bảng theo `is_shop_member(shop_id)`; Edge Function nhận shop_id từ JWT (không tin body) |
| **Khoá dữ liệu** | `shipment_tracking_logs` append-only; `shipments` chỉ cho UPDATE cột trạng thái/thời gian (trigger chặn sửa from/to/fee sau khi `submitted`) |
| **Tạo trùng vận đơn** (double-click / retry) | Unique `idempotency_key` trên shipments; Edge Function check-before-create với hãng (tra tracking theo external_ref) |
| **Giao một phần (Partial)** | P3: `shipment_items.received_qty` < qty → UI "Xác nhận thiếu hàng" → tạo phiếu nhập phần thiếu + ghi log; status vẫn `delivered` + cờ `partial` |
| **Thất lạc / hư hỏng (Lost/Damaged)** | `status = exception` + `fail_reason` enum (`lost/damaged/wrong_address/other`) + bắt buộc ghi chú khi chuyển exception; `returned` → workflow nhập lại kho; khiếu nại hãng = link theo dõi + ảnh (storage `receipts` tái dùng) |
| **COD sai lệch** | Khi `delivered` + cod_amount > 0 → gợi ý tạo transaction `source='cod'` vào ví (khớp cơ chế v24 đã xây); đối soát: tổng COD theo hãng vs số dư |

---

## 6. MAPPING ISale → PioPio → KẾ HOẠCH P0–P3

**PioPio hiện có**: bảng `shipping_partners` (v14) + service CRUD + trang `/shipping-partners`; orders có cột `shipping_code/shipping_partner/shipper_name/shipper_phone/shipping_address/ship_fee` nhập tay ở POS; receipt in mã vận đơn. **Chưa có**: shipments, timeline, 3PL, label, webhook.

| Phase | Nội dung |
|---|---|
| **P0** | Migration v26 (`shipments`, `shipment_tracking_logs`, `webhook_inbox`, enum 11 trạng thái) + trang `/shipments` (list + filter đối tác/trạng thái/mã VĐ + badge màu như ISale) + detail timeline + **tạo vận đơn thủ công** từ order-detail (chọn partner v14, nhập tracking code hãng + trọng lượng + COD → lưu + in template label A6 tự render khi chưa có labelUrl) + hủy/đổi trạng thái tay + link Realtime badge |
| **P1** | Edge Function `shipment-quote` + `shipments` cho **GHN** (address wizard 4 cấp + hamlet, fee quote, auto-create khi lưu đơn như ISale, link shipment↔order) + secrets sang Vault + `refresh` endpoint |
| **P2** | Webhook receiver (`/shipping-webhook/:provider`, HMAC + inbox + pg_cron retry) + map trạng thái GHTK/ViettelPost + timeline tự cập nhật qua Realtime + COD → transaction `source='cod'` |
| **P3** | Bulk in label + quét mã vạch đổi trạng thái + partial/exception workflow (fail_reason, nhập lại kho) + nút chỉ đường Google Maps + báo cáo giao hàng theo hãng/SLA |
