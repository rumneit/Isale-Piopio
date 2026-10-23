# RUNBOOK — UAT trên dữ liệu thật (sau v43)

Mục tiêu: chứng minh trên **DB production** rằng tiền – tồn – công nợ khớp sau các thay đổi v43/v44,
và lấy bằng chứng để chuyển GO. Mọi bước dưới đây chạy trên **staging** trước, production sau.

## 0. Điều kiện vào

- [ ] Đã backup/PITR còn hiệu lực (chụp màn hình ngày giờ + điểm khôi phục).
- [ ] Đã chạy v43 (đã xác nhận bằng `node qa/probe-live.mjs`: 4/4 RPC v43 = APPLIED).
- [ ] Đã chạy **v44** `supabase-migration-v44-return-debt-staff.sql` trong SQL Editor.
- [ ] `node qa/probe-live.mjs` → tất cả dòng **APPLIED** (8/8).
- [ ] Frontend mới đã deploy (`www/` từ commit hiện tại).

## 1. Xác nhận schema v44

Trong SQL Editor:

```sql
select id, applied_at from public.piopio_migrations
 where id in ('v41_order_debt_backfill','v44_return_debt_credit','v44_return_debt_staff');

select column_name, data_type, column_default
  from information_schema.columns
 where table_schema='public' and table_name='return_notes'
   and column_name in ('cash_refund','debt_credit');

select p.proname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and p.proname in ('inv_add_shop_member','inv_remove_shop_member','inv_create_return_note','order_debt_value');
```

Kỳ vọng: 3 dòng migration (hoặc ít nhất `v44_*`), 2 cột mới, 4 hàm.

## 2. Kịch bản trả hàng ↔ công nợ (bắt buộc, P0)

Chuẩn bị: 1 khách A, 1 sản phẩm giá bán 100.000, tồn ≥ 10.

| # | Thao tác | Kỳ vọng UI | Kỳ vọng DB |
|---|---|---|---|
| R1 | Bán chịu 3 món = 300.000 (trạng thái **Công nợ**) | Nợ A = 300.000 | `orders.debt_amount=300000`, `customers.debt=300000` |
| R2 | Trả 2 món, bật “Hoàn tiền” | Toast: hoàn tiền mặt **0 ₫**, giảm công nợ **200.000 ₫** | `return_notes.total=200000`, `cash_refund=0`, `debt_credit=200000`; **không** có giao dịch chi; nợ A = 100.000 |
| R3 | Thu nợ 100.000 (phiếu thu) | Nợ A = 0 | có income “Thu nợ”; `debt_amount=0` |
| R4 | Bán đủ 3 món = 300.000, thu đủ 300.000 | Đã thanh toán | income “Bán hàng” 300.000 |
| R5 | Trả 1 món, bật hoàn tiền | Hoàn tiền mặt **100.000 ₫** | `cash_refund=100000`, `debt_credit=0`; expense “Trả hàng” 100.000 gắn `order_id` |
| R6 | Trả tiếp 1 món | Hoàn tiếp 100.000 ₫ | tổng expense trả hàng = 200.000; không âm quỹ |
| R7 | Trả nốt 1 món | Hoàn 100.000 ₫ | tổng hoàn = 300.000 = đã thu; nợ 0 |

SQL đối chiếu sau R2 (thay `:shop`, `:order`):

```sql
select o.code, o.total, o.paid, o.debt_amount,
       coalesce((select sum(total) from public.return_notes r where r.order_id=o.id),0) as returned,
       coalesce((select sum(cash_refund) from public.return_notes r where r.order_id=o.id),0) as cash_out,
       coalesce((select sum(case when type='income' then amount else -amount end)
                   from public.transactions t where t.order_id=o.id),0) as net_paid
  from public.orders o where o.id = :order;
```

Kỳ vọng R2: `total=300000, paid=false, debt_amount=100000, returned=200000, cash_out=0, net_paid=0`.
Ngoài ra: `select count(*) from public.transactions where order_id=:order and type='expense'` → **0**.

## 3. Đối soát 20 đơn + 20 phiếu nhập + 20 công nợ

Lấy mẫu ngẫu nhiên, ghi lại mã đơn/phiếu vào file bằng chứng, rồi chạy 3 truy vấn.

### 3.1 Đơn hàng

```sql
with x as (
  select o.id, o.code, o.total, o.paid, o.status, o.debt_amount,
         coalesce((select sum(total) from public.return_notes r where r.order_id=o.id),0) returned,
         coalesce((select sum(cash_refund) from public.return_notes r where r.order_id=o.id),0) cash_out,
         coalesce((select sum(case when type='income' then amount else -amount end)
                     from public.transactions t where t.order_id=o.id),0) net_paid
    from public.orders o
   where o.shop_id = :shop
   order by o.created_at desc
   limit 20
)
select *,
       case when paid or status in ('cancelled','quote') then 0
            else greatest(0, total - returned - greatest(0, net_paid + cash_out)) end as expected_debt
  from x;
```

