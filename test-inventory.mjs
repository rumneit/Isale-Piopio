// Smoke test: P0 Nền móng tồn kho — Sổ cái Inventory Ledger (migration v27)
//  - received-notes: danh sách + nút lịch sử (inv_history) + xoá phiếu qua inv_reverse_note
//  - stock-count chốt: inv_complete_stockcount re-base → PATCH items diff mới, KHÔNG PATCH products
//  - transfer/add: POST transfers + inv_apply_note('transfer_out'), KHÔNG PATCH products
//  - fallback (v27 chưa chạy — PGRST202): tự quay về cộng/trừ stock client-side (legacy)
// REST Supabase được mock qua page.route. Chạy: node test-inventory.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const ROOT = join(process.cwd(), 'www');
const PORT = 8352;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const SHOP = '11111111-1111-1111-1111-111111111111';
const USER = '00000000-0000-4000-8000-000000000001';

const server = createServer(async (req, res) => {
  let p = req.url.split('?')[0].split('#')[0];
  if (p === '/' || p === '') p = '/index.html';
  try {
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(await readFile(join(ROOT, 'index.html')));
  }
});
await new Promise((r) => server.listen(PORT, r));

const P1 = { id: 'P1', shop_id: SHOP, name: 'Nước mắm 500ml', sku: 'NM500', unit: 'chai', price: 30000, cost: 25000, stock: 10, active: true };
const P2 = { id: 'P2', shop_id: SHOP, name: 'Đường 1kg', sku: 'DG1', unit: 'gói', price: 18000, cost: 14000, stock: 5, active: true };
const PRODUCTS = [P1, P2];

const NOTE = {
  id: 'RN1', shop_id: SHOP, code: 'PN-260928-A1', supplier_name: 'NCC A',
  total: 75000, paid: false, note: null,
  items: [{ product_id: 'P1', name: 'Nước mắm 500ml', qty: 3, cost: 25000 }],
  created_at: '2026-09-28T02:00:00Z',
};
const COUNT = {
  id: 'SC1', shop_id: SHOP, code: 'KK-260928-A1', status: 'draft', total_diff: 2, note: null,
  created_by: 'Test', created_at: '2026-09-28T01:00:00Z', completed_at: null,
  items: [{ product_id: 'P1', name: 'Nước mắm 500ml', sku: 'NM500', system_qty: 10, counted_qty: 12, diff: 2 }],
};
const HISTORY = [
  { action: 'create', actor_id: USER, before: null, after: { code: NOTE.code }, created_at: '2026-09-28T02:00:00Z' },
];

const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ---- tracker ----
const hits = {
  invApply: [], invReverse: [], invComplete: null, invHistory: 0,
  productPatches: [], receivedDelete: 0, receivedPost: null,
  countPatch: null, transferPost: null,
};
let fallbackMode = false;

