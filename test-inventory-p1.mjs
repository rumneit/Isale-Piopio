// Smoke test: P1 Quy trình & Tiền — migration v28
//  - suppliers: danh sách + tổng nợ phải trả (sup_debts RPC)
//  - supplier-debts: danh sách nợ + quá hạn + trả tiền (sup_pay_debt, idempotent nonce)
//  - received-note/add: chọn NCC + trả trước + hạn thanh toán → tạo supplier_debt phần chưa trả
//  - transfer/add: inv_create_transfer (atomic — 1 call, không POST riêng, không PATCH products)
//  - transfer/receive/:id — đối soát nhận hàng, hao hụt → inv_receive_transfer
//  - fallback (v28 chưa chạy): received-note gửi payload cũ, transfer legacy, trang NCC rỗng
// REST Supabase được mock qua page.route. Chạy: node test-inventory-p1.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const ROOT = join(process.cwd(), 'www');
const PORT = 8353;
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
const PRODUCTS = [P1];

const SUPPLIERS = [
  { id: 'S1', shop_id: SHOP, name: 'NCC A', phone: '0901112222', note: null, created_at: '2026-09-01T00:00:00Z' },
  { id: 'S2', shop_id: SHOP, name: 'NCC B', phone: null, note: 'Giao thứ 2', created_at: '2026-09-02T00:00:00Z' },
];

const DEBTS = [
  { id: 'D1', supplier_id: 'S1', supplier_name: 'NCC A', supplier_phone: '0901112222', received_note_id: 'RN1', received_code: 'PN-260928-A1', amount: 75000, paid_amount: 35000, remaining: 40000, due_date: '2026-09-01', status: 'partial', note: null, created_at: '2026-09-28T00:00:00Z' },
  { id: 'D2', supplier_id: 'S2', supplier_name: 'NCC B', supplier_phone: null, received_note_id: null, received_code: null, amount: 120000, paid_amount: 0, remaining: 120000, due_date: '2026-12-30', status: 'open', note: null, created_at: '2026-09-27T00:00:00Z' },
];

const PAYMENTS = [
  { id: 'TX-1', amount: 35000, occurred_at: '2026-09-28T02:30:00Z', note: 'Trả trước 35k', account_id: 'ACC1' },
];

const TR1 = {
  id: 'TR1', shop_id: SHOP, code: 'CH-260928-A1', destination: 'Kho phụ Q7',
  items: [{ product_id: 'P1', name: 'Nước mắm 500ml', qty: 10 }],
  note: null, status: 'in_transit', created_at: '2026-09-28T01:00:00Z',
};

const NOTE2 = {
  id: 'RN-NEW', shop_id: SHOP, code: 'PN-260928-B2', supplier_name: 'NCC A', total: 75000,
  paid: false, note: null, items: [{ product_id: 'P1', name: 'Nước mắm 500ml', qty: 3, cost: 25000 }],
  created_at: '2026-09-28T02:00:00Z',
};

const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ---- tracker ----
const hits = {
  invCreateTransfer: null, invReceiveTransfer: null, invApply: [],
  supDebts: 0, supPay: null, supPayments: 0,
  receivedPost: null, debtPost: null, txnPost: null, transferPost: null,
  productPatches: [], supplierPost: null,
};
let fallbackMode = false;      // RPC → PGRST202
let fallbackColumns = false;   // received_notes chưa có cột v28 (probe lỗi)

