// Smoke test: P1b Maker-checker + Partial receipt — migration v29
//  - received-note/add: owner tạo phiếu nhập thiếu (qty_ordered > qty) → status='partial' + ledger
//  - received-note/add: staff tạo phiếu → status='pending' (KHÔNG gọi inv_apply_note/txn/debt)
//  - received-notes list: segments Chờ duyệt / Chờ nhập thêm + badge trạng thái
//  - Duyệt phiếu pending → inv_approve_note (p_note_id + p_nonce)
//  - Từ chối phiếu pending → inv_reject_note (p_note_id + p_reason)
//  - "Nhập tiếp phần thiếu" (continue): prefill từ inv_open_receive_notes + parent_id trong payload
//  - fallback v29 chưa chạy: probe lỗi → POST không có status/parent_id/created_by; ghi ngay như cũ
// REST Supabase mock qua page.route. Chạy: node test-inventory-p1b.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const ROOT = join(process.cwd(), 'www');
const PORT = 8354;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const SHOP = '11111111-1111-1111-1111-111111111111';
const OWNER = '00000000-0000-4000-8000-000000000001';
const STAFF = '00000000-0000-4000-8000-000000000002';

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
];

// Phiếu chờ duyệt do staff tạo
const PENDING_NOTE = {
  id: 'RN-PEND', shop_id: SHOP, code: 'PN-260928-P1', supplier_name: 'NCC A', total: 75000,
  paid: false, note: null, paid_amount: 0, due_date: null, supplier_id: 'S1',
  status: 'pending', parent_id: null, created_by: STAFF,
  items: [{ product_id: 'P1', name: 'Nước mắm 500ml', qty: 3, cost: 25000 }],
  created_at: '2026-09-28T03:00:00Z',
};
// Phiếu đã nhập thiếu (partial) — gốc của chuỗi "nhập tiếp"
const PARTIAL_NOTE = {
  id: 'RN-PART', shop_id: SHOP, code: 'PN-260928-A1', supplier_name: 'NCC A', total: 125000,
  paid: true, note: null, paid_amount: 125000, due_date: null, supplier_id: 'S1',
  status: 'partial', parent_id: null, created_by: OWNER,
  items: [{ product_id: 'P1', name: 'Nước mắm 500ml', qty: 3, cost: 25000, qty_ordered: 5 }],
  created_at: '2026-09-28T01:00:00Z',
};
const COMPLETED_NOTE = {
  id: 'RN-DONE', shop_id: SHOP, code: 'PN-260928-D1', supplier_name: null, total: 50000,
  paid: true, note: null, paid_amount: 50000, due_date: null, supplier_id: null,
  status: 'completed', parent_id: null, created_by: OWNER,
  items: [{ product_id: 'P1', name: 'Nước mắm 500ml', qty: 2, cost: 25000 }],
  created_at: '2026-09-28T00:00:00Z',
};

// RPC inv_open_receive_notes trả 1 phiếu còn thiếu hàng
const OPEN_NOTES = [{
  root_id: 'RN-PART', root_code: 'PN-260928-A1', supplier_name: 'NCC A', supplier_id: 'S1',
  created_at: '2026-09-28T01:00:00Z',
  outstanding_items: [{ product_id: 'P1', name: 'Nước mắm 500ml', qty_ordered: 5, qty: 3, outstanding: 2, cost: 25000 }],
}];

const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// ---- tracker ----
const hits = {
  invApply: [], txnPost: null, debtPost: null, receivedPost: null,
  invApprove: null, invReject: null, invOpenNotes: 0,
};
let fallbackMode = false;       // RPC → PGRST202
let fallbackColumns = false;    // received_notes chưa có cột v29 (probe lỗi)
let currentRole = 'owner';      // đổi giữa owner/staff qua reset session

