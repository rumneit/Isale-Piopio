# 360° FULL-STACK AUDIT — MODULE QUẢN LÝ THU/CHI (ISale `/trade`) → PioPio

Ngày audit: 27/09/2026 · Phương pháp: Reverse engineering qua CDP (Edge debug, read-only) + bóc tách JS chunks compiled + i18n `assets/i18n/vn.json?v=v1.0.49` + ảnh chụp live
Tài khoản ISale: 0 giao dịch → UI/flow bóc từ template compiled (đối chiếu chéo với ảnh chụp form live `/trade/new`)

---

## 0. BỘC TÁCH MODEL DỮ LIỆU NGUỒN (đối chiếu chéo template + i18n)

### 0.1 Bảng `trade` (hệ data-table ISale)
List khai báo: `["table","trade", query, fieldsFromDb, hasCustomFields, totalList]` — tổng tiền tính **server-side** (`totalList`).

| Field | Kiểu (suy luận) | Ý nghĩa | Bằng chứng |
|---|---|---|---|
| `id` | bigint/uuid | khóa chính | i18n `trade.id` (cột ID khi export) |
| `isReceived` | boolean | **Tiền vào (true) / Tiền ra (false)** | 24 refs; segment `value:1`/`value:0` |
| `value` | numeric | Số tiền | 18 refs; directive `moneyValue` |
| `note` | text | Mô tả ngắn | 11 refs; textarea rows=4 |
| `createdAt` | timestamptz | Ngày tạo | 9 refs; picker `tradeAddPicker` có `min` |
| `moneyAccountId` | FK → money_account | Ví/Tài khoản | 3 refs; lookup `money_account` |
| `contactId` | FK → contact | Khách hàng | 12 refs; `lookupListPath` + `saveLastActive(lastAction:"trade")` |
| `productId` / `productCount` / `isPurchase` | FK + numeric + bool | Sản phẩm + số lượng + giao dịch mua? | 16/12/10 refs |
| `debtId` | FK → debt | Thanh toán khoản nợ | 6 refs; `debt-amount-reached-warning` |
| `orderId` | FK → order | Thu/chi từ đơn hàng | 2 refs |
| `receivedNoteId` | FK → received_note | Thu/chi từ phiếu nhập | 1 ref |
| `staffId` | FK → staff | Nhân viên tạo | 3 refs; i18n `trade.staff` |
| `paymentType` | text | Hình thức thanh toán (Tiền mặt…) | select trên form |
| `imageUrlsJson` | json | **Ảnh biên lai** | 1 ref; detail tab-photo, gallery page |

### 0.2 Bảng phụ
- `trade_category`: `orderBy:"orderIndex"` + `reorderButtons` — **kéo thả sắp xếp thứ tự mục**.
- `money_account`: name, total, is-default, bank-name, bank-account-name, bank-number (+ chi tiết, lịch sử, chuyển khoản nội bộ có phí).

### 0.3 Business rules bóc được (compiled JS)
1. **Giao dịch gắn đơn hàng/công nợ/phiếu nhập-xuất không thể xóa/cập nhật thủ công** (`trade.trade-related-alert`, `trade-related-update-alert`) — phải xóa qua đối tượng gốc.
2. **Thanh toán nợ có validate số tiền** ≤ nợ còn lại (`debt-amount-reached-warning` — nhưng cho phép "xác nhận" ghi đè).
3. Tạo trade cho contact → cập nhật `lastActive`, `lastAction="trade"` (CRM tracking).
4. Detail: nếu `note == "" && có ảnh` → **tự mở tab Ảnh** thay vì tab Mô tả.
5. Khi tất cả khoản nợ của đơn được trả → đơn tự Hoàn thành (bóc ở audit công nợ).

---

## 1. PHÂN TÍCH UI/UX

