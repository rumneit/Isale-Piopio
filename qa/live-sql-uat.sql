-- ============================================================================
-- PioPio — UAT SQL trên DB thật (AN TOÀN: mở transaction và ROLLBACK cuối file)
--
-- Cách chạy: Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- Không cần đăng nhập app. Mọi bản ghi tạo ra đều bị rollback.
--
-- Kịch bản:
--   R1  Bán chịu 3 × 100.000 = 300.000
--   R2  Trả 2 món → hoàn tiền mặt 0, bù nợ 200.000, nợ còn 100.000
--   R3  Đơn đã thu đủ 300.000, trả 1 món × 3 lần → mỗi lần hoàn 100.000
--   R4  Chặn trả vượt số đã mua
--   R5  Không tạo khoản chi nào cho đơn ghi nợ
--
-- Nếu mọi assert đúng, kết quả cuối là "ROLLBACK" và các NOTICE PASS.
-- Nếu sai, script raise exception và cũng không ghi gì.
-- ============================================================================

begin;

do $uat$
declare
  v_shop uuid;
  v_owner uuid;
  v_customer uuid;
  v_product uuid;
  v_order jsonb;
  v_order_id uuid;
  v_order_code text;
  v_ret jsonb;
  v_expense numeric;
  v_cash_total numeric;
  v_debt numeric;
  v_expected numeric;