**Đạt:** `debt_amount = expected_debt` cho cả 20 dòng. Lệch 1 đồng = FAIL, mở bug P0.

### 3.2 Phiếu nhập

```sql
select rn.code, rn.total, rn.paid_amount, rn.status,
       coalesce((select sum(amount) from public.supplier_debts d
                  where d.received_note_id = rn.id),0) as supplier_debt,
       coalesce((select sum(amount) from public.transactions t
                  where t.source='received_note' and t.note like '%'||rn.code||'%'),0) as paid_out
  from public.received_notes rn
 where rn.shop_id = :shop
 order by rn.created_at desc limit 20;
```

**Đạt:** `paid_amount + supplier_debt = total` (sai số ≤ 0,5 ₫ do làm tròn) và `paid_out = paid_amount`.

### 3.3 Công nợ khách

```sql
select c.id, c.name, c.debt,
       coalesce(sum(o.debt_amount),0) as open_order_debt
  from public.customers c
  left join public.orders o on o.customer_id = c.id
 where c.shop_id = :shop
 group by c.id, c.name, c.debt
having c.debt <> coalesce(sum(o.debt_amount),0)
 order by abs(c.debt - coalesce(sum(o.debt_amount),0)) desc
 limit 20;
```

**Đạt:** 0 dòng. Nếu có dòng, kiểm tra xem khách đó có điều chỉnh nợ tay/legacy không; ghi nhận và xử lý trước khi GO.

### 3.4 Sổ cái công nợ

```sql
select customer_id,
       sum(case when type='charge' then amount else -amount end) as movement,
       max(balance_after) as last_balance
  from public.customer_debt_ledger
 where shop_id = :shop
 group by customer_id
having sum(case when type='charge' then amount else -amount end) <> max(balance_after) - min(balance_after) + min(case when type='charge' then amount else -amount end);
```

Cách kiểm tra chắc chắn hơn: với 1 khách, lấy toàn bộ ledger theo thời gian và cộng dồn thủ công
(`balance_after` phải bằng tổng luỹ kế charge − payment). Ghi ảnh màn hình.

## 4. Bảo mật & phân quyền (4 vai trò)

| Vai trò | Việc làm | Kỳ vọng |
|---|---|---|
| owner | mở Phân quyền → thêm nhân viên bằng email đã đăng ký → chọn Kế toán | Thành công, xuất hiện trong danh sách, quyền preset đúng |
| owner | xoá nhân viên vừa thêm | Biến mất; nhân viên đó mở lại app không thấy dữ liệu shop |
| staff (money only) | mở `/#/shipments`, `/#/sale` | Bị đưa về `/#/home` |
| staff | gọi RPC `inv_add_shop_member` bằng Postman/curl với JWT của mình | 401/exception “Chỉ chủ cửa hàng…” |
| anon | POST `/rest/v1/rpc/inv_set_order_paid` | 401 `permission denied for function` |
| owner | mở `/_` URL lạ | trang 404, không lộ dữ liệu |

## 5. Khôi phục mật khẩu

1. Đăng xuất → “Quên mật khẩu” → nhận email.
2. Bấm link → phải mở `/#/reset-password` (không phải trang 404).
3. Nhập mật khẩu mới 2 lần → toast thành công → bị đăng xuất → đăng nhập bằng mật khẩu mới.
4. Mở lại link cũ (đã dùng) → báo link hết hạn, không cho đổi.
5. Link hết hạn/sai → màn hình báo lỗi + nút về đăng nhập.

## 6. Hạ tầng

- [ ] Supabase → Database → Backups: có bản backup trong 24h; PITR bật (nếu gói hỗ trợ).
- [ ] Diễn tập restore về project staging, đăng nhập, kiểm tra 5 đơn gần nhất + tồn kho.
- [ ] Security headers trên domain production: HSTS, CSP, X-Content-Type-Options, Referrer-Policy.
- [ ] Rate limit auth (Supabase) và API; thử 10 lần sai mật khẩu liên tiếp.
- [ ] Log retention + cảnh báo lỗi.

## 7. Ký GO

Chỉ ký khi:

- 0 P0, 0 P1 mở.
- 8/8 mục schema APPLIED, 3 kịch bản đối soát trả 0 dòng lệch.
- R1–R7 PASS với ảnh chụp + SQL.
- 4 vai trò PASS, link reset PASS.
- Backup/restore có bằng chứng.

Ghi kết quả vào `qa/05-go-no-go.md` (bảng ký duyệt) kèm ngày giờ và người thực hiện.