### 1.1 Layout structure (ảnh chụp live `/trade` + `/trade/new`)
**List page:**
```
Header: ☰ | 🏠 | Quản lý Thu/Chi | ⚙ | A+ | ⋮
Searchbar "Tìm kiếm giao dịch" (luôn hiển thị, X để đóng)
Segment tháng: Tháng 08 | Tháng 09 (active) | Tháng 10   [funnel] ← query builder
Row: "Loại giao dịch Toàn bộ ▼"                            ← lọc nhanh Thu vào/Ra
Toolbar: funnel 🔍 Tổng: N giao dịch / Tổng giao dịch: X   ☑ ✏ ⬇ ☁↑ ▦ ⚙
Empty state (3 gạch đầu dòng hướng dẫn) / danh sách card
FAB + (center)  ·  FAB AI (right)
```
**Add form `/trade/new`:** grid **2 cột** (desktop) các field-card, 1 cột (mobile):
`Khách hàng | Sản phẩm (ghi chú dẫn về Đơn hàng/Phiếu nhập nếu nhiều SP)` · `Số tiền (₫-VND) + [TIỀN VÀO|TIỀN RA] + .00 .000 | Mô tả ngắn` · `Mục (+THÊM chips) | Ngày tạo` · `Ví/Tài khoản ngân hàng | Hình thức thanh toán (Tiền mặt ▼)` · Lưu = ✓ xanh góc phải header.

### 1.2 Visual hierarchy & Grid
- Field-card nền xám nhạt bo tròn trên nền trắng → phân cụm trường rõ, không cần divider.
- **Tiền vào/Tiền ra là 2 nút segment** (active = outline primary) — quyết định quan trọng nhất của giao dịch được đặt NGAY dưới ô số tiền (F-pattern: tên → tiền → hướng tiền).
- Nút `.00`/`.000` — micro-interaction nhập nhanh số lẻ (thiếu sót: ISale để label trần `.00`, nên học ý chứ không học hình).

### 1.3 User Flow — số click
| Nhiệm vụ | ISale | PioPio hiện tại |
|---|---|---|
| Ghi 1 khoản chi tiền mặt | + → chọn TIỀN RA → nhập tiền → Lưu = **3 chạm** (mặc định hướng nào giữ nguyên lần sau theo state form) | + → chọn segment Chi → tiền → Thêm → redirect list = 4 bước + mất context trang |
| Lọc thu trong tháng | 2 click (Loại giao dịch ▼ → Tiền vào) | 2 click (Ⓐction sheet) — tương đương |
| Sửa giao dịch | card → action sheet → Xem giao dịch → form đầy đủ | card → action sheet → alert chỉ sửa tiền + ghi chú |
| Xóa | action sheet → xác nhận, chặn nếu gắn đơn/nợ | action sheet → xóa tự do (⚠ chưa chặn) |

### 1.4 Micro-interactions & Usability
- Loading: overlay "Đang tải..." toast giữa màn (thấy trong ảnh chụp); empty state dạng **hướng dẫn 3 gạch đầu dòng** (dạy người dùng mới).
- Validation UI: tiền <= 0 chặn tại client; nợ vượt hạn mức → warning **có xác nhận ghi đè** (soft-validation) — đúng cho nghiệp vụ thực (trả nợ một phần/không tròn).
- Toast/action sheet: mọi hành vi nguy hiểm đều có alert xác nhận + role destructive.
- Điểm yếu ISale: search bar luôn chiếm 1 hàng (lãng phí màn hình mobile); segment tháng chỉ -1/+1 tháng (không nhảy nhanh); label `.00/.000` khó hiểu.

---

## 2. AUDIT FRONTEND

### 2.1 Component Tree (khuyến nghị cho PioPio)
```
TradesPage (/trade)
├── MonthTabsComponent            (segment -1/0/+1 tháng, giữ lựa chọn theo user)
├── TradeFilterBarComponent       (Loại giao dịch ▼ Toàn bộ/Tiền vào/Tiền ra)
├── ListToolbarComponent          (tổng số lượng + tổng tiền server, bulk/export/import/view/settings)
├── TradeCardComponent*           (avatar KH/SP, tên, mục chip, staff, +X/-X màu, ngày, ảnh count)
│     └── click → TradeActionsSheet (Sửa/Xóa[chặn liên kết]/Chia sẻ)
├── EmptyStateComponent
└── FAB Trio
TradeAddPage (/trade/add)          [nâng cấp từ alert → trang/modal form]
├── ContactPickerComponent        (search KH có sẵn, async)
├── MoneyInputComponent           (định dạng nghìn, .00/.000, dương/âm theo segment)
├── DirectionSegmentComponent     (Tiền vào/Tiền ra)
├── CategoryChipsComponent        (đọc từ bảng trade_category, có + THÊM inline)
├── MoneyAccountSelectComponent   (ví/TK, default chọn account mặc định)
├── PaymentTypeSelectComponent    (Tiền mặt/CK/Quẹt thẻ...)
└── DatePickerComponent
```
(*) PioPio đang render card inline trong `trades.page.html` — tách component khi thêm badge ảnh/nợ.

