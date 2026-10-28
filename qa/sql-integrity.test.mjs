// QA harness: chạy các migration tiền/kho trên PostgreSQL thật (PGlite/WASM)
// để chứng minh bất biến: doanh thu ↔ sổ quỹ ↔ công nợ ↔ tồn kho.
//
//   npm i --no-save @electric-sql/pglite
//   node qa/sql-integrity.test.mjs
//
// Không kết nối production, không ghi dữ liệu thật.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const SHOP = '11111111-1111-1111-1111-111111111111';
const USER = '00000000-0000-0000-0000-000000000001';
const ACC = '22222222-2222-2222-2222-222222222222';

const BASE = `
create schema if not exists auth;
create table auth.users (id uuid primary key, email text unique);
insert into auth.users(id, email) values
  ('${USER}', 'owner@qa.test'),
  ('00000000-0000-0000-0000-000000000002', 'staff@qa.test'),
  ('00000000-0000-0000-0000-000000000003', 'busy@qa.test');
create or replace function auth.uid() returns uuid language sql stable as $$ select '${USER}'::uuid $$;
create role anon;
create role authenticated;
create role service_role;

create table public.shops (
  id uuid primary key, name text not null, owner_id uuid
);
create table public.profiles (
  id uuid primary key, shop_id uuid, full_name text, role text, permissions jsonb default '{}'::jsonb
);
create table public.products (
  id uuid primary key default gen_random_uuid(), shop_id uuid, name text not null,
  sku text, unit text, price numeric(14,2) not null default 0,
  cost numeric(14,2) default 0, stock numeric(14,2) not null default 0, active boolean default true,
  barcode text, expiry_date date
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), shop_id uuid, name text not null,
  phone text, email text, address text, debt numeric(14,2) not null default 0,
  total_spending numeric(14,2) default 0, last_activity timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  deleted_at timestamptz, code text, phone_normalized text, search_vector tsvector
);
create table public.money_accounts (
  id uuid primary key default gen_random_uuid(), shop_id uuid, name text not null,
  type text default 'cash', balance numeric(14,2) default 0,
  is_default boolean not null default false, created_at timestamptz default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null, code text not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text, status text not null default 'completed',
  total numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  paid boolean not null default true, note text, channel_id uuid,
  payment_method text, ship_fee numeric(14,2) default 0,
  ship_fee_by_customer boolean default true, customer_phone text, customer_address text,
  shipping_code text, shipping_partner text, shipper_name text, shipper_phone text,
  shipping_address text, idempotency_key uuid, account_id uuid, debt_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null, price numeric(14,2) not null default 0,
  qty numeric(14,2) not null default 1, total numeric(14,2) not null default 0
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null, type text not null,
  category text, amount numeric(14,2) not null, note text,
  occurred_at timestamptz not null default now(), order_id uuid references public.orders(id) on delete set null,
  source text default 'manual', client_nonce text, payment_type text default 'CASH',
  account_id uuid, created_at timestamptz default now()
);
create table public.customer_debt_ledger (
  id uuid primary key default gen_random_uuid(), shop_id uuid, customer_id uuid,
  type text, amount numeric(14,2), balance_after numeric(14,2), note text,
  created_by uuid, created_at timestamptz default now()
);
create table public.return_notes (
  id uuid primary key default gen_random_uuid(), shop_id uuid,
  order_id uuid references public.orders(id) on delete set null,
  order_code text, code text, customer_id uuid, items jsonb not null default '[]'::jsonb,
  total numeric(14,2) not null default 0, refunded boolean not null default true,
  note text, idempotency_key uuid, created_at timestamptz default now()
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(), shop_id uuid, name text, phone text, note text, created_at timestamptz default now()
);
create table public.supplier_debts (
  id uuid primary key default gen_random_uuid(), shop_id uuid, supplier_id uuid, received_note_id uuid,
  amount numeric(14,2), paid_amount numeric(14,2) default 0, due_date date, status text,
  note text, created_by text, created_at timestamptz default now()
);
create table public.received_notes (
  id uuid primary key default gen_random_uuid(), shop_id uuid, code text, supplier_name text,
  total numeric(14,2) default 0, items jsonb default '[]'::jsonb, paid boolean default true,
  note text, supplier_id uuid, paid_amount numeric(14,2) default 0, due_date date,
  status text, parent_id uuid, created_by uuid, approved_by text, approved_at timestamptz,
  idempotency_key uuid, created_at timestamptz default now()
);

create or replace function public.is_shop_member(p_shop uuid) returns boolean
language sql stable as $$ select true $$;
create or replace function public.has_permission(p_shop uuid, p_perm text) returns boolean
language sql stable as $$ select true $$;
create or replace function public._inv_stock_status(p_status text) returns boolean
language sql immutable as $$ select coalesce(p_status,'completed') not in ('draft','quote','cancelled') $$;
-- Ledger tồn kho là chủ đề test riêng; ở đây chỉ cần trả "áp dụng thành công".
create or replace function public.inv_apply_note(p_shop uuid, p_ref_type text, p_ref_id uuid, p_items jsonb)
returns boolean language sql as $$ select true $$;

insert into public.shops(id, name, owner_id) values ('${SHOP}', 'QA Shop', '${USER}');
insert into public.profiles(id, shop_id, full_name, role) values ('${USER}', '${SHOP}', 'QA Owner', 'owner');
insert into public.money_accounts(id, shop_id, name, type, is_default) values ('${ACC}', '${SHOP}', 'Tiền mặt', 'cash', true);
`;