begin
  select s.id, s.owner_id into v_shop, v_owner
    from public.shops s
   order by s.created_at
   limit 1;

  if v_shop is null then
    raise exception 'UAT: chưa có shop nào trong DB.';
  end if;

  -- Giả lập phiên đăng nhập của chủ shop để has_permission() hoạt động.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );

  insert into public.customers(shop_id, name, phone)
  values (v_shop, 'QA UAT ' || substr(gen_random_uuid()::text, 1, 6), '0900000000')
  returning id into v_customer;

  insert into public.products(shop_id, name, sku, price, cost, stock, unit)
  values (v_shop, 'SP QA UAT', 'QA-UAT-' || substr(gen_random_uuid()::text, 1, 6),
          100000, 40000, 100, 'cái')
  returning id into v_product;

  -- ------------------------------------------------------------------ R1
  v_order_code := 'QA-UAT-' || substr(gen_random_uuid()::text, 1, 8);
  v_order := public.inv_create_order(
    v_shop,
    jsonb_build_object(
      'code', v_order_code,
      'customer_id', v_customer,
      'customer_name', 'Khách QA UAT',
      'status', 'debt',
      'paid', false,
      'payment_method', 'CASH'
    ),
    jsonb_build_array(
      jsonb_build_object('product_id', v_product, 'name', 'SP QA UAT', 'price', 100000, 'qty', 3)
    ),
    gen_random_uuid(),
    false
  );
  v_order_id := (v_order->>'id')::uuid;

  select coalesce(sum(debt_amount), 0) into v_debt
    from public.orders where id = v_order_id;
  if v_debt <> 300000 then
    raise exception 'FAIL R1: nợ đơn phải 300.000, thực tế %', v_debt;
  end if;
  select coalesce(debt, 0) into v_debt from public.customers where id = v_customer;
  if v_debt <> 300000 then
    raise exception 'FAIL R1: nợ khách phải 300.000, thực tế %', v_debt;
  end if;
  raise notice 'PASS R1: đơn công nợ 300.000, nợ khách 300.000';

  -- ------------------------------------------------------------------ R2
  v_ret := public.inv_create_return_note(
    v_shop,
    jsonb_build_object(
      'order_id', v_order_id,
      'order_code', v_order_code,
      'customer_id', v_customer,
      'code', 'TH-UAT-' || substr(gen_random_uuid()::text, 1, 6),
      'refunded', true,
      'note', 'QA UAT trả 2 món'
    ),
    jsonb_build_array(
      jsonb_build_object('product_id', v_product, 'name', 'SP QA UAT', 'price', 100000, 'qty', 2)
    ),
    gen_random_uuid()
  );

  if (v_ret->>'total')::numeric <> 200000 then
    raise exception 'FAIL R2: tổng phiếu trả phải 200.000, thực tế %', v_ret->>'total';
  end if;
  if (v_ret->>'cash_refund')::numeric <> 0 then
    raise exception 'FAIL R2: hoàn tiền mặt phải 0, thực tế %', v_ret->>'cash_refund';
  end if;
  if (v_ret->>'debt_credit')::numeric <> 200000 then
    raise exception 'FAIL R2: bù công nợ phải 200.000, thực tế %', v_ret->>'debt_credit';
  end if;

  select coalesce(sum(debt_amount), 0) into v_debt from public.orders where id = v_order_id;
  if v_debt <> 100000 then
    raise exception 'FAIL R2: nợ đơn phải còn 100.000, thực tế %', v_debt;
  end if;
  select coalesce(debt, 0) into v_debt from public.customers where id = v_customer;
  if v_debt <> 100000 then
    raise exception 'FAIL R2: nợ khách phải còn 100.000, thực tế %', v_debt;
  end if;
  select coalesce(sum(amount), 0) into v_expense
    from public.transactions where order_id = v_order_id and type = 'expense';
  if v_expense <> 0 then
    raise exception 'FAIL R5: đơn ghi nợ không được có khoản chi, thực tế %', v_expense;
  end if;
  raise notice 'PASS R2: hoàn mặt 0, bù nợ 200.000, nợ còn 100.000, không chi tiền';

  -- ------------------------------------------------------------------ R3
  v_order_code := 'QA-UAT-' || substr(gen_random_uuid()::text, 1, 8);
  v_order := public.inv_create_order(
    v_shop,
    jsonb_build_object(
      'code', v_order_code,
      'customer_id', v_customer,
      'customer_name', 'Khách QA UAT',
      'status', 'completed',
      'paid', true,
      'payment_method', 'CASH'
    ),
    jsonb_build_array(
      jsonb_build_object('product_id', v_product, 'name', 'SP QA UAT', 'price', 100000, 'qty', 3)
    ),
    gen_random_uuid(),
    true
  );
  v_order_id := (v_order->>'id')::uuid;

  for i in 1..3 loop
    v_ret := public.inv_create_return_note(
      v_shop,
      jsonb_build_object(
        'order_id', v_order_id,
        'order_code', v_order_code,
        'customer_id', v_customer,
        'code', 'TH-UAT-' || substr(gen_random_uuid()::text, 1, 6),
        'refunded', true
      ),
      jsonb_build_array(
        jsonb_build_object('product_id', v_product, 'name', 'SP QA UAT', 'price', 100000, 'qty', 1)
      ),
      gen_random_uuid()
    );
    if (v_ret->>'cash_refund')::numeric <> 100000 then
      raise exception 'FAIL R3 lần %: hoàn tiền mặt phải 100.000, thực tế %', i, v_ret->>'cash_refund';
    end if;
  end loop;

  select coalesce(sum(amount), 0) into v_cash_total
    from public.transactions
   where order_id = v_order_id and type = 'expense' and category = 'Trả hàng';
  if v_cash_total <> 300000 then
    raise exception 'FAIL R3: tổng hoàn tiền mặt phải 300.000, thực tế %', v_cash_total;
  end if;
  select coalesce(debt_amount, 0) into v_debt from public.orders where id = v_order_id;
  if v_debt <> 0 then
    raise exception 'FAIL R3: đơn đã trả phải hết nợ, thực tế %', v_debt;
  end if;
  raise notice 'PASS R3: 3 lần trả, mỗi lần hoàn 100.000, tổng chi 300.000, nợ 0';

  -- ------------------------------------------------------------------ R4
  begin
    perform public.inv_create_return_note(
      v_shop,
      jsonb_build_object(
        'order_id', v_order_id,
        'order_code', v_order_code,
        'customer_id', v_customer,
        'code', 'TH-UAT-X',
        'refunded', false
      ),
      jsonb_build_array(
        jsonb_build_object('product_id', v_product, 'name', 'SP QA UAT', 'price', 100000, 'qty', 1)
      ),
      gen_random_uuid()
    );
    raise exception 'FAIL R4: trả vượt số đã mua nhưng vẫn được chấp nhận';
  exception
    when others then
      if sqlerrm like 'FAIL R4:%' then
        raise;
      end if;
      raise notice 'PASS R4: chặn trả vượt — %', sqlerrm;
  end;

  -- ------------------------------------------------------------------ R6
  -- Bất biến công nợ: paid/không phát sinh ⇒ 0; còn lại = total − hàng đã trả − đã thu.
  select count(*) into v_expected
    from public.orders o
   where o.shop_id = v_shop
     and o.paid = false
     and o.status not in ('cancelled', 'quote')
     and o.debt_amount <> greatest(
       0,
       coalesce(o.total, 0)
       - coalesce((select sum(r.total) from public.return_notes r where r.order_id = o.id), 0)
       - greatest(
           0,
           coalesce((select sum(case when t.type = 'income' then t.amount else -t.amount end)
                       from public.transactions t where t.order_id = o.id), 0)
           + coalesce((select sum(r.cash_refund) from public.return_notes r where r.order_id = o.id), 0)
         )
     );
  -- Chỉ báo cáo, không fail: dữ liệu lịch sử có thể đã lệch từ trước v44.
  raise notice 'INFO R6: % đơn cũ trong shop đang lệch công nợ (nếu >0, rà tay các phiếu trả trước v44)', v_expected;

  raise notice '===== UAT SQL: TẤT CẢ ASSERT PASS — sẽ ROLLBACK =====';
end $uat$;

rollback;
