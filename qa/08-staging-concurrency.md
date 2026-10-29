# Staging concurrency gate

Bài test này mở **hai Supabase client HTTPS độc lập**, đăng nhập cùng tài khoản QA,
gửi đồng thời cùng một `idempotency_key`, rồi xác minh database chỉ có một đơn,
một dòng hàng và metadata đơn vị đúng. Đơn QA được xóa trong `finally`.

## Điều kiện bắt buộc

- Một Supabase project staging riêng, đã áp migration đến v48.
- Tuyệt đối không dùng URL project production. Script tự so sánh và từ chối URL production.
- Một tài khoản QA có quyền `sell` tại một shop staging.
- GitHub Environment tên `staging` với năm secret:
  `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_TEST_EMAIL`,
  `STAGING_TEST_PASSWORD`, `STAGING_SHOP_ID`.

Chạy workflow **Staging Concurrency** bằng `workflow_dispatch`. Chỉ một run màu xanh
mới là bằng chứng đã kiểm thử nhiều kết nối thật; test PostgreSQL local không thay thế
được bằng chứng này.
