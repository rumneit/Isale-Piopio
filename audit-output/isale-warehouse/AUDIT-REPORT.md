# AUDIT ISALE — MODULE KHO: PHIẾU NHẬP · PHIẾU CHUYỂN · KIỂM KÊ

> **Phạm vi:** Audit 100% 3 module kho của Isale (isale.online) + đối chiếu code PioPio hiện có → thiết kế lại PRD chuẩn quốc tế theo 5 góc nhìn (VP Product · Principal UX · Staff FE · Backend Architect · DevSecOps/QA).
> **Phương pháp:** CDP tự động trên Edge debug (port 9222) — sweep UI thật + hook fetch/XHR + decompile 102 chunk JS của Isale. **Không giả định** — mọi nhận định đều có bằng chứng (screenshot hoặc trích code decompile). ISale chỉ bị thao tác đọc (không lưu phiếu nào).
> **Ngày:** 28/09/2026 · **Evidence:** `shots/wh01–wh07.png` · chunks decompiled lưu tại `%TEMP%\opencode\wh-all\`, `wh-chunks\`.
>
> **🔴→🟢 TRẠNG THÁI P0 (ngày 28/09/2026): ĐÃ TRIỂN KHAI** — commit `31bb355`, deploy prod READY+aliased (main `GLLOFUA5`, chunk ledger `chunk-BBQFrIn5.js` đã verify trên prod):
> - `supabase-migration-v27.sql`: `inventory_ledger` + `inventory_audit` (append-only, RLS), RPC `inv_apply_note`/`inv_reverse_note`/`inv_complete_stockcount` (re-base)/`inv_history`, **trigger đơn hàng tự trừ tồn** (status NOT IN draft/quote/cancelled — thống nhất rule doanh thu v26) + đảo khi hủy/xóa, trigger audit vặn tồn tay + lịch sử 3 bảng phiếu.
> - `InventoryLedgerService` + sửa 4 luồng ghi tồn (received-notes / returns / transfer-add / stock-counts.complete): **bỏ cộng trừ `products.stock` client-side**, ghi qua ledger; fallback legacy khi v27 chưa chạy (PGRST202) — tương thích ngược hoàn toàn.
> - Kiểm kê chốt theo **re-base** (diff = số đếm − tồn hiện tại server-side, bán trong lúc kiểm kê không sai số).
> - Audit trail UI tối giản: nút lịch sử trên phiếu nhập.
> - Tests: `test-inventory.mjs` **16/16 PASS** (ledger mode + fallback mode) · test-report PASS · unit 55/55.
> **Chờ user chạy `supabase-migration-v27.sql` trên Supabase prod** — trước khi chạy, hệ thống tự dùng đường cũ (an toàn); sau khi chạy, mọi ghi tồn tự chuyển qua sổ cái.

> **🟢 TRẠNG THÁI P1 (ngày 28/09/2026): ĐÃ TRIỂN KHAI — Quy trình & Tiền (v28)**
> - `supabase-migration-v28.sql`: bảng `suppliers` + `supplier_debts` (AP: amount/paid_amount/due_date, status open→partial→paid) + `transfer_losses` (hao hụt có lý do + trách nhiệm); `received_notes` +`supplier_id`/`paid_amount`/`due_date`; `transfers` +`status` (`in_transit`/`completed`, legacy mặc định completed)/`received_at`/`completed_by`; `transactions` +`supplier_debt_id`. RPC: `inv_create_transfer` (atomic: tạo phiếu in-transit + trừ tồn nguồn 1 transaction, chặn âm trước khi tạo), `inv_receive_transfer` (đối soát xuất/nhận — tồn đích tăng theo số THỰC NHẬN, hao hụt ghi transfer_losses, xử lý `write_off` hoặc `return_to_source` hoàn nguồn, idempotent theo transfer_in), `sup_debts` (aging theo hạn), `sup_pay_debt` (idempotent theo nonce, tự tạo giao dịch chi "Trả NCC" không sửa/xóa được), `sup_debt_payments`. RLS member + audit trigger tái dùng `_inv_note_audit`; `inv_history` mở rộng whitelist.
> - Trang mới: **Nhà cung cấp** (`/suppliers` — CRUD + tổng nợ/NCC, chặn xóa khi còn nợ), **Công nợ NCC** (`/supplier-debts` — list theo hạn, lọc quá hạn, trả tiền từng phần + lịch sử trả), **Nhận hàng chuyển kho** (`/transfer/receive/:id` — nhập số nhận từng dòng, badge hao hụt, lý do bắt buộc khi hụt).
> - Form nhập hàng: chọn NCC (thêm nhanh NCC inline) + "trả trước" + hạn thanh toán → tự tạo supplier_debt phần chưa trả; giao dịch chi chỉ với phần ĐÃ TRẢ. Fallback v28 chưa chạy: payload cũ, không đụng bảng mới (probe cột + PGRST202).
> - Tests: `test-inventory-p1.mjs` **24/24 PASS** (port 8353: NCC · công nợ · trả tiền nonce · nhập nợ · transfer atomic · nhận hàng đối soát · fallback) · `test-inventory.mjs` 16/16 PASS (không hồi quy) · unit 55/55 · build exit 0.
> - **Chờ user chạy `supabase-migration-v28.sql`** (sau v27) — chưa chạy thì tính năng mới tự ẩn/fallback, không lỗi.

> **🟢 TRẠNG THÁI P1b (ngày 28/09/2026): ĐÃ CODE — Maker-checker + Partial receipt (v29)**
> - `supabase-migration-v29.sql`: `received_notes` +`status` (`pending`/`partial`/`completed`/`cancelled`, legacy mặc định completed) +`parent_id` (phiếu "nhập tiếp" tham chiếu gốc) +`created_by`/`approved_by`/`approved_at`/`reject_reason`; RLS mới thay "shop member all" (v2): nhân viên chỉ được INSERT `status='pending'`, sửa trực tiếp chỉ khi có quyền `inventory_approve`; RPC `inv_approve_note` (duyệt = 1 transaction: ghi tồn qua sổ cái v27 idempotent + giao dịch chi phần ĐÃ TRẢ chống double theo `client_nonce` + công nợ NCC phần CHƯA TRẢ + chốt partial/completed; **cấm tự duyệt phiếu do chính mình tạo**), `inv_reject_note` (pending → cancelled + lý do), `inv_open_receive_notes` (outstanding tính NET theo CHUỖI gốc — cộng dồn mọi phiếu "nhập tiếp", nhận thừa không âm — nguồn cho "Chờ nhập thêm" + prefill).
> - UI: list phiếu nhập 3 segment (Tất cả / Chờ duyệt / Chờ nhập thêm) + badge trạng thái (Chờ duyệt/Nhập thiếu/Đã huỷ); bấm phiếu pending → duyệt/từ chối (lý do tùy chọn); bấm phiếu huỷ → xóa hẳn; segment "Chờ nhập thêm" liệt kê phiếu thiếu + nút **Nhập tiếp** → form prefill phần thiếu (qty = số thiếu, sửa được, `parent_id` = gốc); form nhập có toggle **"Đặt trước, nhận một phần"** (cột Số đặt `qty_ordered`); nhân viên thấy banner "phiếu sẽ chờ duyệt" và KHÔNG ghi tồn/tiền/công nợ đến khi được duyệt.
> - Phân quyền: chủ shop luôn được duyệt (`has_permission(shop,'inventory_approve')` — owner luôn true); có thể cấp cờ `inventory_approve` cho nhân viên tin cậy qua trang Phân quyền.
> - Tests: `test-inventory-p1b.mjs` **29/29 PASS** (port 8354: owner nhập thiếu → partial · staff tạo → pending không ghi gì · segments/badge · duyệt approve_note+nonce · từ chối reject_note · nhập tiếp prefill + parent_id · fallback v29 chưa chạy) · P0 16/16 · P1 24/24 (không hồi quy) · unit 55/55 · build exit 0.
> - **Chờ user chạy `supabase-migration-v29.sql`** (sau v28) — chưa chạy thì flow mới tự ẩn, mọi phiếu ghi ngay như cũ.

---

## PHẦN A — BẢN ĐỒ MODULE ISALE (đã xác minh bằng decompile)

### A1. Routes (Angular lazy-loaded, hash routing)

| Route | Module chunk | Ghi chú |
|---|---|---|
| `#/received-note` | `8048` (ReceivedNoteModule — main.js: `Promise.all([7489,6841,3064,2950,8048]).then(…15818…ReceivedNoteModule)`) | Danh sách phiếu nhập, filter theo tháng (segment Tháng 07/08/09…), FAB thêm |
| `#/products/received-note/detail/:id` | trong 8048 | Detail + action sheet: Sửa · Xóa · Share · **In** · **Export Excel** · **Thêm công nợ (add-debt)** · **Lịch sử thay đổi (change-history)** |
| `#/transfer-note` | `4307` (TransferNoteModule — `[7489,6841,3064,8592,4307]`) | Danh sách theo khoảng ngày, FAB thêm |
| `#/stock-check` | `5716` (StockCheckModule — `[7489,6841,3064,7180,5716]`) | Danh sách + footer "Tổng: ± 0₫" (tổng giá trị chênh lệch) |
| `#/stock-check/update/:id` | trong 5716 | Sửa phiếu kiểm kê |
| `#/change-history/{table}/{id}` | chung | **Audit trail dựng sẵn cho mọi bảng** (received_note / transfer_note / stock_check) |

