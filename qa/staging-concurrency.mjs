// Kiểm thử hai kết nối HTTPS thật trên Supabase staging.
// Script cố ý từ chối URL production và tự dọn đơn thử sau khi xác minh.
//
// Biến bắt buộc:
//   STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY
//   STAGING_TEST_EMAIL, STAGING_TEST_PASSWORD, STAGING_SHOP_ID
//
// Tài khoản test phải có quyền `sell` trong shop staging và migration v48.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const required = [
  'STAGING_SUPABASE_URL',
  'STAGING_SUPABASE_ANON_KEY',
  'STAGING_TEST_EMAIL',
  'STAGING_TEST_PASSWORD',
  'STAGING_SHOP_ID',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`SKIP: thiếu biến staging: ${missing.join(', ')}`);
  process.exit(2);
}

const productionEnv = readFileSync('src/environments/environment.prod.ts', 'utf8');
const productionUrl = productionEnv.match(/supabaseUrl:\s*'([^']+)'/)?.[1]?.replace(/\/$/, '');
const stagingUrl = process.env.STAGING_SUPABASE_URL.replace(/\/$/, '');
if (productionUrl && stagingUrl === productionUrl) {
  throw new Error('Từ chối chạy concurrency test trên Supabase production.');
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const clientA = createClient(stagingUrl, process.env.STAGING_SUPABASE_ANON_KEY, options);
const clientB = createClient(stagingUrl, process.env.STAGING_SUPABASE_ANON_KEY, options);
const credentials = { email: process.env.STAGING_TEST_EMAIL, password: process.env.STAGING_TEST_PASSWORD };

for (const [name, client] of [['A', clientA], ['B', clientB]]) {
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new Error(`Kết nối ${name} đăng nhập staging thất bại: ${error.message}`);
}

const nonce = randomUUID();
const shopId = process.env.STAGING_SHOP_ID;
const code = `QA-RACE-${Date.now()}`;
const args = {
  p_shop: shopId,
  p_order: {
    code,
    customer_name: 'QA concurrency — tự động xóa',
    status: 'draft',
    paid: false,
    total: 12345,
    discount: 0,
    ship_fee: 0,
    ship_fee_by_customer: true,
  },
  p_items: [{
    product_id: null,
    name: 'QA concurrency item',
    price: 12345,
    qty: 1,
    unit: 'Cái',
    unit_qty: 1,
    unit_conversion: 1,
    unit_price: 12345,
  }],
  p_nonce: nonce,
  p_record_income: false,
};

let orderId;
try {
  const [resultA, resultB] = await Promise.all([
    clientA.rpc('inv_create_order_v48', args),
    clientB.rpc('inv_create_order_v48', args),
  ]);
  if (resultA.error) throw resultA.error;
  if (resultB.error) throw resultB.error;
  orderId = resultA.data?.id;
  if (!orderId || resultB.data?.id !== orderId) {
    throw new Error(`Idempotency thất bại: A=${orderId ?? 'null'}, B=${resultB.data?.id ?? 'null'}`);
  }

  const { data: orders, error: orderError } = await clientA
    .from('orders')
    .select('id,idempotency_key')
    .eq('shop_id', shopId)
    .eq('idempotency_key', nonce);
  if (orderError) throw orderError;
  if (orders?.length !== 1) throw new Error(`Kỳ vọng đúng 1 đơn, nhận ${orders?.length ?? 0}.`);

  const { data: items, error: itemError } = await clientA
    .from('order_items')
    .select('id,unit,unit_qty,unit_conversion,unit_price')
    .eq('order_id', orderId);
  if (itemError) throw itemError;
  if (items?.length !== 1 || items[0].unit !== 'Cái' || Number(items[0].unit_price) !== 12345) {
    throw new Error('Metadata đơn vị không atomic/không khớp sau race.');
  }
  console.log(`PASS: hai kết nối trả cùng order ${orderId}; DB có đúng 1 đơn và 1 dòng metadata.`);
} finally {
  if (orderId) {
    const { error } = await clientA.rpc('inv_delete_order', { p_shop: shopId, p_order_id: orderId });
    if (error) console.error(`CẢNH BÁO: không dọn được đơn staging ${orderId}: ${error.message}`);
  }
  await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
}
