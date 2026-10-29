# Staging rebuild evidence

Ngày chạy: 2026-10-29 (Asia/Ho_Chi_Minh)

- Project staging: `PioPio Staging` (`rebuypbmuljyuscojiam`), Supabase Free.
- Điểm bắt đầu: database mới, không có bảng/migration ứng dụng.
- Công cụ: Supabase CLI `db push --include-all` qua session pooler.
- Kết quả: 49 migration từ schema gốc đến v48 chạy liên tục, exit code 0.
- Probe nghiệp vụ: tạo tài khoản/shop QA riêng, hai client HTTPS authenticated
  gọi đồng thời `inv_create_order_v48` với cùng nonce.
- Kết quả: cùng order ID, đúng 1 order, đúng 1 order_item, metadata đơn vị đúng;
  đơn QA được dọn bằng `inv_delete_order`.

Đây là **schema rebuild drill**, chứng minh repository có thể dựng một môi trường
mới. Đây không phải data restore drill từ backup production; người vận hành vẫn
phải chạy bài phục hồi file backup riêng và đối soát số dòng/checksum trước khi
tuyên bố RPO/RTO.
