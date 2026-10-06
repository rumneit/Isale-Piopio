# Audit và triển khai 5 công cụ khách hàng

Ngày khảo sát: 07/10/2026 (Asia/Ho_Chi_Minh)

## Phạm vi và mức độ bằng chứng

Phân loại dùng trong tài liệu:

- **Đã quan sát**: thao tác trực tiếp trên UI iSale bằng tài khoản đang có trong trình duyệt.
- **Đã xác minh frontend**: đối chiếu bundle JavaScript công khai do trang iSale gửi tới trình duyệt.
- **Đã xác minh PioPio**: mã nguồn, build hoặc test trong repository này.
- **Suy luận**: hành vi hợp lý nhưng không có bằng chứng trực tiếp từ backend iSale.
- **Chưa thể xác minh**: cần quyền, dữ liệu hoặc môi trường chưa được cung cấp.

Không có quyền truy cập mã nguồn, cơ sở dữ liệu hoặc log server của iSale. Vì vậy tài liệu này **không tuyên bố audit backend nội bộ iSale**. Không tải hoặc sao chép dữ liệu khách hàng mẫu; thao tác xuất dữ liệu trên iSale không được thực hiện để tránh thu thập PII.

## Hiện trạng ban đầu của PioPio

- Angular 22 standalone + Ionic 9, hash routing, RxJS signals và Supabase.
- Auth guard + permission guard; dữ liệu theo `shop_id`, bảo vệ bằng RLS và `is_shop_member`.
- Đã có khách hàng/CRM 360, `xlsx`, private storage và soft delete.
- Ghi chú cũ chỉ có văn bản; không gắn khách/ảnh.
- Nhập khách trên Trang chủ đi nhầm vào trình nhập dữ liệu chung; nhập danh bạ và lọc trùng đi vào màn hình placeholder.
- Xuất khách chỉ xuất CSV của trang đang nhìn, không phải toàn bộ phạm vi.
- Lọc trùng cũ xóa từng khách, không chuyển dữ liệu liên quan và không có transaction.

## Bản đồ thao tác và bằng chứng iSale

### 1. Ghi chú - Ảnh

**Đã quan sát** tại `#/app/note` và `#/note/new`:

- Danh sách có tiêu đề “Ghi chú - Ảnh”, tab “Thường xuyên / VIP / Gần đây”, tìm kiếm, tổng số và nút thêm nổi.
- Màn hình thêm có “BỎ QUA / Thêm ghi chú / LƯU”, chọn khách hàng, công tắc VIP/Thường xuyên, tab “Nội dung / Ảnh”.
- Placeholder nội dung là “Nhập nội dung”; tab ảnh có “THÊM ẢNH”.

Không có dữ liệu mẫu phù hợp để xác minh sửa/xóa ảnh, retry upload, giới hạn file hay quyền URL. Các mục đó là **chưa thể xác minh trên iSale**.

### 2. Nhập khách Excel

**Đã quan sát** tại `#/contact/import`:

- Tiêu đề “Nhập khách hàng từ file Excel”.
- Có “TẢI MẪU EXCEL” và “UPLOAD FILE KHÁCH HÀNG”.
- Hướng dẫn nêu “Họ tên” bắt buộc và mã khách hàng phải duy nhất.

**Đã quan sát** luồng import tổng quát tại `#/table-import` từ toolbar khách hàng:

- Hàng đầu là tiêu đề, dữ liệu từ hàng 2; tự nhận diện tên hiển thị/tên trường.
- Cho chọn trường kiểm tra trùng, điều kiện trùng OR và nút “BẮT ĐẦU NHẬP”.

Không upload dữ liệu thật lên iSale nên response, rollback/partial import và idempotency của iSale là **chưa thể xác minh**.

### 3. Xuất khách Excel

**Đã quan sát** toolbar danh sách `#/contact` có nút xuất và phân trang. **Đã xác minh frontend**: thẻ Trang chủ “Xuất khách Excel” chỉ điều hướng tới `/contact`; thao tác xuất thực tế bắt đầu từ danh sách.