await ctx.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const segments = url.pathname.split('/');
  const table = segments[segments.length - 1];
  const method = req.method();
  const accept = req.headers()['accept'] ?? '';

  if (table === 'profiles') {
    if (method === 'GET') {
      // profile động theo currentRole: owner (can approve) / staff (chỉ quyền kho, KHÔNG có inventory_approve)
      const role = currentRole;
      const uid = role === 'owner' ? OWNER : STAFF;
      const permissions = role === 'owner' ? {} : { inventory: true, sell: true, crm: true };
      return route.fulfill(json([{ id: uid, full_name: role === 'owner' ? 'Chủ shop' : 'Nhân viên', role, shop_id: SHOP, permissions }]));
    }
    return route.fulfill(json({ id: OWNER, shop_id: SHOP }));
  }
  if (table === 'shops') {
    return route.fulfill(json([{ id: SHOP, name: 'PioPio Store', owner_id: OWNER }]));
  }

  if (segments.includes('rpc')) {
    if (fallbackMode) {
      return route.fulfill(json({ code: 'PGRST202', message: `Could not find the function ${table} in the schema cache`, details: null, hint: null }, 404));
    }
    const body = req.postDataJSON() ?? {};
    if (table === 'inv_apply_note') { hits.invApply.push(body); return route.fulfill(json(true)); }
    if (table === 'inv_approve_note') { hits.invApprove = body; return route.fulfill(json({ status: 'completed', total: 75000, paid: 0, remaining: 75000 })); }
    if (table === 'inv_reject_note') { hits.invReject = body; return route.fulfill(json({ status: 'cancelled' })); }
    if (table === 'inv_open_receive_notes') { hits.invOpenNotes++; openNotesCalls++; return route.fulfill(json(OPEN_NOTES)); }
    if (table === 'inv_history') return route.fulfill(json([]));
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
    if (method === 'PATCH') return route.fulfill(json([req.postDataJSON()]));
    return route.fulfill(json([{}]));
  }
  if (table === 'suppliers') {
    if (method === 'GET') return route.fulfill(json(SUPPLIERS));
    return route.fulfill(json([{}], 200));
  }
  if (table === 'supplier_debts') {
    if (method === 'POST') { hits.debtPost = req.postDataJSON(); return route.fulfill(json({ id: 'D-NEW' }, 201)); }
    return route.fulfill(json([]));
  }
  if (table === 'received_notes') {
    if (method === 'POST') {
      hits.receivedPost = req.postDataJSON();
      const id = 'RN-NEW-' + Math.random().toString(36).slice(2, 6);
      return route.fulfill(json({ ...hits.receivedPost, id, shop_id: SHOP, code: 'PN-260928-X1', items: hits.receivedPost.items ?? [], created_at: new Date().toISOString() }, 201));
    }
    if (method === 'GET') {
      const sel = url.searchParams.get('select') ?? '';
      if (fallbackColumns && sel.includes('status')) {
        return route.fulfill(json({ code: '42703', message: 'column received_notes.status does not exist' }, 400));
      }
      if (sel.includes('status') || accept.includes('vnd.pgrst.object')) {
        // trả list đầy đủ khi list() gọi select('*')
        return route.fulfill(json([PENDING_NOTE, PARTIAL_NOTE, COMPLETED_NOTE]));
      }
      return route.fulfill(json([PENDING_NOTE, PARTIAL_NOTE, COMPLETED_NOTE]));
    }
    if (method === 'DELETE') return route.fulfill(json([], 204));
    return route.fulfill(json([]));
  }
  if (table === 'transactions') {
    if (method === 'POST') { hits.txnPost = req.postDataJSON(); return route.fulfill(json({ id: 'TXN-NEW' }, 201)); }
    return route.fulfill(json([]));
  }
  if (method === 'GET' || method === 'HEAD') return route.fulfill(json([]));
  return route.fulfill(json({}, 201));
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const makeSession = (uid) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, email: uid === OWNER ? 'piopio.test01@isale.online' : 'staff.test@isale.online', role: 'authenticated' })}.fakesig`;
const session = (uid) => ({ access_token: makeSession(uid), token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake', user: { id: uid, aud: 'authenticated', role: 'authenticated', email: uid === OWNER ? 'piopio.test01@isale.online' : 'staff.test@isale.online', app_metadata: { provider: 'email' }, user_metadata: { full_name: uid === OWNER ? 'Chủ shop' : 'Nhân viên' }, created_at: new Date().toISOString() } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-ndsrwpsdqmsbclverbpm-auth-token`, JSON.stringify(session(OWNER))]);

const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

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
    if (native) { native.value = val; native.dispatchEvent(new Event('input', { bubbles: true })); }
    ion.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: val } }));
  }, [selector, value]);
  await page.waitForTimeout(400);
};
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
// Đổi role: profile mock trả role tương ứng; reload để app nạp lại profile.
// (Session JWT luôn là OWNER — addInitScript chạy lại mỗi navigation nên không đổi localStorage ở đây.)
const switchRole = async (role) => {
  currentRole = role;
  if (page.url() && page.url().startsWith(BASE)) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
  }
};