### A2. API schema (bắt trực tiếp qua hook + decompile service trong main.js)

**Base:** `https://api2.isale.online` · Mọi request gắn `staffId` nếu đang đăng nhập bằng tài khoản nhân viên (`staffService.selectedStaff`) → **scoping dữ liệu theo NV ở tầng API**.

| Endpoint | Method | Payload / hành vi | Bằng chứng |
|---|---|---|---|
| `/ReceivedNote/list` | POST | `{dateFrom, dateTo, storeId, staffId?}` | main.js decompile |
| `/ReceivedNote/save` | POST | Full entity → trả về `id` mới | main.js: `save(f){…post(apiUrl+"/ReceivedNote/save",f).then(c=>{f.id=c})}` |
| `/receivednote/save` | POST (biến thể lowercase) | Dùng khi sync bản lưu offline: bản ghi mang `onlineId`; sau khi sync gán `f.onlineId = D` | main.js decompile |
| `/ReceivedNote/MissingExport` | GET | **Dò phiếu nhập chưa có phiếu xuất tương ứng** | main.js: `getNotesMissingExportNote()` |
| `/TransferNote/list` | POST | `{dateFrom, dateTo, storeId, staffId?}` | main.js + hook PASS A |
| `/TransferNote/save` | POST | Full entity → trả id | main.js |
| `/TransferNote?id={id}` | GET | Lấy 1 phiếu (kèm `&staffId=`) | main.js |
| `/data/remove?table=transfer_note&id={id}` | POST | Xóa generic theo table | main.js |
| `/data/listequal` | POST | `{table:'received_note', dateRange:[from,to,'createdAt'], sort:[['createdAt','desc']], withPermission:'true'}` · tương tự `table:'stock_check'` · `{table:'custom_field', tableName:'received_note'}` (schema động) | Hook PASS A/B |
| `/data?table={t}&id={id}` | GET | Lấy 1 bản ghi generic | main.js |
| `/data/save` | POST | Generic: `contact`, `contact_point`, `sales_line`, `business_type`, `calendar`… (bảng phiếu kho có endpoint riêng) | main.js |
| `/excel/UploadReceivedNote` · `/excel/UploadStockCheck` | POST upload | **Nhập phiếu từ Excel** | main.js `excelService` |
| `/excel/CreateStockCheckFile` · `/excel/CreateReceivedNoteFile` | POST download | Xuất file phiếu | main.js |
| `/excel/ReceivedTemplate` · `/excel/StockCheckTemplate` | POST download | **Template Excel để fill** | main.js |
| `/account/getdefault` | GET | Ví/tài khoản mặc định (204 nếu chưa có) | Hook PASS B |

### A3. Model entities (decompile class constructor — chunk 159/4307)

**Lớp phiếu dùng chung (order-like — ReceivedNote/TransferNote kế thừa shape này, chunk 29297):**
```
id, orderCode, contactId, staffId, collaboratorId, moneyAccountId,
contactName, contactPhone, contactAddress,
shippingFee, taxType, tax, netValue, discount, discountOnTotal,
totalPromotionDiscount, total, status, items[], itemsJson,
contact, staff, moneyAccount, createdAt, onlineId, paid, tableId, change,
joins: [contactId→contact, moneyAccountId→money_account],   // join khai báo kiểu metadata
storeId, store, billOfLadingCode, shippingPartner, shipperName, shipperPhone,
deliveryAddress, shipperId, hasShipInfo, saveProductNotes, lang,
pointAmount, pointPaymentExchange, amountFromPoint, shipCostOnCustomer,
promotions[], paymentType: 'CASH', shippingJson
```

**Product (chunk 159):** `id, code, barcode, count (tồn), price, originalPrice, expiredAt, unit, isCombo + items[] (BOM combo), materials[] + materialsJson, isService, isOption, units[]/unitsJson (đơn vị phụ: {unit, exchange, price}), fromUnit, staffId, isMaterial, autoMaterials, requiresSerialManagement, showOnWeb, status, onlineId…`

**Contact (NCC + KH chung 1 entity):** `id, code, fullName, mobile, email, address, staffId, businessTypeId, salesLineId, point, levelId, buyCount, lastActive, lastAction ('trade'), fbUserId, lat, lng, onlineId…`

**MoneyAccount (ví/tài khoản):** `id, accountName, total, isDefault, bankName, bankNumber, bankAccountName, onlineId`

**User/session:** `blockViewingQuantity` — **quyền ẩn tồn kho theo user** (class 6900: storeId, shiftId, isCollaborator, blockViewingQuantity).

### A4. Luồng save đã decompile — bằng chứng kiến trúc