Không bấm xuất vì danh sách chứa PII; tên file/sheet, cột, phạm vi toàn bộ hay trang hiện tại và response tải xuống là **chưa thể xác minh**.

### 4. Nhập danh bạ

**Đã xác minh frontend**: thẻ Trang chủ điều hướng `/contact`; thẻ bị ẩn trên iOS. Bundle công khai có quyền Android `READ_CONTACTS`, là dấu hiệu của tích hợp native Android, không phải bằng chứng trình duyệt web được đọc toàn bộ danh bạ.

Luồng xin quyền native, từ chối và nhiều số điện thoại là **chưa thể xác minh** vì phiên web hiện tại không có bridge native.

### 5. Lọc khách trùng

**Đã quan sát** tại `#/contact/filter-duplicate`:

- Ba tab “Theo email / Theo phone / Theo tên”.
- Có tìm/lọc, tổng số, chọn và xóa; trạng thái rỗng hướng dẫn nhập từ lịch sử cuộc gọi/danh bạ.
- Không có nhóm trùng trong dữ liệu đang xem nên UI chọn bản chính/hợp nhất không quan sát được.

Việc iSale có transaction hợp nhất và bảo toàn dữ liệu liên quan là **chưa thể xác minh**. UI quan sát được thiên về chọn/xóa, không đủ bằng chứng để khẳng định có merge.

## Bảng đối chiếu và cách xử lý

| Hạng mục | Bằng chứng mẫu | Hiện trạng cũ | Triển khai | Tiêu chí nghiệm thu |
|---|---|---|---|---|
| Ghi chú ảnh | Danh sách 3 tab; editor 2 tab; khách/VIP/thường xuyên | Chỉ text | `NotesPage`, `NotesService`, private bucket, signed URL, preview/xóa/sửa, bù trừ khi upload lỗi | Text hoặc ảnh lưu được; ảnh cũ không mất nếu upload mới lỗi; tenant khác không đọc URL |
| Nhập Excel | Template/upload; mapping + duplicate selector ở import tổng quát | CSV/text, sai route | Multi-sheet, dò header, mapping, preview, lỗi theo dòng, skip/update, RPC idempotent, tối đa 2.000 dòng | Retry cùng key không nhập lặp; Unicode/ngày/SĐT 0 đầu đúng; báo cáo created/updated/skipped/failed |
| Xuất Excel | Toolbar khách hàng | CSV trang hiện tại | Xuất toàn bộ/lọc/dòng chọn; chọn và sắp cột; `.xlsx`; chống formula injection | Tổng dòng đúng phạm vi; SĐT là text; dữ liệu `=+-@` không chạy công thức |
| Nhập danh bạ | Điều hướng danh sách; dấu hiệu Android native; ẩn iOS | Placeholder | Web Contact Picker khi hỗ trợ + VCF fallback; explicit selection; chọn SĐT chính | Không lưu trước xác nhận; từ chối/hủy không ghi dữ liệu; unsupported có fallback |
| Lọc trùng | Tab email/phone/tên; chọn/xóa | Client scan + xóa rời rạc | Tab tương ứng; chọn primary; RPC transaction; concurrency check; soft delete; re-parent dữ liệu | Không xóa chỉ vì trùng tên; conflict rollback; order/note/image/debt/history còn liên kết primary |

## Khác biệt có chủ đích so với mẫu

- PioPio không tự xóa khách trùng tên. Tên chỉ tạo nhóm khi còn trùng email hoặc địa chỉ; mọi merge đều cần người dùng chọn bản chính và xác nhận.
- PioPio dùng private bucket + signed URL 5 phút cho ảnh ghi chú.
- Import là **partial import có kiểm soát**: dòng hợp lệ được ghi, dòng lỗi được trả về theo số dòng. Client chặn import nếu đã phát hiện lỗi trước khi gửi.
- Contact Picker chỉ dùng khi trình duyệt/thiết bị hỗ trợ và chỉ nhận liên hệ do người dùng chọn. VCF là fallback; một khách lưu một SĐT chính, người dùng chọn khi danh bạ có nhiều số.

