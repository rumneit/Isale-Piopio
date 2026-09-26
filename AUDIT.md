# Audit Playwright — Piopio (ISale)

Bộ công cụ audit tự động toàn bộ route của app bằng Playwright (headless Chromium).
Chạy **local**, không tự push.

## Yêu cầu

- Node.js LTS (đã cài: `C:\Users\Administrator\AppData\Local\Programs\nodejs`)
- Đã `npm install` và `npx playwright install chromium`

## Cách chạy

```powershell
npm install
npm run build              # sinh ra www/
node audit.mjs             # audit toan bo route
```

Kết quả ghi vào `audit-output/` (đã được `.gitignore`, không bị push):

- `audit-report.md` — báo cáo dạng đọc được
- `audit-report.json` — dữ liệu chi tiết theo từng route

Script trả **exit code 1** nếu có route FAIL (dùng được trong CI).

## Script audit.mjs làm gì

1. Dựng static server phục vụ `www/` có SPA fallback về `index.html`.
2. Giả lập đăng nhập bằng session Supabase trong `localStorage`
   (`sb-ndsrwpsdqmsbclverbpm-auth-token`), cùng pattern với các `test-*.mjs` có sẵn.
3. Đi qua lần lượt tất cả route trong `app.routes.ts` (52 route) và ghi lại:
   - tiêu đề trang, độ dài nội dung, số phần tử tương tác
   - lỗi console (`error`), `pageerror`, request thất bại
   - có bị đẩy về `/login` hay không
4. Mở menu và liệt kê toàn bộ mục menu.

### Chờ render đúng cách

Lưu ý kỹ thuật quan trọng: **`ion-page` luôn có `display: inline` và
`getBoundingClientRect()` trả về `0x0`, kể cả khi trang đang hiển thị.**
Vì vậy không thể dùng `rect.width > 0` hay `display !== 'none'` để xác định
trang nào đang mở.

Cách đúng đang dùng trong script:

- `page.goto(..., { waitUntil: 'domcontentloaded' })`
  — **không** dùng `'commit'`, vì `commit` trả về trước khi Angular tạo
  `ion-router-outlet`, khiến `waitForSelector` timeout.
- Đợi `ion-router-outlet` với `{ state: 'attached' }`
  — **không** dùng mặc định (visible), vì Ionic render element với kích thước 0
  nên `waitForSelector` sẽ timeout dù element đã tồn tại.
- Đợi nội dung text của phần tử `.ion-page` cuối cùng ổn định qua 2 lần đo liên tiếp.

Xác định trang đang mở bằng **phần tử `.ion-page` cuối cùng** trong
`ion-router-outlet` (phần tử này nằm trên cùng trong DOM).

## Hạn chế cần biết

Audit dùng **JWT giả**, nên mọi truy vấn Supabase đều trả **401**.
Hệ quả:

- Audit kiểm tra được: **routing, render giao diện, xử lý lỗi, menu**.
- Audit **KHÔNG** kiểm tra được: **luồng dữ liệu thật** (đọc/ghi Supabase),
  nội dung bảng biểu, RLS.
- Các lỗi `401` xuất hiện trong báo cáo là **do token giả**, không phải bug app.
  Các service đều bắt lỗi và rơi về danh sách rỗng, nên UI vẫn hiển thị bình thường.

Muốn audit cả dữ liệu thật thì cần một tài khoản test thật trong Supabase
và thay session giả bằng session thật (đăng nhập qua form `/login`).