**Kiểm kê (chunk 5716, trang stock-check-add):**
```js
save(){ if(!validate()) return; saveDisabled=true; loading;
  if (isStaff) note.staffId = selectedStaff.id;
  await addProducts();                      // gộp SP quét barcode
  note.itemsJson = JSON.stringify(note.items);
  note.storeId = store?.id ?? note.storeId; // ĐA KHO: phiếu gắn store
  note.saveProductNotes = true;
  note.lang = …;
  stockCheckService.save(note)              // POST → server trả id
  … analytics 'stock-check-add-save-success' … exitPage(); publish 'reloadStockCheckList'
}
```
— **KHÔNG có bất kỳ lệnh ghi tồn nào phía client** (`productService` chỉ dùng để ĐỌC cho selector/`searchByBarcode`). Item kiểm kê có `{quantity, amount}` (SL + giá trị), `reCalc(e){e.amount…}` tính amount theo qty×price. Barcode không tìm thấy → `addNewProduct(n)` **tạo SP mới ngay từ mã vạch**. Chi tiết phiếu đọc lại `itemsJson`, `totalQuantity = Σ quantity`, `totalProductsAmount = Σ amount`, tab `info`, route sửa `/stock-check/update/:id`, có **change-history**.

**Chuyển kho (chunk 4307, transfer-note-add):**
```js
save(){ validate(); // 'must-select-stores' nếu chưa chọn 2 kho
  if (isStaff) note.staffId = …;
  note.itemsJson = JSON.stringify(items);
  note.exportStoreId = exportStore && !isMainStoreForExport ? exportStore.id : 0; // 0 = kho chính
  note.importStoreId = importStore && !isMainStoreForImport ? importStore.id : 0;
  if (!note.hasPayment) note.total = 0;      // không thanh toán → 0đ
  transferNoteService.save(note)             // POST /TransferNote/save
    .then( async () => {
      await createTransactionsForExport();   // sinh giao dịch Thu/Chi phía kho XUẤT
      await createTransactionsForImport();   // sinh giao dịch Thu/Chi phía kho NHẬP
      await addProductNotes();
    })
}
createTransactionsForImport(){
  const olds = await tradeService.getTradesByTransferNote(note.id);
  for (old of olds) if (!old.debtId) await tradeService.deleteTrade(old); // idempotent re-save
  const t = new Trade();
  t.contactId=note.contactId; t.staffId=…; t.isPurchase=false; t.isReceived=false;
  t.value=note.total; t.transferNoteId=note.id;
  t.moneyAccountId=note.importMoneyAccountId;       // ví của kho NHẬP
  t.note='Chuyển kho #'+note.id; t.createdAt=note.createdAt;
  await tradeService.saveTrade(t);
}
```
— **Phiếu chuyển = 2 leg thanh toán 2 chiều** (kho xuất chi / kho nhập thu) liên kết qua `transferNoteId`, re-save xóa giao dịch cũ tạo mới (idempotent-by-replace). Item chuyển có **`actualExport` (SL thực xuất) và `actualImport` (SL thực nhập) riêng từng dòng** + selector hiển thị `quantity-left = actualQuantity − actualExport` (tồn khả dụng). Chọn SP hỗ trợ lọc `listOption: all | expiry | quantity` (`getProductsExpiry`, `getProductsQuantity`) — **lọc SP theo hạn dùng**.

**Đa đơn vị (multi-unit) trong selector:** SP có `units[]` thì mỗi đơn vị phát sinh 1 dòng chọn được: `unit = w.unit, basicUnit, unitExchange = w.exchange, price = w.price, count = floor(count/exchange)` — quy đổi thùng/lẻ ngay trong bước chọn hàng.

### A5. Điều Isale LÀM được (bằng chứng) vs KHÔNG làm được (bằng chứng)

| Tính năng | Isale | Bằng chứng |
|---|---|---|
| Đa kho thật (store entity, kho chính = id 0) | ✅ | `exportStoreId/importStoreId`, `storeService.getStores()`, `isMainShop` |
| Phiếu nhập = entity đầy đủ (NCC là contact, ví tiền, thuế, CK, promotion, paymentType) | ✅ | lớp 29297 + form wh05 |
| **Công nợ NCC từ phiếu nhập** (add-debt, debtType, hạn thanh toán `debtAddMaturityDate`) | ✅ | action sheet `received-note-detail.add-debt` + chunk 159 |
| Transfer sinh thu/chi 2 chiều + idempotent re-save | ✅ | `createTransactionsForExport/Import` |
| Đối soát xuất/nhập chuyển kho (`actualExport` vs `actualImport`) | ⚠️ Có cột dữ liệu + UI nhập 2 số, **không có workflow chênh lệch/trách nhiệm** | chunk 4307 |
| Audit trail (change-history) mọi bảng | ✅ | route `/change-history/{table}/{id}` |
| Phân quyền NV: chỉ thấy phiếu của mình; **ẩn tồn kho** (`blockViewingQuantity`) | ✅ | mọi API gắn staffId; class 6900 |
| Offline-first mobile (`onlineId`, sync sau) | ✅ (app di động) | `/receivednote/save` + `onlineId` |
| Excel: template + import + export phiếu | ✅ | endpoints `excel/*` |
| **Batch/lot + HSD theo TỪNG DÒNG phiếu nhập** | ❌ Không — chỉ có `expiredAt` trên product (1 mức), lọc `getProductsExpiry` | không thấy field batch/lot trong items của phiếu; `Serial` chỉ là `requiresSerialManagement` flag |
| **Serial number tracking** (nhập/trả từng số serial) | ❌ Chỉ có flag khai báo, không thấy luồng serial trong 3 phiếu | chunk 159 |
| **Partial receipt** (nhập một phần, còn lại giữ backlog) | ❌ Chỉ dò được "phiếu nhập thiếu xuất" (`MissingExport`), không có trạng thái backlog | endpoint thiếu luồng complete/partial |
| Maker-Checker (tạo → duyệt) | ❌ Không thấy trạng thái draft/approved cho phiếu kho | status=0 duy nhất, không enum duyệt |
| Blind count / cycle count | ❌ Kiểm kê Isale = nhập đếm trên danh sách có sẵn, không chế độ ẩn tồn | chunk 5716 |
| In-Transit state cho chuyển kho | ❌ Chỉ có SL xuất/nhập trên phiếu, không có trạng thái "đang đi" | chunk 4307 |

---

## PHẦN B — HIỆN TRẠNG PIOPIO (đối chiếu code thật)