### 2.2 State Management
- ISale: form add giữ `contactSelected`, `trade.isReceived`… trong service dùng chung (`TradeAddPage` ↔ list pub event qua `navCtrl.publish` + `saveLastActive`) — thêm mới xong list **không refetch toàn bộ** mà nhận event chèn.
- PioPio hiện tại: `/trade/add` là trang riêng, xong → `router.navigateByUrl('/trade', {replaceUrl})` → `ngOnInit` → `load()` full refetch. Đủ dùng cho <1k dòng/tháng; nâng cấp: chuyển sang **modal (như debt-form.modal)** + `onWillDismiss` trả payload → chèn thẳng vào `allItems` signal, tránh refetch.
- Đồng bộ số liệu: tổng tiền nên là `computed()` từ list đã lọc (PioPio đã làm đúng) + về lâu dài dùng `totalList` server-side (giống ISale) khi data lớn.

### 2.3 DOM & Performance
- Search: đã có debounce 300ms (PioPio) ✓ — ISale search cả note + tên KH + mã.
- Danh sách lớn: giữ **phân trang 20/trang** hoặc chuyển infinite-scroll (ion-infinite-scroll) — khuyến nghị infinite cho feel ISale.
- `track item.id` đã có ✓. Tránh re-render: tách `TradeCardComponent` với `OnPush` + `input.signal`.
- Ảnh biên lai: render thumbnail qua `<ion-img>`/lazy + gallery full-screen theo id (ISale: `/gallery?images=&id=`).
- Server-side pagination khi >5k dòng: `.range(from, to)` + count head-only (Supabase).

---

## 3. AUDIT BACKEND & DATABASE

### 3.1 Đối chiếu schema ISale ↔ PioPio
| ISale `trade` | PioPio `transactions` | Trạng thái |
|---|---|---|
| isReceived bool | type text('income'/'expense') | ✅ tương đương |
| value numeric | amount numeric | ✅ |
| note, createdAt | note, occurred_at | ✅ |
| moneyAccountId | account_id | ✅ có cột, **chưa có trong form add** |
| (không có) | category text | ✅ PioPio đơn giản hơn (ISale dùng bảng trade_category riêng) |
| contactId/productId/productCount/isPurchase | ❌ thiếu | GAP |
| debtId/orderId/receivedNoteId | ❌ thiếu | GAP (liên kết nguồn gốc) |
| staffId | ❌ (có auth.user) | GAP nhẹ |
| paymentType | ❌ thiếu | GAP |
| imageUrlsJson | ❌ thiếu | GAP |

### 3.2 Migration đề xuất (v24, additive & idempotent)
```sql
alter table public.transactions
  add column if not exists contact_id uuid references public.customers (id) on delete set null,
  add column if not exists order_id uuid references public.orders (id) on delete set null,
  add column if not exists debt_id uuid references public.loans (id) on delete set null,
  add column if not exists payment_type text default 'CASH',
  add column if not exists image_urls jsonb default '[]'::jsonb,
  add column if not exists staff_id uuid;

create index if not exists transactions_shop_occ_idx
  on public.transactions (shop_id, occurred_at desc);
create index if not exists transactions_contact_idx
  on public.transactions (contact_id) where contact_id is not null;

-- Danh mục thu/chi thay cho category text cứng (giữ category text để backward-compat)
create table if not exists public.trade_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists trade_categories_shop_idx
  on public.trade_categories (shop_id, order_index);
-- RLS: copy pattern "shop member read" + "shop perm write" của v12
```

### 3.3 API flow (Supabase = REST tự sinh)
| Nhu cầu | ISale | PioPio equivalent |
|---|---|---|
| List + lọc tháng + loại | POST data/listequal (table=trade) + totalList | `.select('*').gte/lte(occurred_at).eq('type',…)` |
| Tổng tiền | totalList server | `computed()` client (đủ) hoặc RPC `sum_transactions` |
| Phân trang | page/query builder | `.range(from,to)` + `{count:'exact',head:false}` |
| Tìm kiếm | client-side theo nhiều field | `.or('note.ilike.*,category.ilike.*')` hiện tại |
| Chuyển tiền nội bộ | money-account-transfer (có phí, chặn trùng TK, tiền>0) | trang `/transfer` đã có — bổ sung **phí chuyển** + 2 giao dịch expense/income trong 1 RPC |