await ctx.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const segments = url.pathname.split('/');
  const table = segments[segments.length - 1];
  const method = req.method();
  const accept = req.headers()['accept'] ?? '';

  if (table === 'profiles') {
    if (method === 'GET') return route.fulfill(json([{ id: USER, full_name: 'Test', role: 'owner', shop_id: SHOP }]));
    return route.fulfill(json({ id: USER, shop_id: SHOP }));
  }
  if (table === 'shops') {
    return route.fulfill(json([{ id: SHOP, name: 'PioPio Store', owner_id: USER }]));
  }

  if (segments.includes('rpc')) {
    if (fallbackMode) {
      return route.fulfill(json({ code: 'PGRST202', message: `Could not find the function ${table} in the schema cache`, details: null, hint: null }, 404));
    }
    const body = req.postDataJSON() ?? {};
    if (table === 'inv_create_transfer') { hits.invCreateTransfer = body; return route.fulfill(json('TR-NEW-2')); }
    if (table === 'inv_receive_transfer') { hits.invReceiveTransfer = body; return route.fulfill(json({ already: false, items: [{ product_id: 'P1', qty_sent: 10, qty_received: 8, loss: 2 }], losses: [{ product_id: 'P1', qty: 2, reason: 'other' }] })); }
    if (table === 'inv_apply_note') { hits.invApply.push(body); return route.fulfill(json(true)); }
    if (table === 'sup_debts') { hits.supDebts++; return route.fulfill(json(DEBTS)); }
    if (table === 'sup_pay_debt') { hits.supPay = body; return route.fulfill(json('TX-NEW')); }
    if (table === 'sup_debt_payments') { hits.supPayments++; return route.fulfill(json(PAYMENTS)); }
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
    if (method === 'PATCH') { hits.productPatches.push(req.postDataJSON()); return route.fulfill(json([req.postDataJSON()])); }
    return route.fulfill(json([{}]));
  }

  if (table === 'suppliers') {
    if (method === 'GET') {
      if (fallbackMode) return route.fulfill(json({ code: '42P01', message: 'relation "public.suppliers" does not exist' }, 404));
      return route.fulfill(json(SUPPLIERS));
    }
    if (method === 'POST') { hits.supplierPost = req.postDataJSON(); return route.fulfill(json({ id: 'S-NEW', shop_id: SHOP, name: hits.supplierPost?.name ?? 'X', phone: null, note: null }, 201)); }
    return route.fulfill(json([{}], 200));
  }

  if (table === 'supplier_debts') {
    if (method === 'POST') {
      if (fallbackColumns) return route.fulfill(json({ code: '42P01', message: 'relation "public.supplier_debts" does not exist' }, 404));
      hits.debtPost = req.postDataJSON();
      return route.fulfill(json({ id: 'D-NEW' }, 201));
    }
    return route.fulfill(json([]));
  }

  if (table === 'received_notes') {
    if (method === 'POST') { hits.receivedPost = req.postDataJSON(); return route.fulfill(json(NOTE2, 201)); }
    if (method === 'GET') {
      if (fallbackColumns && (url.searchParams.get('select') ?? '').includes('paid_amount')) {
        return route.fulfill(json({ code: '42703', message: 'column received_notes.paid_amount does not exist' }, 400));
      }
      return route.fulfill(json([]));
    }
    return route.fulfill(json([]));
  }

  if (table === 'transactions') {
    if (method === 'POST') { hits.txnPost = req.postDataJSON(); return route.fulfill(json({ id: 'TXN-NEW' }, 201)); }
    return route.fulfill(json([]));
  }

  if (table === 'transfers') {
    if (method === 'POST') { hits.transferPost = req.postDataJSON(); return route.fulfill(json({ id: 'TR-NEW', code: 'CH-260928-B1', shop_id: SHOP }, 201)); }
    if (method === 'GET' && accept.includes('vnd.pgrst.object')) return route.fulfill(json(TR1));
    return route.fulfill(json([TR1]));
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

const activeRoot = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};
const results = [];
const assert = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const typeInto = async (selector, value) => {
  await page.evaluate(([sel, val]) => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const ion = Array.from(active.querySelectorAll(sel))[0];
    if (!ion) return;
    const native = ion.shadowRoot?.querySelector('input') ?? ion.querySelector('input');
    if (native) {
      native.value = val;
      native.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ion.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: val } }));
  }, [selector, value]);
  await page.waitForTimeout(400);
};
// Chọn option trong ion-select có [(ngModel)] bằng REAL click (synthetic ionChange
// không cập nhật ngModel — đã kiểm chứng Ionic 8)
const selectByActionSheet = async (selectLocator, optionText) => {
  await selectLocator.first().click();
  await page.waitForTimeout(1200);
  await page.locator('ion-action-sheet .action-sheet-button', { hasText: optionText }).first().click();
  await page.waitForTimeout(1000);
};
const clickByText = async (text) => {
  await page.evaluate((t) => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const btn = Array.from(active.querySelectorAll('ion-button')).find((b) => (b.textContent ?? '').includes(t));
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, text);
  await page.waitForTimeout(1200);
};
const alertClick = async (text) => {
  await page.evaluate((t) => {
    const btns = Array.from(document.querySelectorAll('ion-alert button'));
    btns.find((b) => (b.textContent ?? '').trim() === t)?.click();
  }, text);
  await page.waitForTimeout(1500);
};