| Hạng mục | PioPio hiện tại | Vấn đề nghiêm trọng |
|---|---|---|
| `received_notes` (v2) | `code, supplier_name (text), total, items jsonb {product_id,name,qty,cost}, paid bool, note` | NCC là chuỗi free-text (không phải entity) → không có công nợ NCC, không tổng hợp được công nợ theo NCC |
| Service tạo phiếu nhập | insert phiếu → **loop từng item `productsService.update(stock = old+qty)` client-side**, try/catch nuốt lỗi (`console.error`) | (1) Race condition read-modify-write: 2 phiếu cùng lúc → mất cập nhật; (2) lỗi giữa chừng → phiếu đã insert, tồn cập nhật một nửa **im lặng**; (3) không transaction |
| `transfers` (v7) | `code, destination (text!), items jsonb, note` | Không phải đa kho — destination là nhãn chuỗi. `transfer-add.page.ts:204` tự trừ tồn nguồn client-side `Math.max(0, stock−qty)`, **không cộng vào đích** (không có đích), không đối soát xuất/nhập |
| `stock_counts` (v12) | `status draft/completed/cancelled, items jsonb {system_qty, counted_qty, diff}, total_diff, completed_at` | Có draft workflow (điểm cộng) nhưng: `complete` = `product.stock = counted_qty` đè trực tiếp (vẫn read-modify-write ở tầng client), không blind count, không cycle-count schedule, không duyệt |
| Bán hàng (POS) | **KHÔNG đụng vào tồn kho** (orders/order_items không trừ products.stock) | 🔴 Lỗ hổng toàn vẹn lớn nhất: tồn kho chỉ đúng nếu chỉ dùng 4 luồng phiếu; bán hàng không trừ → số tồn ≠ thực tế |
| Thanh toán nhập | `paid` bool → tạo 1 transaction Thu/Chi | Không có nợ NCC (mua chịu không biểu diễn được), không theo dõi hạn thanh toán |
| Audit | `logService` ghi log tự do | Không có before/after snapshot, không change-history per-record |

---

## PHẦN C — 5 PROMPT: THIẾT KẾ LẠI CHO PIOPIO

### C1. PROMPT 1 — Nghiệp vụ & Chuỗi cung ứng (VP of Product)

#### C1.1 Nguyên tắc nền tảng: SỔ CÁI TỒN KHO (Ledger)
Toàn bộ 3 module xây trên 1 nguyên lý: **không ai được cộng/trừ cột `stock` trực tiếp**. Cột `products.stock` chỉ là *cached projection* do trigger tính từ ledger (chi tiết kỹ thuật ở C4). Mọi nghiệp vụ kho = insert dòng ledger bất biến.

#### C1.2 PRD Phiếu Nhập Kho (Inbound)

**Trạng thái phiếu:** `draft → pending_approval → approved → partial → completed → cancelled`
- `draft`: Maker tạo/sửa tự do. Chưa đụng tồn, chưa đụng công nợ.
- `pending_approval`: gửi duyệt. Maker không sửa được nữa.
- `approved`: Checker duyệt → **ghi ledger + tạo công nợ NCC** (nếu mua chịu).
- `partial`: đã nhận một phần (partial receipt) — những dòng chưa đủ chuyển thành *backlog*.
- `cancelled`: chỉ Checker được hủy; nếu đã approved phải có dòng ledger đảo (reversal), không xóa.

**Dòng hàng (item) mở rộng:**
```
{ product_id, name, qty_ordered, qty_received, cost, price?, 
  batch_no?, expiry_date?, serials?: string[] (khi product.require_serial) }
```
- **Batch + HSD:** mỗi dòng nhập có thể khai `batch_no` + `expiry_date`. Lưu vào bảng `inventory_batches` (product_id, batch_no, expiry_date, qty_remaining). Bán hàng (giai đoạn sau) ưu tiên FEFO (First-Expired-First-Out). Cảnh báo UI: nhập batch trùng product+batch_no+expiry → gộp; HSD < hôm nay → chặn; HSD < 30 ngày → cảnh báo vàng.
- **Serial:** với SP bật `require_serial`, mỗi unit nhập phải khai 1 serial (quét liên tục, UI đếm tiến độ `12/20`); serial trùng trong phiếu → chặn; serial đã tồn tại trong kho → chặn. Lưu bảng `inventory_serials` (product_id, serial, status: in_stock/sold/returned, batch_id?, received_note_id).
- **Partial receipt:** duyệt phiếu → `qty_received` ban đầu = 0; màn hình "Nhận hàng" cho nhập *số thực nhận từng dòng* (mặc định = đặt); `Nhận` nhiều lần cho tới khi đủ → tự `completed`. Còn thiếu khi đóng phiếu → dòng `qty_received < qty_ordered` ghi nhận backlog (hiển thị ở tab "Chờ nhập thêm" của phiếu + danh sách tổng "Hàng đang chờ NCC").
- **Công nợ NCC (Accounts Payable):** khi approved, nếu `paid_amount < total` → tự tạo `supplier_debts` (supplier_id, received_note_id, amount = total − paid, due_date từ `maturityDate`, status: open/partial/paid). Thanh toán qua màn Thu/Chi loại "Trả NCC" → trừ dần `paid_amount`, đủ → `paid`. NCC nâng cấp từ free-text hiện tại: bảng `suppliers` thật (tên, điện thoại, địa chỉ, ghi chú) + tương thích ngược: phiếu cũ giữ `supplier_name`.

**Edge cases bắt buộc xử lý (bảng quy tắc):**
| Case | Rule |
|---|---|
| Nhập SP chưa có trong danh mục | Cho tạo nhanh inline (như Isale `addNewProduct`) nhưng bắt buộc điền đơn vị + cost; SP nâng tờ (draft) |
| Nhập âm/0 | Chặn qty ≤ 0; cost < 0 chặn, cost = 0 cảnh báo xác nhận |
| Trùng phiếu (double-click) | Idempotency-Key phía client (C4.4) |
| Sửa phiếu đã approved | Cấm; chỉ hủy + tạo phiếu mới (reversal ledger) |
| Hủy phiếu đã hoàn tất | Ledger đảo dấu + hoàn công nợ; mọi thay đổi ghi audit trail |
| Đổi cost SP khi nhập | Cập nhật `products.cost` (giá vốn mới nhất) — dùng *moving average cost* nếu đã có tồn: `new_cost = (old_qty×old_cost + recv_qty×cost) / (old_qty+recv_qty)` |
| Phiếu nhập có HSD đã quá hạn khi nhập | Chặn dòng đó |
| Xóa NCC đang còn nợ | Chặn xóa |

#### C1.3 PRD Phiếu Chuyển Kho (Transfer) — In-Transit + đối soát hao hụt