const v41 = readFileSync('supabase-migration-v41-money-debt-integrity.sql', 'utf8');
const v43 = readFileSync('supabase-migration-v43-order-money-integrity.sql', 'utf8');
const v44 = readFileSync('supabase-migration-v44-return-debt-staff.sql', 'utf8');
const v45 = readFileSync('supabase-migration-v45-order-delete-print-customer.sql', 'utf8');
const v46 = readFileSync('supabase-migration-v46-delete-any-order.sql', 'utf8');

const db = new PGlite();
await db.exec(BASE);
await db.exec(v41);
await db.exec(v43);
await db.exec(v44);
await db.exec(v44); // chạy lại phải idempotent
await db.exec(v45);
await db.exec(v46);
await db.exec(v46); // migration xóa đơn cũng phải idempotent

let passed = 0;
const failures = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}: ${JSON.stringify(actual)}`);
  } else {
    failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.log(`  FAIL  ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const val = async (sql, params = []) => Object.values(await one(sql, params))[0];

async function newCustomer(name) {
  return (await one(
    `insert into public.customers(shop_id,name) values ($1,$2) returning id`, [SHOP, name]
  )).id;
}
async function newOrder({ status = 'completed', paid = true, total = 100, customer = null }) {
  return (await one(
    `insert into public.orders(shop_id, code, customer_id, customer_name, status, total, paid)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [SHOP, 'DH-' + Math.random().toString(36).slice(2, 8), customer, customer ? 'Khách QA' : 'Khách lẻ', status, total, paid]
  )).id;
}
async function saleIncome(orderId, amount, category = 'Bán hàng') {
  await db.query(
    `insert into public.transactions(shop_id,type,category,amount,order_id,source,client_nonce)
     values ($1,'income',$2,$3,$4,'order',$5)`,
    [SHOP, category, amount, orderId, 'qa:' + Math.random()]
  );
}
const sum = async (orderId, type) => Number(await val(
  `select coalesce(sum(amount),0) from public.transactions where order_id=$1 and type=$2`, [orderId, type]
));

console.log('\n== T1: đơn Công nợ → Hoàn tất phải ghi khoản thu (bug trước v43) ==');
{
  const c = await newCustomer('T1');
  const id = await newOrder({ status: 'debt', paid: false, total: 100, customer: c });
  check('nợ ban đầu của khách', Number(await val(`select debt from customers where id=$1`, [c])), 100);
  // UPDATE trực tiếp mô phỏng đúng đường cũ của nút "Đổi trạng thái".
  await db.query(`update public.orders set status='completed' where id=$1`, [id]);
  check('đường cũ: không có khoản thu nào', await sum(id, 'income'), 0);
  // v43: RPC đúng.
  const c2 = await newCustomer('T1b');
  const id2 = await newOrder({ status: 'debt', paid: false, total: 100, customer: c2 });
  await db.query(`select public.inv_set_order_status($1,$2,'completed')`, [SHOP, id2]);
  check('đường v43: khoản thu đủ 100', await sum(id2, 'income'), 100);
  check('đường v43: nợ khách về 0', Number(await val(`select debt from customers where id=$1`, [c2])), 0);
  check('đường v43: debt_amount về 0', Number(await val(`select debt_amount from orders where id=$1`, [id2])), 0);
}

console.log('\n== T2: "Chuyển về còn nợ" không được tạo khoản CHI giả ==');
{
  const c = await newCustomer('T2');
  const id = await newOrder({ status: 'completed', paid: true, total: 100, customer: c });
  await saleIncome(id, 80, 'Bán hàng');
  await saleIncome(id, 20, 'Thu nợ');
  await db.query(`select public.inv_set_order_paid($1,$2,false)`, [SHOP, id]);
  check('không phát sinh khoản chi', await sum(id, 'expense'), 0);
  check('khoản thu nợ 20 được giữ', await sum(id, 'income'), 20);
  check('nợ còn lại đúng 80', Number(await val(`select debt_amount from orders where id=$1`, [id])), 80);
  check('nợ khách đúng 80', Number(await val(`select debt from customers where id=$1`, [c])), 80);
}

console.log('\n== T3: xóa đơn nguyên tử — đảo tiền/nợ, giữ lịch sử trả hàng ==');
{
  const c = await newCustomer('T3');
  const paidOrder = await newOrder({ status: 'completed', paid: true, total: 100, customer: c });
  await saleIncome(paidOrder, 100);
  const returnId = (await one(
    `insert into public.return_notes(shop_id,order_id,code,items,total)
     values ($1,$2,'TH-T3','[]'::jsonb,0) returning id`, [SHOP, paidOrder]
  )).id;
  await db.query(`select public.inv_delete_order($1,$2)`, [SHOP, paidOrder]);
  check('xóa đơn đã ghi nhận thanh toán', Number(await val(`select count(*) from orders where id=$1`, [paidOrder])), 0);
  check('đảo/xóa giao dịch gắn với đơn', Number(await val(`select count(*) from transactions where order_id=$1`, [paidOrder])), 0);
  check('giữ phiếu trả hàng nhưng bỏ liên kết đơn', await val(`select order_id from return_notes where id=$1`, [returnId]), null);

  const debtCustomer = await newCustomer('T3 debt');
  const debtOrder = await newOrder({ status: 'debt', paid: false, total: 75, customer: debtCustomer });
  check('nợ khách trước khi xóa', Number(await val(`select debt from customers where id=$1`, [debtCustomer])), 75);
  await db.query(`select public.inv_delete_order($1,$2)`, [SHOP, debtOrder]);
  check('xóa đơn hoàn lại công nợ khách', Number(await val(`select debt from customers where id=$1`, [debtCustomer])), 0);

  const unpaid = await newOrder({ status: 'draft', paid: false, total: 0, customer: null });
  await db.query(`select public.inv_delete_order($1,$2)`, [SHOP, unpaid]);
  check('vẫn xóa được đơn nháp chưa phát sinh', Number(await val(`select count(*) from orders where id=$1`, [unpaid])), 0);
}

console.log('\n== T4: trả hàng — giá lấy từ đơn gốc + chặn trả vượt ==');
{
  const c = await newCustomer('T4');
  const orderId = await newOrder({ status: 'completed', paid: true, total: 500, customer: c });
  const p = (await one(
    `insert into public.products(shop_id,name,price,cost) values ($1,'SP T4',100,40) returning id`, [SHOP]
  )).id;
  await db.query(
    `insert into public.order_items(order_id,product_id,name,price,qty,total)
     values ($1,$2,'SP T4',100,5,500)`, [orderId, p]
  );
  const call = (qty, price, nonce) => db.query(
    `select public.inv_create_return_note($1,$2,$3,$4)`,
    [SHOP,
     { order_id: orderId, order_code: 'DH-T4', code: 'TH-' + nonce.slice(0, 6), customer_id: c, refunded: false, note: null },
     [{ product_id: p, name: 'SP T4', price, qty }],
     nonce]
  );
  await call(3, 999, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  check('tổng hoàn dùng giá gốc 100×3', Number(await val(
    `select total from return_notes where order_id=$1`, [orderId]
  )), 300);
  let blocked = false;
  try {
    await call(3, 100, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  } catch (e) {
    blocked = /vượt quá số đã mua/.test(String(e.message));
  }
  check('chặn trả vượt quá số đã mua (3+3 > 5)', blocked, true);
  await call(2, 100, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  check('trả nốt 2 còn lại thành công', Number(await val(
    `select count(*) from return_notes where order_id=$1`, [orderId]
  )), 2);
}

console.log('\n== T5: không trả hàng cho đơn nháp/báo giá/đã hủy ==');
{
  const orderId = await newOrder({ status: 'cancelled', paid: false, total: 0 });
  const p = (await one(
    `insert into public.products(shop_id,name,price,cost) values ($1,'SP T5',100,40) returning id`, [SHOP]
  )).id;
  await db.query(
    `insert into public.order_items(order_id,product_id,name,price,qty,total)
     values ($1,$2,'SP T5',100,2,200)`, [orderId, p]
  );
  let blocked = false;
  try {
    await db.query(
      `select public.inv_create_return_note($1,$2,$3,$4)`,
      [SHOP, { order_id: orderId, code: 'TH-T5', refunded: false },
       [{ product_id: p, name: 'SP T5', price: 100, qty: 1 }], 'dddddddd-dddd-4ddd-8ddd-dddddddddddd']
    );
  } catch (e) {
    blocked = /không thể trả hàng/.test(String(e.message));
  }
  check('chặn trả hàng trên đơn đã hủy', blocked, true);
}

console.log('\n== T6: sửa tổng tiền trực tiếp qua PostgREST bị chặn ==');
{
  const id = await newOrder({ status: 'completed', paid: true, total: 100 });
  let blocked = false;
  try {
    await db.exec(`set role authenticated; update public.orders set total=1 where id='${id}'; reset role;`);
  } catch (e) {
    blocked = /permission denied/i.test(String(e.message));
  }
  check('role authenticated không còn UPDATE orders', blocked, true);
  check('tổng tiền không bị sửa', Number(await val(`select total from orders where id=$1`, [id])), 100);
}

console.log('\n== T7: trả hàng đơn ghi nợ — bù công nợ, KHÔNG chi tiền mặt ==');
{
  const c = await newCustomer('T7');
  const orderId = await newOrder({ status: 'debt', paid: false, total: 300, customer: c });
  const p = (await one(
    `insert into public.products(shop_id,name,price,cost) values ($1,'SP T7',100,40) returning id`, [SHOP]
  )).id;
  await db.query(
    `insert into public.order_items(order_id,product_id,name,price,qty,total)
     values ($1,$2,'SP T7',100,3,300)`, [orderId, p]
  );
  check('nợ ban đầu 300', Number(await val(`select debt from customers where id=$1`, [c])), 300);
  const res = await one(
    `select public.inv_create_return_note($1,$2,$3,$4) r`,
    [SHOP, { order_id: orderId, order_code: 'DH-T7', code: 'TH-T7', customer_id: c, refunded: true },
     [{ product_id: p, name: 'SP T7', price: 999, qty: 2 }], 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']
  );
  check('hoàn tiền mặt = 0', Number(res.r.cash_refund), 0);
  check('bù công nợ = 200', Number(res.r.debt_credit), 200);
  check('không tạo khoản chi', await sum(orderId, 'expense'), 0);
  check('nợ đơn còn 100', Number(await val(`select debt_amount from orders where id=$1`, [orderId])), 100);
  check('nợ khách còn 100', Number(await val(`select debt from customers where id=$1`, [c])), 100);
}

console.log('\n== T8: trả hàng đơn đã trả — hoàn đúng bằng tiền đã thu ==');
{
  const c = await newCustomer('T8');
  const orderId = await newOrder({ status: 'completed', paid: true, total: 300, customer: c });
  await saleIncome(orderId, 300);
  const p = (await one(
    `insert into public.products(shop_id,name,price,cost) values ($1,'SP T8',100,40) returning id`, [SHOP]
  )).id;
  await db.query(
    `insert into public.order_items(order_id,product_id,name,price,qty,total)
     values ($1,$2,'SP T8',100,3,300)`, [orderId, p]
  );
  const call = (qty, nonce) => one(
    `select public.inv_create_return_note($1,$2,$3,$4) r`,
    [SHOP, { order_id: orderId, order_code: 'DH-T8', code: 'TH-' + nonce.slice(0, 4), customer_id: c, refunded: true },
     [{ product_id: p, name: 'SP T8', price: 100, qty }], nonce]
  );
  const r1 = await call(1, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
  check('lần 1 hoàn mặt 100', Number(r1.r.cash_refund), 100);
  check('lần 1 không bù nợ', Number(r1.r.debt_credit), 0);
  const r2 = await call(1, '11111111-2222-4333-8444-555555555555');
  check('lần 2 hoàn mặt 100', Number(r2.r.cash_refund), 100);
  check('tổng chi trả hàng 200', await sum(orderId, 'expense'), 200);
  check('đơn đã trả vẫn không nợ', Number(await val(`select debt_amount from orders where id=$1`, [orderId])), 0);
  check('khách không nợ', Number(await val(`select debt from customers where id=$1`, [c])), 0);
}

console.log('\n== T9: đơn trả một phần — chỉ hoàn phần đã thu, phần còn lại bù nợ ==');
{
  const c = await newCustomer('T9');
  const orderId = await newOrder({ status: 'completed', paid: false, total: 300, customer: c });
  await saleIncome(orderId, 100, 'Thu nợ');
  const p = (await one(
    `insert into public.products(shop_id,name,price,cost) values ($1,'SP T9',100,40) returning id`, [SHOP]
  )).id;
  await db.query(
    `insert into public.order_items(order_id,product_id,name,price,qty,total)
     values ($1,$2,'SP T9',100,3,300)`, [orderId, p]
  );
  check('nợ trước trả 200', Number(await val(`select debt from customers where id=$1`, [c])), 200);
  const r = await one(
    `select public.inv_create_return_note($1,$2,$3,$4) r`,
    [SHOP, { order_id: orderId, order_code: 'DH-T9', code: 'TH-T9', customer_id: c, refunded: true },
     [{ product_id: p, name: 'SP T9', price: 100, qty: 2 }], '99999999-8888-4777-8666-555555555555']
  );
  check('hoàn mặt 0 (khách chưa trả đủ)', Number(r.r.cash_refund), 0);
  check('bù nợ 200', Number(r.r.debt_credit), 200);
  check('nợ khách về 0', Number(await val(`select debt from customers where id=$1`, [c])), 0);
  check('nợ đơn về 0', Number(await val(`select debt_amount from orders where id=$1`, [orderId])), 0);
  check('không chi tiền mặt', await sum(orderId, 'expense'), 0);
}

console.log('\n== T10: thêm/xoá nhân viên theo email ==');
{
  await db.query(`insert into public.profiles(id, shop_id, full_name, role, permissions)
                  values ('00000000-0000-0000-0000-000000000002', null, 'Staff QA', 'staff', '{}')`);
  await db.query(`insert into public.profiles(id, shop_id, full_name, role, permissions)
                  values ('00000000-0000-0000-0000-000000000003', null, 'Busy QA', 'staff', '{}')`);
  const added = await one(`select public.inv_add_shop_member($1,$2,$3) m`, [SHOP, 'staff@qa.test', 'manager']);
  check('gán đúng shop', (await one(`select shop_id from profiles where id=$1`, ['00000000-0000-0000-0000-000000000002'])).shop_id, SHOP);
  check('gán đúng vai trò', added.m.role, 'manager');
  check('preset quyền manager có money',
    (await one(`select permissions from profiles where id=$1`, ['00000000-0000-0000-0000-000000000002'])).permissions.money, true);
  await db.query(`select public.inv_remove_shop_member($1,$2)`, [SHOP, '00000000-0000-0000-0000-000000000002']);
  check('xoá khỏi shop', (await one(`select shop_id from profiles where id=$1`, ['00000000-0000-0000-0000-000000000002'])).shop_id, null);
  check('xoá hết quyền',
    JSON.stringify((await one(`select permissions from profiles where id=$1`, ['00000000-0000-0000-0000-000000000002'])).permissions),
    '{}');

  const busyShop = '33333333-3333-3333-3333-333333333333';
  await db.query(`insert into shops(id,name,owner_id) values ($1,'Busy Shop','00000000-0000-0000-0000-000000000003')`, [busyShop]);
  await db.query(`insert into products(shop_id,name,price,stock) values ($1,'SP riêng',10,1)`, [busyShop]);
  let blocked = false;
  try {
    await db.query(`select public.inv_add_shop_member($1,'busy@qa.test','staff')`, [SHOP]);
  } catch (e) {
    blocked = /đã có dữ liệu/.test(String(e.message));
  }
  check('chặn kéo tài khoản đã có dữ liệu riêng', blocked, true);
  let unknown = false;
  try {
    await db.query(`select public.inv_add_shop_member($1,'khong-ton-tai@qa.test','staff')`, [SHOP]);
  } catch (e) {
    unknown = /Chưa có tài khoản/.test(String(e.message));
  }
  check('báo đúng khi email chưa đăng ký', unknown, true);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(' - ' + f);
  process.exitCode = 1;
}
await db.close();