// ================= 1) Trang Nhà cung cấp: danh sách + tổng nợ =================
await page.goto(`${BASE}/#/suppliers`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
{
  const info = await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    return {
      names: Array.from(active.querySelectorAll('ion-item h3')).map((h) => h.textContent?.trim() ?? ''),
      badges: Array.from(active.querySelectorAll('ion-item ion-badge')).map((b) => b.textContent?.trim() ?? ''),
      total: Array.from(active.querySelectorAll('.total-box strong')).map((s) => s.textContent?.trim() ?? ''),
    };
  });
  assert('1a. Danh sách NCC hiển thị', info.names.includes('NCC A') && info.names.includes('NCC B'), info.names.join(', '));
  assert('1b. Badge nợ còn lại trên NCC A', info.badges.some((b) => b.includes('40.000')), info.badges.join(' | '));
  assert('1c. Tổng nợ phải trả = 160.000', info.total.some((t) => t.includes('160.000')), info.total.join(' | '));
}

// ================= 2) Trang Công nợ NCC: list + quá hạn + trả tiền =================
await page.goto(`${BASE}/#/supplier-debts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
{
  const info = await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    return {
      items: Array.from(active.querySelectorAll('ion-item h3')).map((h) => h.textContent?.trim() ?? ''),
      segment: Array.from(active.querySelectorAll('ion-segment-button')).map((s) => s.textContent?.trim() ?? ''),
      hasPay: Array.from(active.querySelectorAll('ion-button')).some((b) => (b.textContent ?? '').includes('Trả')),
    };
  });
  assert('2a. Khoản nợ NCC A hiển thị đúng số còn lại', info.items.some((i) => i.includes('NCC A') && i.includes('40.000')), info.items.join(' | '));
  assert('2b. Segments Tất cả / Quá hạn (1)', info.segment.some((s) => s.includes('Quá hạn') && s.includes('(1)')), info.segment.join(' | '));
  assert('2c. Nút Trả có trên dòng nợ', info.hasPay);

  await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    const btn = Array.from(active.querySelectorAll('ion-item ion-button')).find((b) => (b.textContent ?? '').includes('Trả'));
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  const alertOpen = await page.evaluate(() => !!document.querySelector('ion-alert'));
  assert('2d. Alert trả nợ mở (số tiền = còn lại)', alertOpen);
  await alertClick('Xác nhận trả');
}
assert('2e. sup_pay_debt gọi đúng khoản + đủ tiền còn lại + có nonce', !!hits.supPay && hits.supPay.p_debt_id === 'D1' && hits.supPay.p_amount === 40000 && !!hits.supPay.p_nonce, JSON.stringify(hits.supPay));

// ================= 3) Nhập hàng: chọn NCC + trả trước + hạn → tạo công nợ =================
await page.goto(`${BASE}/#/received-note/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
{
  const hasSupplierSelect = await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    const selects = Array.from(active.querySelectorAll('ion-select'));
    return selects.some((s) => s.getAttribute('label') === 'Nhà cung cấp');
  });
  assert('3a. Form có select NCC (v28 sẵn)', hasSupplierSelect);

  // chọn NCC A (real click qua action-sheet — synthetic ionChange không cập nhật ngModel)
  await selectByActionSheet(page.locator('ion-select[label="Nhà cung cấp"]'), 'NCC A');

  // thêm SP (select sản phẩm dùng (ionChange) output — synthetic hoạt động)
  await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    const sel = Array.from(active.querySelectorAll('ion-select')).find((s) => (s.getAttribute('placeholder') ?? '').includes('Chọn sản phẩm'));
    sel?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'P1' } }));
  });
  await page.waitForTimeout(600);

  // tắt "Đã trả đủ" (real click toggle)
  await page.locator('ion-toggle').last().click();
  await page.waitForTimeout(800);
  const payInputs = await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    const labels = Array.from(active.querySelectorAll('ion-input')).map((i) => i.getAttribute('label') ?? '');
    return { paid: labels.some((l) => l.includes('Đã trả trước')), due: labels.some((l) => l.includes('Hạn thanh toán')) };
  });
  assert('3b. Bỏ trả đủ → hiện "Đã trả trước" + "Hạn thanh toán"', payInputs.paid && payInputs.due, JSON.stringify(payInputs));

  await typeInto('ion-input[label="Đã trả trước"]', '15000');
  await typeInto('ion-input[label="Hạn thanh toán"]', '2026-10-15');

  await clickByText('Lưu phiếu nhập');
}
// qty 1 × 25.000 = tổng 25.000; trả trước 15.000 → nợ 10.000
assert('3c. POST received_notes có supplier_id/paid_amount/due_date', !!hits.receivedPost && hits.receivedPost.supplier_id === 'S1' && Number(hits.receivedPost.paid_amount) === 15000 && hits.receivedPost.due_date === '2026-10-15' && Number(hits.receivedPost.total) === 25000, JSON.stringify(hits.receivedPost));
assert('3d. Tạo supplier_debt phần chưa trả 10.000', !!hits.debtPost && Number(hits.debtPost.amount) === 10000 && hits.debtPost.supplier_id === 'S1' && hits.debtPost.received_note_id === 'RN-NEW', JSON.stringify(hits.debtPost));
assert('3e. Giao dịch chi chỉ với phần ĐÃ TRẢ (15.000)', !!hits.txnPost && Number(hits.txnPost.amount) === 15000, JSON.stringify(hits.txnPost));
assert('3f. inv_apply_note gọi (tồn qua ledger)', hits.invApply.length === 1 && hits.invApply[0].p_ref_type === 'received_note', JSON.stringify(hits.invApply));

