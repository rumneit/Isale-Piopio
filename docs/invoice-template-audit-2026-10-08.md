# Audit Template hóa đơn iSale — 2026-10-08

## Phạm vi đã quan sát

- Điểm vào: Cấu hình shop → Template hóa đơn.
- Hai mẫu độc lập: `Hóa đơn khổ lớn` (`order-invoice.hbs`) và `Bill (khổ nhỏ)` (`order-receipt.hbs`).
- Hai chế độ: Soạn thảo Handlebars và Xem trước bằng dữ liệu shop thật cùng dòng sản phẩm mẫu.
- Thao tác quan sát được: upload HTML/HBS, tải mẫu, dùng lại mẫu mặc định, làm mới preview và lưu template.
- Trạng thái quan sát được: mẫu mặc định, nút lưu bị vô hiệu khi chưa thay đổi, preview A4 và preview bill hẹp.
- Nhóm biến trợ giúp: Shop, Đơn hàng, Sản phẩm, QR/Nhãn và biến riêng cho Bill.

Không có quyền xem backend nội bộ iSale; phần backend dưới đây là triển khai tương đương dựa trên hợp đồng giao diện quan sát được.

## Đối chiếu và triển khai

| Hạng mục | iSale quan sát được | PioPio trước sửa | Sau sửa |
|---|---|---|---|
| Loại mẫu | Khổ lớn + bill nhỏ | Một mẫu khổ lớn | Hai mẫu độc lập |
| Soạn thảo | Editor tối, tên file, upload/download/reset | Textarea cơ bản | Editor và hành vi tương ứng |
| Preview | Render template thật | Mock cố định | Handlebars render trong iframe sandbox |
| Trạng thái | Mặc định/tùy chỉnh, dirty-save | Không có | Có trạng thái và lưu theo từng mẫu |
| In đơn | Dùng mẫu đã cấu hình | HTML hardcode | Dùng template đã lưu theo lựa chọn khổ in |
| An toàn | Chưa thể xác minh backend | Không validation template | Giới hạn 200 KB, kiểm tra cú pháp, chặn HTML thực thi, sanitize lần hai, RLS owner từ V36 và trigger V37 |

## Giới hạn xác minh

- Không khẳng định sao chép backend hay source code nội bộ của iSale.
- Preview và in sử dụng dữ liệu/mô hình hiện có của PioPio; các trường chưa tồn tại trong schema (ví dụ chiết khấu từng dòng hoặc đơn vị trên order item) được để trống thay vì tạo dữ liệu giả.
- Cần chạy migration V37 để có validation phía PostgreSQL; frontend vẫn hoạt động với bảng `settings` sau V36 nhưng chưa có lớp bảo vệ kích thước/nội dung ở DB nếu bỏ qua V37.