// Reset tracker (giữ nguyên openNotesCalls — tổng số lần RPC mở danh sách)
let openNotesCalls = 0;
const resetHits = () => { hits.invApply = []; hits.txnPost = null; hits.debtPost = null; hits.receivedPost = null; hits.invApprove = null; hits.invReject = null; };

// ================= 1) OWNER tạo phiếu nhập THIẾU (qty_ordered > qty) → status='partial' =================
currentRole = 'owner';
await page.goto(`${BASE}/#/received-note/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
resetHits();
{
  // chọn NCC A
  await selectByActionSheet(page.locator('ion-select[label="Nhà cung cấp"]'), 'NCC A');
  await page.waitForTimeout(500);
  // bật toggle "Đặt trước, nhận một phần"
  const toggleOn = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const tog = Array.from(active.querySelectorAll('ion-toggle')).find((t) => (t.textContent ?? '').includes('Đặt trước'));
    if (!tog) return false;
    if (!tog.checked) tog.click();
    return true;
  });
  await page.waitForTimeout(600);
  assert('1a. Toggle "Đặt trước" tồn tại và bật được', toggleOn);

  // chọn SP Nước mắm
  await selectByActionSheet(page.locator('ion-select[placeholder*="Chọn sản phẩm"]'), 'Nước mắm 500ml');
  await page.waitForTimeout(500);
  // qty_ordered = 5, qty = 3
  await typeInto('ion-input.draft-qty', '5');   // input đầu tiên là qty_ordered (vì showQtyOrdered)
  // set qty (input thứ 2 trong dòng) = 3 — cần set trực tiếp
  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const rows = active.querySelectorAll('.draft-item');
    const row = rows[rows.length - 1];
    if (!row) return;
    const inputs = row.querySelectorAll('.draft-item-row ion-input.draft-qty');
    const qtyInput = inputs[inputs.length - 1]; // ô qty (số nhận) — dòng dưới
    if (qtyInput) {
      const native = qtyInput.shadowRoot?.querySelector('input') ?? qtyInput.querySelector('input');
      if (native) { native.value = '3'; native.dispatchEvent(new Event('input', { bubbles: true })); }
      qtyInput.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: '3' } }));
    }
  });
  await page.waitForTimeout(400);
  // Lưu
  await clickByText('Lưu phiếu nhập');
  await page.waitForTimeout(2000);
}
assert('1b. POST received_notes có status=partial (owner nhập thiếu)', !!hits.receivedPost && hits.receivedPost.status === 'partial', JSON.stringify({ status: hits.receivedPost?.status, parent: hits.receivedPost?.parent_id }));
assert('1c. POST có qty_ordered trong items', !!hits.receivedPost && Array.isArray(hits.receivedPost.items) && Number(hits.receivedPost.items[0]?.qty_ordered) > Number(hits.receivedPost.items[0]?.qty), JSON.stringify(hits.receivedPost?.items?.[0]));
assert('1d. inv_apply_note được gọi (ghi tồn ngay — owner)', hits.invApply.length === 1, 'apply=' + hits.invApply.length);
assert('1e. Giao dịch chi được ghi (paid_amount)', !!hits.txnPost, JSON.stringify(hits.txnPost?.amount));

// ================= 2) STAFF tạo phiếu → status='pending', KHÔNG ghi tồn/tiền/công nợ =================
await switchRole('staff');
resetHits();
await page.goto(`${BASE}/#/received-note/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(6000);
{
  // banner chờ duyệt
  const hasBanner = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    return !!active.querySelector('.pending-banner');
  });
  assert('2a. Banner "Chờ duyệt" hiện cho staff', hasBanner);

  await selectByActionSheet(page.locator('ion-select[placeholder*="Chọn sản phẩm"]'), 'Nước mắm 500ml');
  await page.waitForTimeout(500);
  await clickByText('Lưu phiếu nhập');
  await page.waitForTimeout(2000);
}
assert('2b. POST received_notes có status=pending (staff)', !!hits.receivedPost && hits.receivedPost.status === 'pending', JSON.stringify({ status: hits.receivedPost?.status }));
assert('2c. KHÔNG gọi inv_apply_note (pending)', hits.invApply.length === 0, 'apply=' + hits.invApply.length);
assert('2d. KHÔNG ghi giao dịch chi (pending)', hits.txnPost === null, JSON.stringify(hits.txnPost));
assert('2e. KHÔNG tạo công nợ NCC (pending)', hits.debtPost === null, JSON.stringify(hits.debtPost));
assert('2f. POST có created_by = user đang đăng nhập', !!hits.receivedPost && hits.receivedPost.created_by === OWNER, String(hits.receivedPost?.created_by));