// ================= 4) FALLBACK: v28 chưa chạy → payload cũ, không đụng bảng mới =================
fallbackMode = true;
fallbackColumns = true;
hits.receivedPost = null; hits.debtPost = null; hits.txnPost = null; hits.invApply = []; hits.productPatches = [];
await page.goto(`${BASE}/#/received-note/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.reload(); // detectDebtColumns cache theo singleton — phải boot lại app
await page.waitForTimeout(5000);
{
  // không có suppliers → chế độ nhập tay (input label="Nhà cung cấp")
  await typeInto('ion-input[label="Nhà cung cấp"]', 'NCC tay');
  await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    const sel = Array.from(active.querySelectorAll('ion-select')).find((s) => (s.getAttribute('placeholder') ?? '').includes('Chọn sản phẩm'));
    sel?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'P1' } }));
  });
  await page.waitForTimeout(600);
  await clickByText('Lưu phiếu nhập');
}
assert('4a. Fallback: POST payload CŨ (không có cột v28)', !!hits.receivedPost && !('supplier_id' in hits.receivedPost) && !('paid_amount' in hits.receivedPost) && !('due_date' in hits.receivedPost) && hits.receivedPost.supplier_name === 'NCC tay', JSON.stringify(hits.receivedPost));
assert('4b. Fallback: không tạo supplier_debt', hits.debtPost === null);
assert('4c. Fallback: phiếu vẫn tạo + tồn cộng qua applyNote legacy-PGRST202 → PATCH products', hits.productPatches.length === 1, JSON.stringify(hits.productPatches));

// ================= 5) Transfer/add: inv_create_transfer atomic (v28) =================
fallbackMode = false;
fallbackColumns = false;
hits.invCreateTransfer = null; hits.transferPost = null; hits.productPatches = [];
await page.goto(`${BASE}/#/transfer/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
  const sel = Array.from(active.querySelectorAll('ion-select')).find((s) => (s.getAttribute('placeholder') ?? '').includes('Chọn sản phẩm'));
  sel?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'P1' } }));
});
await page.waitForTimeout(800);
await clickByText('Lưu phiếu chuyển');
assert('5a. inv_create_transfer gọi 1 lần với items đúng', !!hits.invCreateTransfer && hits.invCreateTransfer.p_items?.[0]?.product_id === 'P1' && hits.invCreateTransfer.p_items?.[0]?.qty === 1, JSON.stringify(hits.invCreateTransfer));
assert('5b. KHÔNG POST transfers riêng (atomic)', hits.transferPost === null);
assert('5c. KHÔNG PATCH products (server lo)', hits.productPatches.length === 0);