**Trạng thái:** `draft → in_transit → completed | discrepancy → cancelled`
- `draft`: chọn **kho nguồn + kho đích** (2 store entity thật — v24 đã có `stores`; destination text deprecated). Điều kiện: cùng shop, kho nguồn ≠ kho đích, đều active.
- Chốt phiếu (send) → `in_transit`: **trừ tồn nguồn NGAY LÚC CHỐT** (ledger OUT-kho nguồn) + ghi `qty_sent` từng dòng. Kho đích CHƯA có hàng. Tồn "đang đi" = tổng ledger OUT chưa khớp IN, hiển thị riêng (badge ☗ "Đang đi: 12") ở cả 2 kho.
- **Nhận hàng (receive):** màn nhập `qty_received` từng dòng (mặc định = qty_sent). So sánh:
  - Nhận đủ → `completed`, ledger IN-kho đích = qty_sent.
  - **Nhận thiếu (98/100):** chênh lệch `qty_lost = qty_sent − qty_received`:
    1. Bắt buộc chọn lý do: `hư hỏng / thất lạc / sai mã / khác (nhập text)`.
    2. Chọn xử lý kho nguồn: `ghi giảm chi phí (write-off)` hoặc `truy hoàn tồn kho nguồn (rollback)`.
    3. Checker duyệt chênh lệch → nếu write-off: ledger LOSS; nếu rollback: ledger IN về kho nguồn.
    4. Ghi `transfer_losses` (transfer_id, product_id, qty, reason, resolved_by, resolved_at) — báo cáo hao hụt theo nhân viên giao/nhận nếu có `staff_id`.
- **Crash giữa chừng:** vì trạng thái nằm trên DB (một row), server restart không mất phiếu; phiếu kẹt `in_transit` quá X ngày được mục "Cảnh báo" liệt kê để xử lý tay (không tự nhảy trạng thái).
- Thanh toán giữa 2 kho (học Isale): toggle "Có giao dịch thanh toán?" → khi complete tạo 2 transaction đối ứng: kho đích Chi → kho nguồn Thu (hoặc ngược) — mỗi kho có ví riêng (mở rộng sau nếu chạy đa kho chi nhánh; hiện PioPio 1 shop nên để P2).

#### C1.4 PRD Kiểm Kê Kho (Stocktake)

- **Blind Count (kiểm kê mù):** phiếu có cờ `blind = true` → màn đếm **KHÔNG hiển thị `system_qty`** (hiện `?` / "—"); chỉ sau khi hoàn tất đếm mới so đối. Config theo vai trò: ai được bật/tắt blind (mặc định bật với NV kho, tắt với chủ shop).
- **Cycle count (kiểm kê động):** tạo phiếu theo *phạm vi* — (a) toàn kho, (b) theo nhóm SP, (c) theo danh sách chọn tay, (d) **ABC tự đề xuất**: SP bán chạy (top 20% theo `report_top_products` 30 ngày) → đếm tuần; SP trung → tháng; còn lại → quý. Bán hàng trong lúc kiểm kê KHÔNG sai số vì: tồn hệ thống (`system_qty`) **chốt tại thời điểm tạo phiếu** (snapshot vào items), diff tính lúc duyệt = `counted − (system_qty + biến động ledger từ lúc snapshot đến lúc duyệt)` — tức **re-base trước khi ghi** (chi tiết C4.5).
- Trạng thái giữ nguyên `draft → completed | cancelled` + thêm `pending_approval` khi bật maker-checker cho kiểm kê.
- UI kết quả: bảng system/counted/diff ± màu, tổng giá trị chênh lệch (đã có), ghi giá trị theo `cost` hiện tại.

#### C1.5 Maker-Checker Workflow (chung 3 module)

- Áp dụng theo **quyền**, không theo cứng vai trò: ai có `perm: 'inventory_approve'` (thêm ở trang Phân quyền) là Checker. Mặc định: chủ shop = Checker, nhân viên = Maker.
- Mỗi bảng phiếu thêm cột `created_by` (đã có ở stock_counts, cần thêm cho received_notes/transfers), `approved_by`, `approved_at`, `status`.
- Ràng buộc DB (RLS + trigger): Maker không update được phiếu đã gửi duyệt; Checker không duyệt phiếu do chính mình tạo (cấu hình được, mặc định bật — tách nhiệm vụ thật).
- Mọi transition trạng thái ghi `inventory_audit` (C5.4).

### C2. PROMPT 2 — UX/UI (Principal Designer)

Nguyên tắc: **Barcode-first, glove-friendly, high-contrast, zero-mouse.**