## Backend và bảo mật

Migration `supabase-migration-v33-customer-tools.sql`:

- `note_images`, bucket `note-images` private, RLS tenant, MIME/8 MB, trigger tối đa 10 ảnh và kiểm tra note/shop.
- `customer_import_jobs` + idempotency key/advisory lock.
- `crm_import_customers`: quyền shop, tối đa 2.000 dòng, validation qua trigger, chuẩn hóa `+84/0`, skip/update, lỗi từng dòng.
- `crm_merge_customers`: khóa hàng, optimistic concurrency (`updated_at`), chuyển order/return/deal/interaction/debt/file/note, cộng công nợ, soft delete và audit interaction trong một transaction.
- Export vô hiệu hóa chuỗi có thể kích hoạt công thức bảng tính.

Migration v33 phải chạy **sau v31 và v32**. Chưa tự chạy trên Supabase production vì thao tác DB production cần chủ hệ thống thực hiện/kiểm soát.

## Kiểm thử

Đã chạy trên Node 22.23.3:

- `npm test -- --watch=false`: **42/42 đạt** tại thời điểm hoàn tất chức năng; test bao phủ mapping, Unicode/SĐT, lỗi dòng, trùng trong file, vCard nhiều số và duplicate email/phone/name.
- `npm run build`: **đạt**; còn warning có sẵn về import Ionic không dùng, browser cũ và CSS budget ở màn hình ngoài phạm vi.
- `npm audit --omit=dev`: **0 lỗ hổng production** sau khi nâng Angular đồng bộ 22.2.1.
- `npm run lint`: phần mới sạch sau sửa; repository vẫn còn 10 lỗi lint + 1 warning có sẵn ở debt/product/shipment/fab, ngoài phạm vi 5 công cụ.

## Checklist nghiệm thu

| Kiểm tra | Trạng thái | Bằng chứng/Giới hạn |
|---|---|---|
| Route 5 chức năng và build production | Đạt | Angular build |
| Unit test logic import/dedup/vCard | Đạt | Test suite |
| Tenant RLS và private ảnh trong migration | Đạt (mã nguồn) | Chưa chạy trên DB production |
| Idempotency import và atomic merge | Đạt (mã nguồn) | Cần integration test sau khi chạy migration |
| Công thức độc hại khi export | Đạt | `safeSpreadsheetCell` |
| Keyboard labels/responsive cơ bản | Đạt (mã nguồn/build) | Chưa audit bằng screen reader thật |
| E2E ghi dữ liệu trên Supabase staging | Chưa thể xác minh | Chưa có staging/test credentials và migration chưa áp dụng |
| So sánh pixel bằng ảnh ở nhiều viewport | Chưa thể xác minh đầy đủ | Đã quan sát desktop mẫu; không có phiên mẫu native/mobile |
| Backend nội bộ iSale | Chưa thể xác minh | Không có quyền backend/log/API nội bộ |
| Export iSale chứa dữ liệu thật | Chưa thể xác minh có chủ đích | Không tải PII từ mẫu |

Giới hạn còn lại của bản triển khai: upload ảnh có thể thử lại sau lỗi nhưng Supabase SDK hiện không cung cấp nút hủy giữa một request đang chạy; E2E thiết bị cho Contact Picker vẫn cần Android/Chrome tương thích. Đây không được đánh dấu là hoàn tất.

## Chạy và triển khai

```bash
npm ci
npm test -- --watch=false
npm run build
```

Trong Supabase SQL Editor, chạy lần lượt migration v31, v32 (nếu chưa chạy), sau đó `supabase-migration-v33-customer-tools.sql`. Sau migration cần smoke test bằng một shop thử: tạo ghi chú ảnh, import file 2–3 dòng, export lại và merge hai khách thử trước khi dùng với dữ liệu production.