// ================= 3) Danh sách: segments + badge + duyệt/từ chối =================
await switchRole('owner');
await page.goto(`${BASE}/#/received-note`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
{
  const info = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    return {
      segments: Array.from(active.querySelectorAll('ion-segment-button')).map((s) => (s.textContent ?? '').trim()),
      badges: Array.from(active.querySelectorAll('ion-item ion-badge')).map((b) => (b.textContent ?? '').trim()),
    };
  });
  assert('3a. Có 3 segment: Tất cả / Chờ duyệt / Chờ nhập thêm', info.segments.filter((s) => /Tất cả|Chờ duyệt|Chờ nhập thêm/.test(s)).length >= 3, info.segments.join(' | '));
  assert('3b. Badge "Chờ duyệt" hiện trên phiếu pending', info.badges.some((b) => b.includes('Chờ duyệt')), info.badges.join(' | '));
  assert('3c. Badge "Nhập thiếu" hiện trên phiếu partial', info.badges.some((b) => b.includes('Nhập thiếu')), info.badges.join(' | '));

  // vào segment Chờ duyệt
  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const seg = Array.from(active.querySelectorAll('ion-segment-button')).find((s) => (s.textContent ?? '').includes('Chờ duyệt'));
    seg?.click();
  });
  await page.waitForTimeout(1200);
  const pendingShown = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const codes = Array.from(active.querySelectorAll('ion-item h3')).map((h) => (h.textContent ?? '').trim());
    return codes.includes('PN-260928-P1');
  });
  assert('3d. Segment "Chờ duyệt" chỉ hiện phiếu pending', pendingShown);
}

// ================= 4) Duyệt phiếu pending → inv_approve_note =================
resetHits();
{
  // bấm vào phiếu pending trong segment Chờ duyệt
  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const item = Array.from(active.querySelectorAll('ion-item')).find((it) => {
      const h3 = it.querySelector('h3');
      return h3 && (h3.textContent ?? '').includes('PN-260928-P1');
    });
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  const alertOpen = await page.evaluate(() => !!document.querySelector('ion-alert'));
  assert('4a. Alert duyệt/từ chối mở', alertOpen);
  await alertClick('Duyệt phiếu');
  await page.waitForTimeout(2500);
}
assert('4b. inv_approve_note gọi đúng p_note_id + p_nonce', !!hits.invApprove && hits.invApprove.p_note_id === 'RN-PEND' && !!hits.invApprove.p_nonce, JSON.stringify(hits.invApprove));

