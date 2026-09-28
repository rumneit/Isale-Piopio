# 360° FULL-STACK AUDIT — MODULE QUẢN LÝ BÁO GIÁ (ISale `/quote`) → PioPio

Ngày audit: 27/09/2026 · Phương pháp: Reverse engineering qua CDP (Edge debug, read-only) + bóc tách JS chunks compiled (`3414`, `1370` + shared `7489`, `6841`, main) + i18n `assets/i18n/vn.json?v=v1.0.49` + ảnh chụp live.
Lưu ý dữ liệu: tài khoản ISale đang **gói Miễn Phí** → trang bị **PRO-gate**, không có dữ liệu quote thật → toàn bộ cấu trúc bóc từ template/logic compiled (độ tin cậy cao, không đoán).

---

## 0. BỘC TÁCH NGUỒN ISALE

### 0.1 API & lưu trữ (bóc từ main bundle)
```
getQuotes():  POST {table:"quote", staffId?}      → /data/listequal
get(id):      POST {id, table:"quote", staffId?}  → /data/get
save(quote):  quote.table = "quote"               → POST /data/save  → trả về id
```
- Quote là **bảng riêng** (`table: "quote"`), KHÔNG phải order-status.
- `staffId` đính kèm mỗi query → scoping theo nhân viên server-side.
- PRO gate: `if (!currentPlan && !isOnTrial) → alert("Để tạo mới Báo giá bạn cần đăng ký gói PRO")` — **chặn client-side**.

### 0.2 Model `quote` (tần suất refs trong compiled code)
| Field | refs | Ý nghĩa |
|---|---|---|
| `items` / `itemsJson` | 48/4 | **Line items** (mảng object) + bản serialize JSON |
| `contact` + `contactName/Phone/Address/Id` | 32/17/16/15/11 | FK + **snapshot denormalized** thông tin KH |
| `pointAmount` / `amountFromPoint` | 14/12 | Trừ điểm (form dùng chung hệ order) |
| `tax` / `taxType` | 11/9 | Tiền thuế + loại % (0/8/10/15/20/25/30/35/40/45/50%) |
| `netValue` | 11 | Tổng tạm tính (trước CK/thuế) |
| `discountOnTotal` / `discount` | 11/2 | **CK tổng đơn** + CK per-line |
| `staff` / `staffId` | 10/3 | NV phụ trách (in dưới chữ ký: `showStaffNameUnderSign`) |
| `shippingFee` / `shipCostOnCustomer` | 9/3 | Phí vận chuyển |
| `total` | 8 | Grand total |
| `name` | 6 | **Tên báo giá** (bắt nhập) |
| `note`, `createdAt`, `paid`, `change` | 6/5/2/2 | Ghi chú, ngày, đã trả/tiền thừa (form dùng chung) |
| `collaboratorId`, `storeId`, `tableId` | 2/1/3 | CTV, kho, bàn (di sản form dùng chung) |
| `lang` | 1 | **Ngôn ngữ của template in** (`userService.getLanguage()` khi save) |
| `saveProductNotes` | 1 | Ghi chú sản phẩm có lưu lại không |

**Không có**: `status`, `expiry/validUntil`, `sentAt/viewedAt/acceptedAt`, `shareToken`, `revision`, `password` → **ISale KHÔNG có state machine, không có hạn giá, không có public link**.

### 0.3 Business rules bóc được
1. **Convert 2 chiều**:
   - Quote → Đơn: `createOrder() → navCtrl.push("/order/new", {quote})` — form đơn nhận sẵn quote (SP, giá, KH).
   - Đơn → Quote: quote-add nhận `params.convert` (`contactName`, `contactPhone`, `itemsJson`) → parse items, **reset toàn bộ tiền** (`total=0, netValue=0, paid=0, change=0, discountOnTotal=0, tax=0, shippingFee=0`).
