// Kiểm tra nhanh DB production đã có schema/RPC của v43-v48 chưa.
// Chỉ dùng anon key công khai trong src/environments/environment.prod.ts,
// không đăng nhập, không đọc/ghi dữ liệu nghiệp vụ.
//
//   node qa/probe-live.mjs
//
// Cách hoạt động: gọi RPC với tham số đầy đủ. Nếu hàm tồn tại, PostgREST trả
// 401 "permission denied for function" (anon bị thu hồi EXECUTE). Nếu chưa có
// migration, trả 404 PGRST202.
import { readFileSync } from 'node:fs';

const env = readFileSync('src/environments/environment.prod.ts', 'utf8');
const url = env.match(/supabaseUrl:\s*'([^']+)'/)?.[1];
const key = env.match(/supabaseAnonKey:\s*\n?\s*'([^']+)'/)?.[1];
if (!url || !key) {
  console.error('Không đọc được supabaseUrl / supabaseAnonKey.');
  process.exit(2);
}

const ZERO = '00000000-0000-0000-0000-000000000000';
const probes = [
  ['v43 inv_set_order_status', 'inv_set_order_status', { p_shop: ZERO, p_order_id: ZERO, p_status: 'completed' }],
  ['v43 inv_set_order_paid', 'inv_set_order_paid', { p_shop: ZERO, p_order_id: ZERO, p_paid: true }],
  ['v43 inv_delete_order', 'inv_delete_order', { p_shop: ZERO, p_order_id: ZERO }],
  ['v43 inv_create_return_note', 'inv_create_return_note', { p_shop: ZERO, p_note: {}, p_items: [], p_nonce: ZERO }],
  ['v44 inv_add_shop_member', 'inv_add_shop_member', { p_shop: ZERO, p_email: 'qa@example.com', p_role: 'staff' }],
  ['v44 inv_remove_shop_member', 'inv_remove_shop_member', { p_shop: ZERO, p_profile: ZERO }],
  ['v44 order_debt_value', 'order_debt_value', { p_order_id: ZERO, p_total: 0, p_paid: false, p_status: 'debt' }],
  ['v48 inv_create_order_v48', 'inv_create_order_v48', { p_shop: ZERO, p_order: {}, p_items: [], p_nonce: ZERO, p_record_income: false }],
  ['v48 inv_update_order_full_v48', 'inv_update_order_full_v48', { p_shop: ZERO, p_order_id: ZERO, p_order: {}, p_items: [], p_adjust_income: true }],
];

let missing = 0;
for (const [label, fn, body] of probes) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let state;
  if (res.status === 404 || text.includes('PGRST202')) state = 'MISSING';
  else if (/permission denied for function/i.test(text)) state = 'APPLIED';
  else state = `UNEXPECTED ${res.status} ${text.slice(0, 120)}`;
  if (state !== 'APPLIED') missing++;
  console.log(`${state.padEnd(8)} ${label}`);
}

// Cột hash/prefix của v47.
{
  const res = await fetch(`${url}/rest/v1/api_tokens?select=id,token_prefix&limit=0`, {
    headers: { apikey: key },
  });
  const text = await res.text();
  const state = res.status === 400 && /does not exist/i.test(text) ? 'MISSING' : 'APPLIED';
  if (state !== 'APPLIED') missing++;
  console.log(`${state.padEnd(8)} v47 api_tokens.token_prefix`);
}

// Cột mới của v44: PostgREST trả 400 "column ... does not exist" nếu chưa áp.
{
  const res = await fetch(`${url}/rest/v1/return_notes?select=id,cash_refund,debt_credit&limit=0`, {
    headers: { apikey: key },
  });
  const text = await res.text();
  const state = res.status === 400 && /does not exist/i.test(text) ? 'MISSING' : 'APPLIED';
  if (state !== 'APPLIED') missing++;
  console.log(`${state.padEnd(8)} v44 return_notes.cash_refund/debt_credit`);
}

// Cột mới của v45. Probe này chỉ chứng minh phần schema/snapshot công nợ đã áp;
// v46 thay thân hàm inv_delete_order nhưng giữ nguyên signature nên anon
// read-only không thể phân biệt v43/v45/v46 nếu không introspect pg_proc hoặc
// chạy bài xóa trên staging.
{
  const res = await fetch(`${url}/rest/v1/orders?select=id,customer_debt_before&limit=0`, {
    headers: { apikey: key },
  });
  const text = await res.text();
  const state = res.status === 400 && /does not exist/i.test(text) ? 'MISSING' : 'APPLIED';
  if (state !== 'APPLIED') missing++;
  console.log(`${state.padEnd(8)} v45 orders.customer_debt_before`);
}

console.log(
  missing === 0
    ? '\nTất cả schema/RPC có thể kiểm tra read-only đến v48 đã có trên DB.'
    : `\n${missing} mục schema chưa có — cần chạy migration tương ứng trong Supabase SQL Editor.`
);
process.exitCode = missing === 0 ? 0 : 1;