**Wireframe chung (mobile/tablet ≥ 7"):**
```
┌─────────────────────────────────────────────┐
│ ← Phiếu nhập kho PN-260928-A1      [Lưu ⊳] │  ← header cố định, Lưu luôn nhìn thấy
│ ┌─────────────────────────────────────────┐ │
│ │ 🔍 [ Quét mã vạch / SKU…        ▮    ] │ │  ← ô scan TỰ FOCUS, chiếm full width
│ └─────────────────────────────────────────┘ │  height 56px, tap target ≥ 48px
│ ┌─────────────────────────────────────────┐ │
│ │ ✔ Bột giặt 5kg   ×20   SL[20__] ĐG[85k]│ │  ← dòng vừa quét: NHẤP XANH 1.2s
│ │ ✔ Dầu ăn 1L     ×12   SL[12__] ĐG[32k] │ │     viền xanh + icon ✓ + âm "beep-cao"
│ │ ⚠ Không có trong phiếu: Xà phòng #8912 │ │  ← quét sai: viền ĐỎ + rung + âm "beep-thấp"
│ │   [Thêm vào phiếu] [Bỏ qua]             │ │
│ └─────────────────────────────────────────┘ │
│  22 dòng · Tạm tính 2.120.000₫ · CK 0%      │
│ ┌─────────────────────────────────────────┐ │
│ │        HOÀN TẤT PHIẾU  (nút to 56px)    │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Mouseless flow (mục tiêu: 1000 dòng kiểm kê ≤ 15 phút):**
1. Mở phiếu → ô scan tự focus (như Isale `barcodeFocus()` — đã học). Không cần chạm.
2. Quét mã → dòng thêm/cộng dồn tự động, focus quay lại ô scan ngay (`setTimeout(setFocus, 200)`).
3. Bàn phím: `Enter` = xác nhận số lượng đang sửa & về ô scan; `Tab` = sang cột SL; `Esc` = hủy sửa; `F2` = tìm theo tên (fallback khi mã bóp méo); `F4` = xóa dòng đang chọn; `Ctrl+Enter` = hoàn tất phiếu.
4. Số lượng: **giữ nguyên mặc định = 1 mỗi lần quét, quét 20 lần = 20** (chuẩn siêu thị) HOẶC bật chế độ "quét 1 lần nhập tay SL" — config per phiếu.
5. Mã không tồn tại → dialog tạo nhanh SP (tên + đơn vị + cost + tồn đầu = SL đang quét) như Isale `addNewProduct`.

**Feedback & micro-interactions:**
- Quét thành công: beep 1200Hz/80ms + flash nền xanh `#16a34a` 300ms + badge `+1` bay lên.
- Quét mã lạ: beep 400Hz/200ms ×2 + viền đỏ + rung 150ms (navigator.vibrate) + dòng cảnh báo kèm 2 nút.
- Hoàn tất: toast xanh "Đã lưu PN-xxxx" + haptic nhẹ. Mọi nút chính ≥ 56px, spacing ≥ 8px (găng tay).
- High contrast: bảng màu WCAG AAA trên nền sáng — text `#111827`, nền `#FFFFFF`, accent `#1D4ED8`, thành công `#15803D`, lỗi `#B91C1C`; KHÔNG dùng xám nhạt < 4.5:1; cỡ chữ số liệu ≥ 16px, mono cho SL.

**Smart search + tồn kho trong dropdown:** gõ ≥ 2 ký tự → gợi ý tối đa 8 dòng: `Tên · SKU · Barcode` khớp prefix/contains (debounce 250ms, chạy trên danh sách đã cache — C3.1); mỗi gợi ý hiển thị **tồn hiện tại + đơn giá + (HSD gần nhất nếu có batch)**; cột tồn tô đỏ nếu = 0. Trong phiếu chuyển: gợi ý chỉ hiện SP còn tồn ở kho nguồn; nhập SL > tồn → chặn ngay tại chỗ với tooltip "Chỉ còn X".

**Danh sách phiếu:** card lớn (không phải bảng ép mobile): `Mã phiếu · trạng thái (chip màu) · số dòng · tổng tiền · người tạo · thời gian`; filter chip theo trạng thái; pull-refresh; search theo mã/NCC.

### C3. PROMPT 3 — Kiến trúc Frontend (Staff FE)

**C3.1 Virtualization (mục tiêu 50.000 SKU @60FPS):**
- Không thêm dependency: Ionic 8 đã có `ion-virtual-scroll` (deprecated) → dùng **CDK Virtual scrolling? Không — Angular 22 + zoneless**: tự viết windowing ~120 dòng (như report-chart đã zero-dep):
```
// Pseudocode windowing tái sử dụng cho products list & stock-check grid
container.onscroll →
  first = floor(scrollTop / ROW_H) - OVERSCAN      // OVERSCAN = 8
  last  = first + ceil(viewportH / ROW_H) + 2*OVERSCAN
  render items[first..last] với transform: translateY(first*ROW_H)
  spacer height = items.length * ROW_H              // giữ scrollbar thật
```
- Chiến lược dữ liệu: **không load 50k vào DOM model** — SelectProductService giữ `query()` chạy trên `IndexedDB cache` (C3.2) với cursor + chỉ số `by_name/by_sku/by_barcode` (IDBKeyRange), pagination 200 dòng/request Supabase, prepend cache khi offline.
- Hình ảnh SP: lazy `loading="lazy"` + placeholder vuông, tránh layout shift (ROW_H cố định 64px).
- Đo đảm bảo: Chrome DevTools Performance — scroll 50k dòng: < 8ms/frame script, không long task > 50ms.

**C3.2 Offline-First (PWA + IndexedDB):**
- Service Worker (Angular `@angular/pwa` hoặc SW thủ công đã cấu hình sẵn `ngsw`?): cache app-shell + API GET danh mục (products) với stale-while-revalidate.
- **Outbox pattern:** mọi phiếu tạo offline ghi vào IDB `outbox`:
```
{ id: uuid-v4 (chính là Idempotency-Key), type: 'received_note'|'transfer'|'stock_count',
  payload: {...}, created_at, tries: 0, status: 'pending'|'syncing'|'done'|'conflict' }
```
- UI hiển thị chip "Chưa đồng bộ (n)" ở danh sách phiếu; nút "Sync ngay". `navigator.onLine` + `online` event → drain outbox: POST lần lượt kèm header `Idempotency-Key: uuid`. Server trả 409 conflict (trùng key, khác nội dung) → đánh dấu `conflict`, mở dialog so sánh cho user chọn.
- Barcode scan hoạt động offline hoàn toàn (product cache trong IDB); tạo SP mới offline → id client-side (uuid), sync dùng `ON CONFLICT DO NOTHING` theo id.
- Giới hạn ghi rõ cho user: offline chỉ tạo/sửa **phiếu nháp**; duyệt/hoàn tất phiếu (ghi ledger) yêu cầu online → tránh xung đột nghiệp vụ.

**C3.3 Optimistic UI + Rollback:**
```
async completeCount(id) {
  const prev = this.sig();                     // snapshot state
  this.sig.set({...prev, status:'completed'}); // 1. vẽ ngay
  toast('Đang ghi sổ…'); haptic();
  try { const row = await api.complete(id);
        this.sig.set(map(row)); toast('Đã lưu ✓','success'); }
  catch(e){ this.sig.set(prev);                // 2. rollback
            toast('Lỗi lưu — đã hoàn tác','danger'); this.retryQueue.push(id); }
}
```
- Nguyên tắc: chỉ optimistic với hành vi **idempotent & quan sát được sau đó** (hoàn tất phiếu, hủy); KHÔNG optimistic với lệnh duyệt ghi ledger nhiều bảng → dùng loading chặn double-click + disable nút (`saveDisabled` — Isale làm đúng, giữ nguyên pattern).

**C3.4 Multi-tab sync (BroadcastChannel):**
```
const bc = new BroadcastChannel('piopio-inventory');
// Tab A lưu phiếu xong:
bc.postMessage({type:'note-updated', table:'received_notes', id, ts});
// Tab B (đang mở trang sản phẩm):
bc.onmessage = (e) => e.data.type==='note-updated' && this.reloadBadge();
// Tab "chết" giữ phiếu draft cũ: khi sync, server trả version mới hơn → 409 → cả 2 tab nhận {type:'conflict', id} và cùng refresh.
```
- Kèm `storage` event fallback (Safari cũ). Mỗi phiếu đang mở đăng ký heartbeat: nếu phiếu đang được mở ở tab khác (same id trong 30s) → banner "Phiếu đang mở ở tab khác — chỉ tab mới nhất được lưu".

### C4. PROMPT 4 — Backend & Concurrency (Principal Architect)

**C4.1 Double-Entry Inventory Ledger (migration v27 — thiết kế):**
```sql
create table inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  product_id uuid not null references products(id),
  store_id uuid references stores(id),            -- null = kho chính (tương thích hiện tại)
  qty int not null,                                -- + nhập/nhận/hoàn, − xuất/mất
  ref_type text not null check (ref_type in
    ('received_note','transfer_out','transfer_in','transfer_loss',
     'stock_count','sale','sale_return','manual_adjust')),
  ref_id uuid not null,                            -- id phiếu nguồn (bất biến)
  ref_code text,
  batch_id uuid references inventory_batches(id),  -- nullable
  cost numeric(14,2),                              -- cost tại thời điểm giao dịch (snapshot!)
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
  -- KHÔNG update/delete: chỉ insert; đảo = dòng ngược dấu ref_type='reversal'
);
create index on inventory_ledger (shop_id, product_id, created_at desc);
create index on inventory_ledger (ref_type, ref_id);
-- Tồn = Σ qty; cache:
alter table products add column if not exists stock_cached numeric(14,3);
-- Trigger ghi ledger tự cập nhật stock_cached (xem C4.2)
```
- Bán hàng trừ kho: POS tạo order → trigger/RPC ghi `ledger(sale, −qty)` — **lấp lỗ hổng lớn nhất hiện tại**. Chỉnh `order_items` → thêm cột qty đã xuất? PioPio order không có hoàn trả hàng trong POS nên đơn completed = xuất đủ; đơn hủy không trừ.

**C4.2 Concurrency — chặn âm kho & mất cập nhật:**
- **Nguyên tắc: ghi tồn CHỈ qua 1 RPC Postgres** (không client update products bao giờ):
```sql
create or replace function inventory_apply(p_ref_type text, p_ref_id uuid,
  p_items jsonb, p_store_id uuid default null)   -- items: [{product_id, qty, cost?, batch_no?, expiry?}]
returns void language plpgsql as $$
declare r record;
begin
  if not is_shop_member(current_setting('request.jwt.claims', true)::json->>'shop_id') then
    raise exception 'FORBIDDEN'; end if;
  -- Idempotency: ref đã tồn tại → no-op (trả về thành công)
  if exists (select 1 from inventory_ledger where ref_type=p_ref_type and ref_id=p_ref_id) then return; end if;
  foreach r in array p_items loop
    -- Khóa dòng SP theo thứ tự product_id để tránh deadlock
    perform 1 from products where id = (r->>'product_id')::uuid for update;
    if p_ref_type not in ('received_note','transfer_in','stock_count','manual_adjust') then
      -- luồng TRỪ: kiểm không cho âm
      if coalesce((select sum(qty) from inventory_ledger
                   where product_id=(r->>'product_id')::uuid
                     and store_id is not distinct from p_store_id),0)
         + (r->>'qty')::int < 0 then
        raise exception 'INSUFFICIENT_STOCK:%', r->>'product_id';
      end if;
    end if;
    insert into inventory_ledger(...) values (...);
    update products set stock_cached = stock_cached + (r->>'qty')::int where id=...;
  end loop;
end $$;
```
- Với cơ chế `FOR UPDATE` **có thứ tự (sort product_id)** + mọi luồng đi qua 1 hàm → không deadlock (thứ tự khóa nhất quán), không lost-update (không read-modify-write ứng dụng), không âm kho (check trong cùng transaction).
- Optimistic lock phòng thủ thêm: `products.version int default 1` — RPC `+ where version = cũ` nếu tương lai cần update trực tiếp (hiện không cần).

**C4.3 "Distributed lock" cho chuyển kho:**
- Không cần Redis: 1 phiếu = 1 row; trạng thái trên row là lock tự nhiên:
  - `update transfers set status='in_transit' where id=$1 and status='draft' returning id` — 0 row → ai đó đã chốt → trả "phiếu đã được xử lý" (CAS — compare-and-set).
  - Nhận hàng: `... where id=$1 and status='in_transit'` — tương tự. Server crash giữa chừng: transaction chưa commit → toàn bộ rollback, phiếu vẫn in_transit là *đúng hiện thực* (hàng vẫn đang đi trên thực tế).
  - Hai người nhận cùng lúc: CAS chỉ cho 1 người thắng; người kia nhận 0 row → UI reload thấy trạng thái mới.
- Toàn vẹn 2 leg: `transfer_out` và `transfer_in` cùng `ref_id` = transfer id; view đối soát `qty_sent` vs Σ ledger_in để phát hiện leg thiếu.

**C4.4 Idempotency:**
- Client sinh `Idempotency-Key` (uuid v4) lúc mở form (không phải lúc bấm lưu) — double-click, retry mạng, offline sync đều dùng chung 1 key.
- RPC nhận `p_idem_key`, bảng `idem_keys(key uuid pk, ref_type, ref_id, created_at)`: trùng key → trả kết quả lần đầu (không tạo phiếu thứ 2). received_notes/transfers thêm cột `idem_key uuid unique` — chặn trùng ngay tầng schema.

**C4.5 Cycle count không sai số khi đang bán (re-base):**
- Tạo phiếu: snapshot `system_qty` vào items (giữ nguyên như hiện tại).
- Complete (RPC): tính `current_qty = Σ ledger(product, từ trước đến now)`; `diff = counted − current_qty` (KHÔNG dùng snapshot cũ); ghi ledger `stock_count` với qty = diff. → Bán hàng giữa lúc đếm không làm sai kết quả.

**C4.6 Schema v27 tổng hợp (dự thảo — chờ duyệt mới làm):**
- `stores` đã có (v24). Thêm: `inventory_ledger`, `inventory_batches`, `inventory_serials`, `suppliers`, `supplier_debts`, `transfer_losses`; cột mới: `received_notes(status, supplier_id, qty_mode, paid_amount, due_date, approved_by/at, created_by, idem_key)`, `transfers(status, from_store, to_store, reason, approved_by/at, created_by, idem_key, items.items[].qty_sent/qty_received)`, `stock_counts(blind bool, scope jsonb, approved_by/at, created_by, rebase_at)`; `profiles` + quyền `inventory_approve`; view `v_stock_in_transit`, `v_stock_by_batch`, `v_supplier_debts_aging`; bảng `inventory_audit` (C5.4).
- Tương thích ngược: service cũ vẫn đọc được (`status` default 'completed' cho phiếu cũ, `stock_cached` backfill 1 lần = `products.stock`).

### C5. PROMPT 5 — QA / Security (Lead DevSecOps)

**C5.1 Penetration test — kịch bản thao túng logic (mỗi dòng = 1 test case bắt buộc PASS trước release):**
| # | Kịch bản | Kỳ vọng |
|---|---|---|
| P1 | POST `/rest/v1/received_notes` với `total: -1000000` | 400/trigger chặn âm tiền |
| P2 | Đổi `shop_id` của phiếu sang shop khác khi update | 403 (RLS with check) |
| P3 | Gọi `inventory_apply` với items chứa `product_id` của shop khác | exception FORBIDDEN/NOT_FOUND |
| P4 | 2 request song song cùng Idempotency-Key | 1 phiếu, 1 ledger-set (đếm ledger = 1×) |
| P5 | RPC trừ kho với qty > tồn | exception INSUFFICIENT_STOCK, ledger không đổi |
| P6 | Maker gọi RPC approve phiếu của chính mình (mặc định tách nhiệm vụ bật) | 403 |
| P7 | Sửa `stock_counts` đã completed | 403 + audit log ghi attempt |
| P8 | Transfer nhận `qty_received > qty_sent` | chặn (400) |
| P9 | SQL injection qua `code/note/batch_no` (PostgREST param) | vô hại — parameterized; kiểm tra output encode |
| P10 | Hủy phiếu nhập đã approved rồi xem tồn | tồn hoàn đúng (reversal), công nợ hoàn |
| P11 | Đọc `/rest/v1/inventory_ledger` không token / token shop khác | 0 dòng (RLS select) |
| P12 | Gọi RPC report/export với shop lạ | 0 dòng (guard is_shop_member — chuẩn v26) |

**C5.2 RBAC & Tenant Isolation:**
- Mọi bảng mới: RLS `is_shop_member(shop_id)`; RPC: guard đầu hàm (chuẩn đã đặt ở v26: `_report_assert_member` → đặt `_inv_assert_member` tương tự, định nghĩa TRƯỚC hàm language sql).
- Ma trận quyền: `inventory_view / inventory_edit (Maker) / inventory_approve (Checker) / inventory_cost_view` — **cost chỉ Checker+chủ shop thấy** (NV kho không cần biết giá vốn — tương đương `blockViewingQuantity` của Isale, mở rộng: toggle ẩn tồn theo vai trò).
- Test isolate tự động: 2 JWT 2 shop, chéo gọi mọi endpoint → đều rỗng/403 (script k6 + assert).

**C5.3 Load/Stress (k6):**
- Kịch bản "23h59 ngày 31": 1.000 shop × 5 user, mỗi user chốt 1 kiểm kê 200 dòng trong 60s → 100k ledger-insert/phút đỉnh. Tiêu chí: p95 < 800ms, 0 deadlock (thiết kế khóa có thứ tự phải 0), 0 âm kho.
- Deadlock phòng: (đã nêu) sort theo product_id trước `FOR UPDATE`; retry client backoff 100/300/900ms nếu 40P01.
- Connection pool: Supabase pooler (pgbouncer transaction mode) — RPC ngắn, không giữ transaction qua network round-trip.

**C5.4 Audit trail (bảng `inventory_audit`):**
```sql
create table inventory_audit (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null, table_name text not null, record_id uuid not null,
  action text not null check (action in ('create','update','status_change','delete','approve','cancel','adjust')),
  actor_id uuid, actor_label text,
  ip inet, user_agent text,
  before jsonb, after jsonb,          -- snapshot trước/sau toàn bộ row (items jsonb included)
  created_at timestamptz not null default now());
-- append-only: revoke update/delete; chỉ insert qua trigger + RPC có chủ đích
```
- Trigger trên 3 bảng phiếu + products (khi stock/cost đổi ngoài ledger → ghi cảnh báo `manual_adjust`).
- UI: trang "Lịch sử thay đổi" per-phiếu (route `/inventory-history/:table/:id` — đối ứng `/change-history/{table}/{id}` của Isale), hiển thị ai/when/IP, diff màu xanh/đỏ cho field đổi.
- Xóa/hủy phiếu completed: bắt buộc nhập lý do → lưu trong audit; giữ row (soft: status cancelled) — không hard-delete.

---

## PHẦN D — ĐÁNH GIÁ & KẾ HOẠCH TRIỂN KHAI PIOPIO

### D1. Chấm Isale (bằng chứng ở Phần A)
- ✅ Kiến trúc server-authoritative đúng chuẩn: client chỉ POST phiếu, server ghi tồn (đối chiếu C4 — PioPio cần học).
- ✅ Đa kho + ví theo kho + thu/chi 2 chiều idempotent cho transfer (hiếm ERP nội địa làm đúng).
- ✅ Audit trail dựng sẵn, Excel template/import/export, phân quyền ẩn tồn theo NV.
- ⚠️ Đối soát xuất/nhập chuyển kho có dữ liệu nhưng **không có workflow chênh lệch** (không lý do, không truy trách).
- ❌ Thiếu hoàn toàn: batch/HSD theo dòng phiếu, serial tracking thật, partial receipt, in-transit state, blind/cycle count, maker-checker.

### D2. Gap PioPio → mục tiêu (ưu tiên theo rủi ro tiền/tài sản)
| # | Gap | Mức độ |
|---|---|---|
| 1 | POS không trừ tồn | 🔴 nghiêm trọng nhất |
| 2 | Client-side read-modify-write stock (3 module) + nuốt lỗi | 🔴 |
| 3 | Không công nợ NCC (supplier_name text, paid bool) | 🟠 |
| 4 | Transfer destination text — không in-transit, không nhận/đối soát | 🟠 |
| 5 | Không maker-checker, không audit before/after | 🟠 |
| 6 | Không batch/HSD/serial | 🟡 (theo ngành hàng) |
| 7 | UX: chưa barcode-first, chưa offline, chưa virtualization | 🟡 |

### D3. Kế hoạch phân kỳ (đề xuất)
- **P0 — Nền móng toàn vẹn (v27):** `inventory_ledger` + RPC `inventory_apply` (idempotent, FOR UPDATE có thứ tự, chặn âm) + trigger `stock_cached` + **POS trừ tồn qua ledger** + nhận notes nhận tồn qua RPC (thay loop client) + RLS/guard chuẩn v26 + `inventory_audit` + audit trail UI tối giản. *Xóa nợ kỹ thuật #1, #2.*
- **P1 — Quy trình & tiền:** `suppliers` + `supplier_debts` (AP, hạn thanh toán, aging view) + trạng thái phiếu (draft/pending/approved/partial/completed/cancelled) + maker-checker + partial receipt + transfer in_transit/receive/discrepancy (`transfer_losses`) + trang "Hàng đang đi" + danh sách "Chờ nhập thêm".
- **P2 — Kiểm kê nâng cao + UX tốc độ:** blind count + cycle count ABC + re-base complete + màn nhận hàng quét barcode (sound/haptic/high-contrast) + keyboard flow + windowing list + optimistic UI + BroadcastChannel.
- **P3 — Nâng cao:** batch/HSD FEFO + serial + multi-unit (units/exchange) + Excel template/import (đối ứng Isale) + offline outbox PWA đầy đủ + store ví riêng cho transfer payment.
- Mỗi phase = 1 migration + smoke test riêng (port tiếp theo: 8352) + deploy CLI Vercel.

### D4. Câu hỏi chốt với chủ shop (trước khi làm P0/P1)
1. Có chạy **đa kho thật** ngay không, hay giữ 1 kho (mọi thiết kế đều sẵn sàng, chỉ bật UI khi cần)?
2. Batch/HSD + Serial: ngành hàng có cần không (thực phẩm/điện máy)? → quyết định P3 có kéo lên sớm không.
3. Maker-checker: bật chế độ tách nhiệm vụ (NV tạo — chủ duyệt) mặc định?
4. POS trừ tồn: đơn nào được trừ — ngay khi tạo (pending) hay khi chuyển `completed`?

---

## PHỤ LỤC — BẰNG CHỨNG
- `shots/wh01-nhap-list.png` — danh sách phiếu nhập (#/received-note) + segment tháng
- `shots/wh04-nhap-aug.png` — sau khi đổi tháng 08/2026 (captured: `listequal received_note dateRange 2026-08-01→31`)
- `shots/wh05-nhap-form.png` — form tạo phiếu nhập (quét mã vạch, NCC, ví/tài khoản, chiết khấu %)
- `shots/wh06-chuyen-form.png` — form tạo phiếu chuyển (chọn kho gửi/nhận, giao dịch thanh toán)
- `shots/wh07-kiemke-form.png` — form tạo kiểm kê (quét mã vạch, thêm SP mới từ barcode)
- Chunk decompiled: `main.js` (ApiService + ReceivedNoteService + TransferNoteService + excelService + routes), `wh-159` (Contact/MoneyAccount/Product/Order model), `wh-4307` (TransferNote pages — actualExport/actualImport/2-leg transactions), `wh-5716` (StockCheck pages — save flow), `wh-8048` (ReceivedNote pages — action sheet add-debt/change-history), `wh-8408` (received-note-add + statusMaps schema động).