// ================= 5) Từ chối phiếu pending → inv_reject_note =================
// (phiếu RN-PEND đã duyệt ở bước 4 nhưng mock list vẫn trả pending → test reject tiếp)
resetHits();
await page.goto(`${BASE}/#/received-note`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
{
  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const seg = Array.from(active.querySelectorAll('ion-segment-button')).find((s) => (s.textContent ?? '').includes('Chờ duyệt'));
    seg?.click();
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const item = Array.from(active.querySelectorAll('ion-item')).find((it) => {
      const h3 = it.querySelector('h3');
      return h3 && (h3.textContent ?? '').includes('PN-260928-P1');
    });
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(1500);
  await alertClick('Từ chối');
  await page.waitForTimeout(1500);
  // alert nhập lý do
  const reasonOpen = await page.evaluate(() => !!document.querySelector('ion-alert input'));
  if (reasonOpen) await alertClick('Từ chối');
  await page.waitForTimeout(2000);
}
assert('5a. inv_reject_note gọi đúng p_note_id', !!hits.invReject && hits.invReject.p_note_id === 'RN-PEND', JSON.stringify(hits.invReject));

// ================= 6) "Chờ nhập thêm": RPC open notes + nút Nhập tiếp + prefill + parent_id =================
resetHits();
await page.goto(`${BASE}/#/received-note`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
{
  // vào segment Chờ nhập thêm
  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const seg = Array.from(active.querySelectorAll('ion-segment-button')).find((s) => (s.textContent ?? '').includes('Chờ nhập thêm'));
    seg?.click();
  });
  await page.waitForTimeout(1500);
  const shortage = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const codes = Array.from(active.querySelectorAll('ion-item h3')).map((h) => (h.textContent ?? '').trim());
    const hasBtn = Array.from(active.querySelectorAll('ion-button')).some((b) => (b.textContent ?? '').includes('Nhập tiếp'));
    return { codes, hasBtn };
  });
  assert('6b. Phiếu thiếu PN-260928-A1 hiện trong "Chờ nhập thêm"', shortage.codes.includes('PN-260928-A1'), shortage.codes.join(' | '));
  assert('6c. Nút "Nhập tiếp" hiện', shortage.hasBtn);
  assert('6a. RPC inv_open_receive_notes được gọi', openNotesCalls >= 1, 'open=' + openNotesCalls);

  // bấm "Nhập tiếp"
  await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const btn = Array.from(active.querySelectorAll('ion-button')).find((b) => (b.textContent ?? '').includes('Nhập tiếp'));
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(3000);
}
// Kiểm đang ở form nhập tiếp với prefill + continue banner
{
  const info = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const title = active.querySelector('ion-title');
    const banner = !!active.querySelector('.continue-banner');
    const draftNames = Array.from(active.querySelectorAll('.draft-item-name')).map((d) => (d.textContent ?? '').trim());
    return { title: title?.textContent?.trim() ?? '', banner, draftNames };
  });
  assert('6d. Chuyển sang form "Nhập tiếp phần thiếu"', info.title.includes('Nhập tiếp'), info.title);
  assert('6e. Continue banner hiện', info.banner);
  assert('6f. Prefill SP Nước mắm (phần thiếu)', info.draftNames.includes('Nước mắm 500ml'), info.draftNames.join(' | '));

  // Lưu phiếu nhập tiếp
  resetHits();
  await clickByText('Lưu');
  await page.waitForTimeout(2500);
}
assert('6g. POST có parent_id = root phiếu thiếu', !!hits.receivedPost && hits.receivedPost.parent_id === 'RN-PART', String(hits.receivedPost?.parent_id));
assert('6h. POST items có qty_ordered = outstanding', !!hits.receivedPost && Array.isArray(hits.receivedPost.items) && Number(hits.receivedPost.items[0]?.qty_ordered) === 2, JSON.stringify(hits.receivedPost?.items?.[0]));

// ================= 7) Fallback v29 chưa chạy: probe lỗi → ghi ngay như cũ =================
fallbackColumns = true;
fallbackMode = true;
await switchRole('owner');
resetHits();
await page.goto(`${BASE}/#/received-note/add`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(5000);
{
  await selectByActionSheet(page.locator('ion-select[placeholder*="Chọn sản phẩm"]'), 'Nước mắm 500ml');
  await page.waitForTimeout(500);
  await clickByText('Lưu phiếu nhập');
  await page.waitForTimeout(2500);
}
assert('7a. Fallback: POST không có status/parent_id/created_by', !!hits.receivedPost && hits.receivedPost.status === undefined && hits.receivedPost.parent_id === undefined && hits.receivedPost.created_by === undefined, JSON.stringify({ status: hits.receivedPost?.status, parent: hits.receivedPost?.parent_id, by: hits.receivedPost?.created_by }));
assert('7b. Fallback: inv_apply_note KHÔNG gọi (v27 cũng thiếu)', hits.invApply.length === 0);
assert('7c. Không có lỗi JS nghiêm trọng', errors.filter((e) => !/Failed to load resource|net::ERR|favicon|404|PGRST202|42703|relation .* does not exist|column .* does not exist/i.test(e)).length === 0, errors.slice(0, 3).join(' | '));

// ================= TỔNG KẾT =================
const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n${'='.repeat(60)}\nKẾT QUẢ P1b: ${passed}/${total} PASS`);
if (passed < total) {
  console.log('FAIL:');
  results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}${r.extra ? ' — ' + r.extra : ''}`));
}
await browser.close();
server.close();
process.exit(passed === total ? 0 : 1);