### 3.4 Business logic cốt lõi
1. **Số dư ví** = SUM(isReceived? +value : −value) theo moneyAccountId → PioPio: `SUM(CASE WHEN type='income' THEN amount ELSE -amount END) GROUP BY account_id` (RPC `money_account_balances`), khuyến nghị **trigger sau insert/update/delete transactions** cập nhật cột cache `money_accounts.total` để dashboard không quét bảng.
2. **Chuyển tiền nội bộ** = 2 giao dịch liên kết (out từ A, in vào B) + phí (expense) — phải atomically trong 1 RPC/transaction SQL; ISale tạo 1 phiếu transfer chứa 2 legs.
3. **Thu/chi phát sinh từ module khác** (đơn hàng trả tiền, trả nợ, phiếu nhập) phải **đánh dấu nguồn gốc** (order_id/debt_id/received_note_id ≠ null) để khóa sửa/xóa tay — đây là rule hay nhất của ISale, PioPio chưa có.

---

## 4. FEATURE DEEP-DIVE

### 4.1 Tính năng hiển nhiên (PioPio đã có / thiếu)
| Tính năng | ISale | PioPio |
|---|---|---|
| List + lọc tháng/loại, tổng tiền | ✅ | ✅ |
| Thêm/sửa/xóa + xác nhận | ✅ | ✅ (sửa còn thô — alert) |
| Xuất Excel/CSV | ✅ .xlsx | ✅ CSV |
| Ví/Tài khoản + tổng tiền, mặc định | ✅ | ✅ trang riêng |
| Chuyển khoản nội bộ + phí | ✅ | ⚠️ có trang, chưa có phí |

### 4.2 Tính năng ẩn (edge features) — PioPio THIẾU
1. **Chọn ví/tài khoản ngay trong form thêm** + chọn mặc định.
2. **Hình thức thanh toán** (paymentType: Tiền mặt/CK/Thẻ…).
3. **Gắn Khách hàng / Sản phẩm** vào thu-chi (tra cứu dòng tiền theo KH).
4. **Ảnh biên lai** (imageUrlsJson, gallery, auto-switch tab).
5. **Danh mục động** (trade_category, kéo thả orderIndex) thay vì 2 mảng cứng.
6. **Chặn sửa/xóa giao dịch có nguồn gốc** (đơn/nợ/phiếu nhập).
7. **Chia sẻ giao dịch** (shareTrade → Zalo/Gmail/Facebook).
8. **Bulk select + sửa/xóa hàng loạt**, **nhập từ Excel**.
9. Ngày tạo là **date picker có min** (PioPio đang fix cứng = bây giờ!).
10. Staff attribution (nhân viên tạo khoản).

### 4.3 Killer Feature đề xuất cho PioPio (làm TỐT HƠN ISale)
1. **Sổ quỹ thời gian thực + dự đoán dòng tiền**: biểu đồ thu-chi theo ngày trong tháng + dự báo cuối tháng (linear regession client) — ISale chỉ có tổng.
2. **Đính biên lai bằng chụp ảnh + VietQR auto-match**: SePay/webhook bank (ISale có "Los thông báo SePay") → tự tạo giao dịch khớp SỐ TIỀN + NỘI DUNG, người dùng chỉ xác nhận.
3. **Recurring transactions** (thuê nhà, lương — định kỳ hàng tháng, auto-nhắc).
4. **Sao kê ví xuất PDF có chữ ký số + QR xác thực** (tận dụng VietQR sẵn có của PioPio).
5. **Offline-first**: ghi giao dịch offline (IndexedDB) → sync khi có mạng — chủ shop hay ở kho không mạng.

---

## 5. SECURITY & EDGE CASES