// ================= 6) Nhận hàng in-transit: đối soát + hao hụt =================
hits.invReceiveTransfer = null;
await page.goto(`${BASE}/#/transfer/receive/TR1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
{
  const info = await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    return {
      code: active.querySelector('.app-card-title h4')?.textContent?.trim() ?? '',
      lines: Array.from(active.querySelectorAll('ion-item .line-name h3')).map((h) => h.textContent?.trim() ?? ''),
      bad: (active.textContent ?? '').includes('không ở trạng thái'),
    };
  });
  assert('6a. Trang nhận hàng mở phiếu đang đi', info.code.includes('CH-260928-A1') && info.lines.includes('Nước mắm 500ml') && !info.bad, JSON.stringify(info));

  // nhận thiếu: 10 → 8
  await typeInto('ion-input.line-qty', '8');
  const lossBadge = await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    return Array.from(active.querySelectorAll('ion-badge')).map((b) => b.textContent?.trim() ?? '').join(' | ');
  });
  assert('6b. Hao hụt hiện "Hụt 2" + form lý do xuất hiện', lossBadge.includes('Hụt 2'), lossBadge);

  // lý do = other → phải ghi chú
  await typeInto('ion-input[label="Mô tả lý do *"]', 'Xe lật hàng');
  await clickByText('Xác nhận đã nhận hàng');
  await alertClick('Xác nhận');
}
assert('6c. inv_receive_transfer đúng phiếu + qty_received 8 + resolution', !!hits.invReceiveTransfer && hits.invReceiveTransfer.p_transfer_id === 'TR1' && Number(hits.invReceiveTransfer.p_items?.[0]?.qty_received) === 8 && hits.invReceiveTransfer.p_resolution === 'write_off' && hits.invReceiveTransfer.p_reason_note === 'Xe lật hàng', JSON.stringify(hits.invReceiveTransfer));

// ================= 7) FALLBACK RPC: trang NCC rỗng nhưng không vỡ =================
fallbackMode = true;
await page.goto(`${BASE}/#/suppliers`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
{
  const empty = await page.evaluate(() => {
    const pages = Array.from(document.querySelector('#main-content')?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? document.querySelector('#main-content');
    return (active.textContent ?? '').includes('Chưa có nhà cung cấp');
  });
  assert('7a. v28 chưa chạy: trang NCC hiện empty-state, không lỗi', empty);
}

// ================= tổng kết =================
const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
if (errors.length) console.log('Console errors:', errors.slice(0, 5));
await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