2. **Copy = revision**: `copyQuote() → /quote/new {quote, mode:"copy"}` — tạo bản mới từ bản cũ (form pre-filled, tiêu đề "Sao chép báo giá").
3. **History**: action sheet có `common.change-history → /change-history/quote/:id` (module log dùng chung với debt).
4. **In + Chia sẻ cùng 1 trang**: `/quote/detail-print` với `mode:"print" | "share"`; toggle **Hiện mô tả / Hiện ảnh** lưu per-user (`storage.set("quote-show-des|image")`); phím tắt **P** để in (`onKeyPress` body key).
5. **Excel export client-side**: dựng mảng rows (`[title], [name, quote.name], [contact...]`) → excelService.
6. **Search list**: "theo danh bạ hoặc tên sản phẩm" — tìm qua contact lẫn items.
7. **Bulk**: xóa nhiều quote với confirm đếm số lượng (`multi-delete-alert` với `{{count}}`).

### 0.4 Template in (quote-detail-print) — chuẩn tài liệu
- Cột bảng: **STT | Ảnh (toggle) | Sản phẩm | Mô tả (toggle) | Đơn vị | Số lượng | Đơn giá | Chiết khấu (ẩn hiện theo dữ liệu) | Thành tiền**.
- Header: tên shop (shopName), tiêu đề **"BÁO GIÁ"** uppercase, Ngày tạo, Khách hàng.
- Footer: **"Tổng phải trả (viết bằng chữ)"** + ghi chú + **khối chữ ký đôi**: "Người bán hàng (Ký và ghi rõ họ tên)" ↔ "Người mua (Ký và ghi rõ họ tên)", tên NV dưới chữ ký (tùy chọn).
- Responsive riêng cho in: `isMobile = width < 720` (layout A4 vs mobile).

---

## 1. UI/UX & HÀNH VI NGƯỜI DÙNG (QUOTE FLOW)

### 1.1 Quote Builder
| Yếu tố | ISale thực tế | Đánh giá |
|---|---|---|
| Thêm SP | Product-selector dùng chung (search + barcode-input + combo/topping), alert chống trùng SP ("đã có trong đơn, dùng nút +−") | Tốt, tái sử dụng form order |
| **Kéo thả sắp xếp line** | ❌ Không có (không tìm thấy reorder trong quote items) | GAP chuẩn ngành |
| **Discount** | **2 cấp**: per-line (`product.discount`, cột C/k) + tổng đơn (`discountOnTotal`, nhập số hoặc % 0–100 có validate) | Đủ chuẩn |
| **Tax** | **Chỉ cấp đơn** (`taxType` select 0–50% nhanh, hỏi lưu %VAT mặc định cho đơn sau) | Thiếu per-line tax (chuẩn B2B hay cần) |
| Điểm thưởng / CTV / bàn | Có (di sản form dùng chung với order) | Dư thừa với quote |

### 1.2 Real-time Preview
- ISale: **không có preview sống trong form**. Preview = trang `detail-print` riêng (mode share/print) sau khi đã tạo.
- Chuẩn tốt hơn: preview panel bên phải builder (desktop) cập nhật theo keystroke.

### 1.3 Nhận diện thương hiệu
- Header in: tên shop + "BÁO GIÁ" + ngày + khách. **Không thấy logo** trong template (chỉ text), **không có footer tùy biến/điều khoản**.
- Chữ ký: 2 ô trống ký tay sau khi in — chưa phải e-signature.

### 1.4 Số bước thao tác chính
| Nhiệm vụ | ISale | Số click |
|---|---|---|
| Tạo quote | + → nhập tên → chọn KH → thêm SP → (CK/thuế) → Lưu | ~6–8 |
| Gửi khách | card → detail → Chia sẻ → (in/ảnh màn hình thủ công) | 3 + thao tác ngoài |
| Chốt đơn | detail → Tạo đơn → form order pre-fill → Lưu | 2 + lưu form |

---

## 2. FRONTEND (TƯƠNG TÁC & RENDER TÀI LIỆU)