### 5.1 Rủi ro + biện pháp
| Rủi ro | Kịch bản | Biện pháp (Supabase/Postgres) |
|---|---|---|
| **Trừ tiền kép / race condition** | 2 tab cùng bấm Lưu chuyển tiền; double-submit | RPC `transfer_money` dùng `BEGIN; ... UPDATE ... WHERE total >= amount; COMMIT` + idempotency-key (cột `client_nonce unique`); nút Lưu `busy` guard (đã có) |
| **Số dư âm không hợp lệ** | Chi vượt số dư ví | CHECK ở mức RPC: `IF (SELECT balance) < amount THEN RAISE EXCEPTION`; constraint `amount > 0` trên bảng |
| **Sửa/xóa giao dịch hệ thống** | User xóa thu-chi sinh từ đơn hàng | `BEFORE DELETE` trigger: `WHEN OLD.order_id IS NOT NULL → RAISE EXCEPTION` (đúng rule ISale) |
| **Đồng thời sửa cùng dòng** | lost update | `updated_at` + optimistic check `eq('updated_at', old)` hoặc phiên bản `version int` |
| **Spam API / payload khổng lồ** | upload 100 ảnh, amount 1e15 | RLS đã giới hạn shop; thêm CHECK `amount < 1e13`; hạn chế image_urls ≤ 10 phần tử (trigger jsonb_array_length); rate-limit ở edge function nếu có |
| **Biên lai chứa mã độc** | upload .exe đổi tên .jpg | Chỉ nhận ảnh qua Supabase Storage bucket `receipts`, whitelist mime `image/*`, `signed url` hết hạn, **không render SVG** (chứa script), nén lại bằng canvas trước upload |
| **Data rác** | category tự do lặp từ khóa | Bảng trade_categories + FK/gợi ý; định kỳ gộp theo normalized title |
| **Phi quyền** | member viết hộ shop khác | Đã có RLS v12: select `is_shop_member`, write `has_permission(shop,'money')` — giữ nguyên khi thêm cột |

### 5.2 Snippets logic lõi

**Backend — RPC chuyển tiền atomic (Supabase/PLpgSQL):**
```sql
create or replace function public.transfer_money(
  p_shop uuid, p_from uuid, p_to uuid, p_amount numeric, p_fee numeric default 0, p_nonce text default null
) returns void language plpgsql as $$
declare v_bal numeric;
begin
  if p_from = p_to then raise exception 'Trung tai khoan'; end if;
  if p_amount <= 0 then raise exception 'So tien phai > 0'; end if;

  select coalesce(sum(case when type='income' then amount else -amount end),0)
    into v_bal from public.transactions
   where shop_id = p_shop and account_id = p_from;
  if v_bal < p_amount + p_fee then raise exception 'So du khong du'; end if;

  insert into public.transactions (shop_id, type, amount, account_id, note, occurred_at, client_nonce)
  values (p_shop, 'expense', p_amount + p_fee, p_from, 'Chuyen tien noi bo', now(), p_nonce),
         (p_shop, 'income',  p_amount,       p_to,   'Nhan tien noi bo',  now(), p_nonce);
exception when unique_violation then null; -- idempotent replay
end $$;
```

**Frontend — chèn thẳng vào signal sau khi tạo (không refetch):**
```ts
// trades.page.ts — modal onWillDismiss trả payload
const { role, data } = await modal.onWillDismiss();
if (role !== 'save') return;
const created = await this.transactionsService.create(data.payload);
this.allItems.update((list) => [created, ...list]); // computed() tự tính lại tổng
```

**Money input theo hướng tiền (ngưỡng pattern ISale TIỀN VÀO/RA):**
```ts
setDirection(d: 'income' | 'expense') {
  this.direction.set(d);            // segment outline active
  // amount luôn dương; dấu do type quyết định -> tránh âm số âm
}
get signedAmount(): number {
  return this.direction() === 'income' ? this.amount() : -this.amount();
}
```

---

## 6. KẾT LUẬN & THỨ TỰ LÀM (đề xuất)
1. **P0** — Form add/upgrade: ví/tài khoản + paymentType + ngày tạo + category động + sửa bằng modal (không alert).
2. **P1** — Migration v24 (contact/order/debt/payment_type/image_urls + trade_categories) + chặn xóa giao dịch có nguồn gốc (trigger).
3. **P1** — Chuyển tiền nội bộ: thêm phí + RPC atomic.
4. **P2** — Ảnh biên lai (Storage + gallery) + bulk select + import Excel.
5. **P2** — RPC số dư ví + trigger cache `money_accounts.total`.
6. **P3** — Killer features: recurring, SePay auto-match, dự báo dòng tiền.