await ctx.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const segments = url.pathname.split('/');
  const table = segments[segments.length - 1];
  const method = req.method();

  if (table === 'profiles') {
    if (method === 'GET') return route.fulfill(json([{ id: USER, full_name: 'Test', role: 'owner', shop_id: SHOP }]));
    return route.fulfill(json({ id: USER, shop_id: SHOP }));
  }
  if (table === 'shops') {
    if (method === 'GET') return route.fulfill(json([{ id: SHOP, name: 'PioPio Store', owner_id: USER }]));
    return route.fulfill(json({ id: SHOP, name: 'PioPio Store', owner_id: USER }));
  }
  if (segments.includes('rpc')) {
    if (fallbackMode) {
      return route.fulfill(json({ code: 'PGRST202', message: `Could not find the function ${table} in the schema cache`, details: null, hint: null }, 404));
    }
    const body = req.postDataJSON() ?? {};
    if (table === 'inv_apply_note') { hits.invApply.push(body); return route.fulfill(json(true)); }
    if (table === 'inv_reverse_note') { hits.invReverse.push(body); return route.fulfill(json(true)); }
    if (table === 'inv_complete_stockcount') {
      hits.invComplete = body;
      return route.fulfill(json({
        already: false, changed: true, total_diff: 2,
        items: [{ product_id: 'P1', name: 'Nước mắm 500ml', system_qty: 10, counted_qty: 12, diff: 2 }],
      }));
    }
    if (table === 'inv_history') { hits.invHistory++; return route.fulfill(json(HISTORY)); }
    return route.fulfill(json(null));
  }

  if (table === 'products') {
    if (method === 'GET') {
      const idEq = url.searchParams.get('id');
      if (idEq?.startsWith('eq.')) {
        const row = PRODUCTS.find((p) => p.id === idEq.slice(3));
        return route.fulfill(json(row ? [row] : []));
      }
      return route.fulfill(json(PRODUCTS));
    }
    if (method === 'PATCH') {
      const body = req.postDataJSON();
      hits.productPatches.push(body);
      return route.fulfill(json([body]));
    }
    return route.fulfill(json([{}]));
  }
  if (table === 'received_notes') {
    if (method === 'POST') { hits.receivedPost = req.postDataJSON(); return route.fulfill(json({ ...NOTE, id: 'RN-NEW', code: 'PN-260928-B2' }, 201)); }
    if (method === 'DELETE') { hits.receivedDelete++; return route.fulfill(json([], 200)); }
    return route.fulfill(json([NOTE]));
  }
  if (table === 'stock_counts') {
    if (method === 'PATCH') {
      hits.countPatch = req.postDataJSON();
      return route.fulfill(json([{ ...COUNT, ...hits.countPatch }]));
    }
    return route.fulfill(json([COUNT]));
  }
  if (table === 'transfers') {
    if (method === 'POST') {
      hits.transferPost = req.postDataJSON();
      return route.fulfill(json({ id: 'TR-NEW', code: 'CH-260928-A1', shop_id: SHOP }, 201));
    }
    return route.fulfill(json([]));
  }
  if (method === 'GET' || method === 'HEAD') return route.fulfill(json([]));
  return route.fulfill(json({}, 201));
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, email: 'piopio.test01@isale.online', role: 'authenticated' })}.fakesig`;
const session = { access_token: fakeJwt, token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake', user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'piopio.test01@isale.online', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Test' }, created_at: new Date().toISOString() } };
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-ndsrwpsdqmsbclverbpm-auth-token`, JSON.stringify(session)]);

const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const activePage = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};
const results = [];
const assert = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

// ================= 1) received-notes: danh sách + lịch sử =================
await page.goto(`${BASE}/#/received-note`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
r1: {
  const info = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    return {
      items: Array.from(active.querySelectorAll('ion-item h3')).map((h) => h.textContent?.trim() ?? ''),
      histBtn: !!active.querySelector('ion-item ion-button ion-icon[name="time-outline"]'),
    };
  });
  assert('1a. Danh sách phiếu nhập hiển thị', info.items.includes('PN-260928-A1'), info.items.join(', '));
  assert('1b. Nút lịch sử (time-outline) có trên dòng phiếu', info.histBtn);

  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    active.querySelector('ion-item ion-button ion-icon[name="time-outline"]')?.closest('ion-button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  const alert = await page.evaluate(() => {
    const a = document.querySelector('ion-alert');
    return { open: !!a, header: a?.querySelector('h2')?.textContent?.trim() ?? '', msg: a?.querySelector('.alert-message')?.textContent?.trim() ?? '' };
  });
  assert('1c. Alert lịch sử mở + đúng phiếu', alert.open && alert.header.includes('PN-260928-A1'), JSON.stringify(alert));
  assert('1d. Lịch sử có dòng "Tạo phiếu"', alert.msg.includes('Tạo phiếu'), alert.msg.slice(0, 80));
  await page.evaluate(() => document.querySelector('ion-alert button')?.click());
  await page.waitForTimeout(600);
}