### 2.1 State management (ISale: Angular service + shared form)
- `quote` là 1 object giữ trong component/service; items là mảng thường; render `*ngFor` không virtualize → lag nếu >100 dòng (ISale chấp nhận vì POS ít dòng).
- **Khuyến nghị PioPio**: giữ `signal<QuoteDraft>` + `computed()` cho `subtotal/totalDiscount/tax/total`; line items render `track item.uid`; >50 dòng mới cân nhắc virtual scroll. Không cần FieldArray của React — Angular signals + immutable update đủ mượt.

### 2.2 Tính toán on-the-fly (logic chuẩn, test được)
```ts
lineTotal = qty * price * (1 - lineDiscount%)            // per-line
subtotal  = Σ lineTotal
total     = (subtotal - discountOnTotal) * (1 + tax%) + shippingFee
```
- ISale: `netValue` (tạm tính) → `discountOnTotal` → `tax` → `total`, tính client, không gọi API khi gõ (chỉ save mới POST).
- Lưu ý %: validate 0–100 (`discount-percent-not-valid`), format tiền VND.

### 2.3 Export/PDF
| Kỹ thuật | ISale | PioPio nên dùng |
|---|---|---|
| In | DOM riêng `#print-page` + system print (phím P) | **CSS `@media print` + `window.print()`** trên view `/quote/:id/print` (không cần lib) |
| PDF | Không có render PDF thật (share = màn hình in) | Phase 2: `html2canvas + jsPDF` client-side (không tốn server), hoặc Puppeteer trên Vercel Function nếu cần PDF "nét chữ" |
| Excel | excelService client rows | Đã có pattern CsvExportService |

---

## 3. BACKEND & DATABASE SCHEMA

### 3.1 State machine đề xuất (ISale không có — PioPio làm tốt hơn)
```
draft ──gửi──► sent ──khách mở link──► viewed ──┬──► accepted ──convert──► order (status pending/paid)
  ▲              │                               └──► declined
  │              └──► expired (hạn giá, job/tính toán khi đọc)
  └── revise (tạo revision mới, trạng thái quay lại draft/sent)
```
Rule: `accepted/declined/expired` **khoá edit**; `sent` chỉ được sửa qua **revision mới**.

### 3.2 Schema đề xuất (Supabase/Postgres, v25)
| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `quotes` | id, shop_id, code (BG-yyMM-###), **status** (`draft/sent/viewed/accepted/declined/expired`), name, contact_id, **contact_snapshot jsonb**, items_snapshot jsonb, subtotal, discount_on_total, discount_kind (`amount/percent`), tax_percent, tax_amount, shipping_fee, total, note, **valid_until**, currency, lang, staff_id, created_by, created_at, updated_at | **Price snapshot cứng**: items giữ `{product_id, name, unit, price, qty, discount, note}` — product_id chỉ để tra cứu, KHÔNG join khi đọc |
| `quote_items` | id, quote_id, position (int — kéo thả), product_id nullable, **name, unit, price, qty, discount_percent, note** (snapshot cứng), line_total | Tách bảng để query/thống kê; hoặc giữ jsonb nếu muốn đơn giản — đề xuất tách |
| `quote_revisions` | id, quote_id, rev_no (1.0, 1.1...), snapshot jsonb (toàn bộ quote+items), reason, created_by, created_at | Sửa khi đã sent → insert revision, không UPDATE đè |
| `quote_events` | id, quote_id, event (`created/sent/viewed/accepted/declined/expired/revised/converted`), meta jsonb, created_at | Feed lịch sử + read-receipt |
| `quote_share_links` | id, quote_id, token_hash (sha256), expires_at, password_hash nullable, view_count, last_viewed_at, revoked | Public link: lưu **hash** token, không lưu raw |

### 3.3 API surface (Supabase = REST + RLS; hành động đặc biệt dùng RPC)
| Endpoint | Method | Ghi chú |
|---|---|---|
| `/rest/v1/quotes?shop_id=eq.&select=*,quote_items(*)` | GET | list + filter status/valid_until |
| `/rest/v1/quotes` | POST | tạo draft (RLS `has_permission(shop,'orders')`) |
| `/rest/v1/quotes/:id` | PATCH | **chỉ draft** — trigger chặn khi status ≠ draft |
| RPC `quote_set_status(quote_id, status)` | POST | sent/viewed/accepted/declined + ghi `quote_events` |
| RPC `quote_revise(quote_id, snapshot, reason)` | POST | tạo revision + về draft |
| RPC `quote_convert_to_order(quote_id)` | POST | tạo order từ snapshot, reset tiền như ISale, ghi event `converted`, quote → accepted |
| RPC `quote_create_share(quote_id, days, password?)` | POST | trả về raw token 1 lần, lưu hash |
| `#/public/quote/:token` (view không cần đăng nhập) | GET | RPC `quote_view_by_token(token)` — tăng view_count + event `viewed` |

### 3.4 JSON mẫu — tạo báo giá (nested)
Request:
```json
POST /rest/v1/quotes
{
  "name": "Báo giá trà sữa nguyên liệu T9",
  "contact_id": "8f3...c21",
  "contact_snapshot": { "name": "CTY TNHH An Nhiên", "phone": "0903...", "address": "Q.7, TP.HCM" },
  "valid_until": "2026-10-31",
  "discount_kind": "percent",
  "discount_on_total": 5,
  "tax_percent": 8,
  "shipping_fee": 0,
  "note": "Giá áp dụng cho đơn ≥ 100kg",
  "items": [
    { "product_id": "p1...", "name": "Trà ô long_DEF", "unit": "kg",
      "price": 380000, "qty": 120, "discount_percent": 0, "note": "" },
    { "product_id": null, "name": "Phí gia công ép khẩu vị", "unit": "lô",
      "price": 500000, "qty": 1, "discount_percent": 100, "note": "tặng kèm" }
  ]
}
```
Response (server tính lại tiền — client chỉ hiển thị):
```json
{
  "id": "q9...77", "code": "BG-2609-014", "status": "draft",
  "subtotal": 46100000, "discount_amount": 2305000,
  "tax_amount": 3503600, "total": 47298600,
  "share": null, "created_at": "2026-09-27T10:00:00Z"
}
```

### 3.5 Mapping ISale → PioPio hiện tại → mục tiêu
| ISale | PioPio hiện tại | Mục tiêu PioPio |
|---|---|---|
| Bảng `quote` riêng | Order `status='quote'` (`/order/add?mode=quote`) | Giữ status trên `orders` (tận dụng code/total/promotions đã có) + **view riêng `/quote`** lọc `status='quote'` |
| Tên báo giá | Không có (dùng code) | Thêm cột `quote_name` (hoặc map vào `note`) |
| taxType 0–50% | orders có `tax`/`tax_type` từ audit Bán hàng | Giữ |
| CK per-line + tổng | Đã có (discount per item + tổng) | Giữ |
| In print template | Chưa có view in cho quote | `/quote/:id/print` CSS print + chữ ký đôi + số bằng chữ |
| Share (màn hình) | Không | **Public magic link + accept/decline** (vượt ISale) |
| Copy | Không | Copy (pre-fill form) |
| change-history | Không cho order | `quote_events` feed |
| Convert quote→order | Đơn thường có sẵn; quote→order chưa có flow riêng | RPC convert: `status quote → pending`, giữ snapshot |
| PRO gate | Free | **Free** (lợi thế cạnh tranh) |

---

## 4. KILLER FEATURES (đề xuất — vượt ISale)

1. **Public Quote Link** (ưu tiên cao nhất): `/pub/q/:token` — khách mở không cần tài khoản, xem bản in đẹp, bấm **"Chấp nhận"** (ghi tên + SĐT) hoặc **"Từ chối"** (hỏi lý do) → `quote_events`; token lưu SHA-256, revoke được, hết hạn theo `valid_until`, tuỳ chọn mật khẩu.
2. **Read receipt**: mỗi lần mở link tăng `view_count` + đẩy event `viewed`; trang list hiện "Đã xem 14:32 · 3 lần" — chủ shop biết khách quan tâm để bám.
3. **Nhắc hạn giá**: khi mở app, quét `valid_until` còn ≤3 ngày & status=sent → toast/banner "5 báo giá sắp hết hạn"; (email tự động cần cron — để phase sau, hiện tại in-app là đủ).
4. **One-click conversion**: `quote_convert_to_order` — đúng semantics ISale (items copy cứng, tiền giữ nguyên từ snapshot), quote chuyển `accepted`, đơn mới `pending`.
5. **Revision**: sửa quote đã sent → tự tạo revision v1.1 (snapshot cũ giữ nguyên, xem được diff tổng tiền), đúng chuẩn B2B.
6. **In chuẩn đẹp**: template A4 có logo shop (PioPio đã có logo/config), số tiền bằng chữ (vi-hợp đọc số), chữ ký đôi, mã QR trỏ về public link (khách quét xem lại) — tái dùng VietQR config sẵn có.

---

## 5. SECURITY & EDGE CASES

| Rủi ro | Biện pháp (Supabase/Postgres) |
|---|---|
| **IDOR** (đổi id xem quote shop khác) | RLS mọi bảng quote: `is_shop_member(shop_id)`; public view **chỉ qua RPC token** (không lộ id thật, token hash). ISale chặn staffId ở server — PioPio chặn bằng RLS cứng hơn |
| **Sửa sau khi gửi** (data locking) | Trigger `BEFORE UPDATE` trên quotes: nếu `OLD.status <> 'draft'` và payload đổi `items/discount/tax/total` → `RAISE EXCEPTION 'Báo giá đã gửi — hãy tạo phiên bản mới (revision)'`; `quote_items` chèn/thay đổi chỉ khi quote là draft |
| **Public link bị dò** | Token 32 bytes random, base64url; lưu SHA-256; rate-limit view RPC (1 token ≤ 30 view/giờ); optional `password_hash` (pgcrypto) hoặc OTP email (phase 2); revoke ngay khi quote bị hủy |
| **Giá đổi sau snapshot** | Quy ước cứng: mọi render/convert **chỉ đọc snapshot**, không join `products.price` (ISale làm đúng — PioPio giữ nguyên nguyên tắc) |
| **Concurrent edit** | `updated_at` + optimistic check (`eq('updated_at', old)`) khi PATCH draft |
| **Spam/payload** | items ≤ 200 dòng (trigger `jsonb_array_length`/count), `price/total` CHECK `< 1e13`, `qty > 0`, `discount_percent BETWEEN 0 AND 100` (đúng validate ISale) |
| **Convert trừ tiền kép** | Convert chỉ tạo order (chưa thu tiền) — an toàn; chặn convert 2 lần: `status = 'accepted'` guard trong RPC, `quote_events` unique (quote_id, event='converted') |
| **Expired tính mềm** | Không cần cron: khi đọc, `status='sent' AND valid_until < now()` → hiển thị Expired; cập nhật status chính thức bằng RPC khi tương tác |

---

## 6. THỨ TỰ LÀM ĐỀ XUẤT (P0→P3)

- **P0** — Trang `/quote` riêng (list lọc `status='quote'` + search theo KH/SP + FAB), form thêm/sửa tái sử dụng order-add mode quote + trường **Tên báo giá** + **Hạn giá (valid_until)**; action sheet chuẩn ISale (Sửa/Copy/Xóa/Tạo đơn).
- **P1** — Migration v25 (`quote_name`, `valid_until` trên orders; bảng `quote_revisions` + `quote_events` + `quote_share_links` + RLS + trigger lock) + **view in** `/quote/:id/print` (logo, số bằng chữ, chữ ký đôi, QR) + **Copy báo giá**.
- **P2** — **Public magic link** + Accept/Decline + read receipt + banner nhắc hạn; badge trạng thái (sent/viewed/accepted...) + lịch sử event.
- **P3** — Convert quote→order chuẩn hoá bằng RPC + revision UI (v1.1) + PDF client-side (jsPDF) + per-line tax (nếu khách B2B cần).