// ================= 2) Xoá phiếu nhập → inv_reverse_note, KHÔNG PATCH products =================
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('ion-item')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('ion-alert button'));
  btns.find((b) => (b.textContent ?? '').trim() === 'Xóa')?.click();
});
await page.waitForTimeout(1500);
assert('2a. DELETE received_notes gọi đúng 1 lần', hits.receivedDelete === 1);
assert('2b. inv_reverse_note được gọi với ref đúng', hits.invReverse.length === 1 && hits.invReverse[0].p_ref_type === 'received_note' && hits.invReverse[0].p_ref_id === 'RN1', JSON.stringify(hits.invReverse));
assert('2c. Không PATCH products (ledger lo tồn)', hits.productPatches.length === 0, JSON.stringify(hits.productPatches));

// ================= 3) Chốt kiểm kê → re-base server, PATCH items mới =================
await page.goto(`${BASE}/#/stock-check/SC1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('ion-button[color="success"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('ion-alert button'));
  btns.find((b) => (b.textContent ?? '').trim() === 'Hoàn tất')?.click();
});
await page.waitForTimeout(2000);
assert('3a. inv_complete_stockcount gọi với phiếu + items đếm', !!hits.invComplete && hits.invComplete.p_count_id === 'SC1' && hits.invComplete.p_items?.[0]?.counted_qty === 12, JSON.stringify(hits.invComplete));
assert('3b. PATCH stock_counts: completed + items re-based (diff=2)', !!hits.countPatch && hits.countPatch.status === 'completed' && hits.countPatch.items?.[0]?.diff === 2 && hits.countPatch.items?.[0]?.system_qty === 10, JSON.stringify(hits.countPatch));
assert('3c. Không PATCH products khi chốt kiểm kê (ledger lo tồn)', hits.productPatches.length === 0);

// ================= 4) Transfer → inv_apply_note('transfer_out'), không PATCH products =================
hits.productPatches = [];
await page.goto(`${BASE}/#/transfer/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const sel = Array.from(active.querySelectorAll('ion-select')).find((s) => (s.getAttribute('ng-reflect-placeholder') ?? '').includes('Chọn sản phẩm')) ?? active.querySelector('ion-select');
  sel?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'P1' } }));
});
await page.waitForTimeout(800);
{
  const items = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    return Array.from(active.querySelectorAll('.draft-name')).map((d) => d.textContent?.trim() ?? '');
  });
  assert('4a. Chọn SP trong phiếu chuyển', items.includes('Nước mắm 500ml'), items.join(', '));
}
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('ion-button')).find((b) => (b.textContent ?? '').includes('Lưu phiếu chuyển'));
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(2500);
assert('4b. POST transfers', !!hits.transferPost && hits.transferPost.code?.startsWith('CH-'), JSON.stringify(hits.transferPost));
assert('4c. inv_apply_note transfer_out đúng ref + qty dương (dấu do server quyết)', hits.invApply.length === 1 && hits.invApply[0].p_ref_type === 'transfer_out' && hits.invApply[0].p_items?.[0]?.qty === 1, JSON.stringify(hits.invApply));
assert('4d. Không PATCH products khi chuyển kho (ledger lo tồn)', hits.productPatches.length === 0, JSON.stringify(hits.productPatches));

// ================= 5) FALLBACK: v27 chưa chạy (PGRST202) → legacy client-side =================
fallbackMode = true;
hits.productPatches = [];
hits.invApply = [];
await page.goto(`${BASE}/#/transfer/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const sel = Array.from(active.querySelectorAll('ion-select')).find((s) => (s.getAttribute('ng-reflect-placeholder') ?? '').includes('Chọn sản phẩm')) ?? active.querySelector('ion-select');
  sel?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'P1' } }));
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('ion-button')).find((b) => (b.textContent ?? '').includes('Lưu phiếu chuyển'));
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(2500);
assert('5a. Fallback: PATCH products đúng 1 dòng (legacy trừ tồn)', hits.productPatches.length === 1, JSON.stringify(hits.productPatches));
assert('5b. Fallback: không ném lỗi — phiếu vẫn tạo', !!hits.transferPost, 'transferPost=' + JSON.stringify(hits.transferPost));

// ================= tổng kết =================
const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
if (errors.length) console.log('Console errors:', errors.slice(0, 5));
await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
