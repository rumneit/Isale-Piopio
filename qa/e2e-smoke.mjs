// QA E2E smoke trên bản build thật (www/) với Supabase giả lập ở tầng HTTP.
// Mục đích: chứng minh UI render, tính tiền, chặn khách đưa thiếu, idempotency
// khi retry và RBAC route — không cần tài khoản/DB production.
//
//   npm run build
//   LD_LIBRARY_PATH=... node qa/e2e-smoke.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const OUT = join(process.cwd(), 'qa', 'evidence');
const PORT = 8341;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

const fakeJwt = (() => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: 'qa@piopio.test', role: 'authenticated' })}.fakesig`;
})();
const session = {
  access_token: fakeJwt, token_type: 'bearer', expires_in: 360000,
  expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake-refresh',
  user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'qa@piopio.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() },
};

const product = {
  id: PRODUCT_ID, shop_id: SHOP_ID, name: 'SP QA 1', sku: 'SPQA1', unit: 'cái',
  price: 100000, cost: 40000, stock: 50, category_id: null, active: true, image: null,
  created_at: new Date().toISOString(),
};
const ownerProfile = { id: USER_ID, shop_id: SHOP_ID, full_name: 'QA Owner', role: 'owner', permissions: {} };
const shop = { id: SHOP_ID, name: 'QA Shop', owner_id: USER_ID };

const reportKpis = {
  current: { from: '2026-10-01', to: '2026-10-23', revenue: 1234500, orders: 7, discount: 0, paid_total: 1234500, unpaid_orders: 0, cogs: 500000, profit: 734500, income: 1234500, expense: 100000, returns_total: 0, returns_count: 0 },
  prev: {}, yoy: {},
};

// ---- Static server ----
const server = createServer(async (req, res) => {
  let p = req.url.split('?')[0].split('#')[0];
  if (p === '/' || p === '') p = '/index.html';
  try {
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    const data = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  }
});
await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function makeContext(browser, { loggedIn = true, profile = ownerProfile, tables = {}, rpc = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (loggedIn) {
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  }
  const state = { profile, rpcCalls: [], failNextOrderRpc: false, orderCreated: 0 };
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200, extra = {}) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: extra });

    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/user')) return json(session.user);
      if (url.pathname.includes('/token') || url.pathname.includes('/session')) return json(session);
      return json({});
    }
    if (url.pathname.includes('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      const body = req.postData() ? JSON.parse(req.postData()) : {};
      if (fn === 'inv_create_order') {
        state.rpcCalls.push(body);
        if (state.failNextOrderRpc) {
          state.failNextOrderRpc = false;
          return json({ message: 'QA forced failure', code: 'XX000' }, 500);
        }
        state.orderCreated++;
        return json({ id: '44444444-4444-4444-8444-444444444444', code: body?.p_order?.code ?? 'DH-QA', total: body?.p_order?.total ?? 0, status: body?.p_order?.status ?? 'completed', paid: true });
      }
      if (rpc[fn] !== undefined) return json(rpc[fn]);
      if (fn === 'report_kpis') return json(reportKpis);
      if (fn === 'report_timeseries') return json([
        { bucket: '2026-10-22', revenue: 234500, orders: 2, cogs: 100000, profit: 134500, income: 234500, expense: 0 },
        { bucket: '2026-10-23', revenue: 1000000, orders: 5, cogs: 400000, profit: 600000, income: 1000000, expense: 100000 },
      ]);
      if (fn === 'report_top_products') return json([{ product_id: PRODUCT_ID, name: 'SP QA 1', unit: 'cái', qty: 5, revenue: 500000, cogs: 200000, profit: 300000, orders: 3 }]);
      return json({});
    }
    if (url.pathname.includes('/rest/v1/')) {
      const table = url.pathname.split('/rest/v1/')[1].split('/')[0];
      const accept = req.headers()['accept'] ?? '';
      const single = accept.includes('vnd.pgrst.object');
      const rows = tables[table] ?? {
        profiles: [state.profile],
        shops: [shop],
        products: [product],
        customers: [],
        money_accounts: [{ id: ACCOUNT_ID, shop_id: SHOP_ID, name: 'Tiền mặt', type: 'cash', balance: 0, is_default: true }],
        settings: [{ key: 'allow_negative_stock', value: 'false' }],
        orders: [],
        order_items: [],
        transactions: [],
      }[table] ?? [];
      if (req.method() !== 'GET') return json(single ? (rows[0] ?? {}) : []);
      if (single) return json(rows[0] ?? null);
      return json(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  return { ctx, page, state, consoleErrors };
}

const browser = await chromium.launch();
const activePage = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};

console.log('\n== E1: trang đăng nhập render khi chưa có session ==');
{
  const { ctx, page } = await makeContext(browser, { loggedIn: false });
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const text = await page.evaluate(() => document.body.innerText);
  check('có form đăng nhập', /Đăng nhập|đăng nhập/i.test(text), text.slice(0, 60).replace(/\n/g, ' | '));
  await ctx.close();
}

console.log('\n== E2/E3/E4: bán hàng — tính tiền, chặn đưa thiếu, idempotency retry ==');
{
  const { ctx, page, state, consoleErrors } = await makeContext(browser);
  await page.goto(`${BASE}/#/sale`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('button.catalog-tile', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(600);
  await page.click('button.catalog-tile[title="SP QA 1"]');
  await page.waitForTimeout(400);

  const totalNow = () => page.evaluate(() => document.body.innerText.includes('100.000 ₫'));
  check('thêm sản phẩm → tạm tính 100.000 ₫', await totalNow());

  await page.fill('input[aria-label="Chiết khấu phần trăm"]', '10');
  await page.fill('input[aria-label="Thuế VAT phần trăm"]', '5');
  await page.fill('input[aria-label="Phí ship"]', '20000');
  await page.waitForTimeout(500);
  const dueText = await page.evaluate(() => document.body.innerText);
  // 100.000 − 10.000 + 5.000 + 20.000 = 115.000
  check('tổng phải trả = 115.000 ₫ (CK 10%, VAT 5%, ship 20.000)', dueText.includes('115.000 ₫'));
  await page.screenshot({ path: join(OUT, 'e2e-sale-total.png'), fullPage: false });

  await page.fill('input[aria-label="Khách đưa"]', '50000');
  await page.click('ion-button[aria-label="Lưu đơn hàng"]');
  await page.waitForTimeout(1200);
  const toast = await page.evaluate(() => document.body.innerText);
  check('khách đưa thiếu → báo lỗi, không gửi đơn', /khách đưa/i.test(toast) && state.rpcCalls.length === 0,
    `rpc=${state.rpcCalls.length}`);

  // Đủ tiền + lần đầu server lỗi để mô phỏng mất mạng/timeout.
  await page.fill('input[aria-label="Khách đưa"]', '200000');
  state.failNextOrderRpc = true;
  await page.click('ion-button[aria-label="Lưu đơn hàng"]');
  await page.waitForTimeout(1800);
  check('lần 1 lỗi → không tạo đơn', state.orderCreated === 0 && state.rpcCalls.length === 1);
  await page.click('ion-button[aria-label="Lưu đơn hàng"]');
  await page.waitForTimeout(2200);
  check('lần 2 thử lại thành công', state.orderCreated === 1, `created=${state.orderCreated}`);
  const nonce1 = state.rpcCalls[0]?.p_nonce;
  const nonce2 = state.rpcCalls[1]?.p_nonce;
  check('retry dùng CÙNG nonce (không tạo đơn trùng)', !!nonce1 && nonce1 === nonce2, `${nonce1} / ${nonce2}`);
  const body = state.rpcCalls[0] ?? {};
  check('server nhận discount_percent=10, tax_percent=5, ship=20000',
    Number(body.p_order?.discount_percent) === 10 && Number(body.p_order?.tax_percent) === 5 && Number(body.p_order?.ship_fee) === 20000,
    JSON.stringify({ d: body.p_order?.discount_percent, t: body.p_order?.tax_percent, s: body.p_order?.ship_fee }));
  // Lần lỗi 500 là do harness cố tình giả lập mất mạng — bỏ qua đúng lỗi đó.
  const realErrors = consoleErrors.filter((e) => !/status of 500/.test(e));
  check('không có lỗi console thật', realErrors.length === 0, realErrors.join(' | ').slice(0, 200));
  await page.screenshot({ path: join(OUT, 'e2e-sale.png'), fullPage: false });
  await ctx.close();
}

console.log('\n== E5: báo cáo dùng số liệu server (không cộng đơn hủy) ==');
{
  const { ctx, page, consoleErrors } = await makeContext(browser);
  await page.goto(`${BASE}/#/report/chart`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const text = await page.evaluate(() => document.body.innerText);
  check('doanh thu KPI hiển thị 1.234.500 ₫', text.includes('1.234.500 ₫'), text.slice(0, 120).replace(/\n/g, ' | '));
  check('lợi nhuận gộp lấy từ server (734.500 ₫)', text.includes('734.500 ₫'));
  check('không lỗi console', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
  await page.screenshot({ path: join(OUT, 'e2e-report.png'), fullPage: false });
  await ctx.close();
}

console.log('\n== E6: RBAC — nhân viên chỉ có quyền "money" không vào được vận đơn/bán hàng ==');
{
  const staff = { id: USER_ID, shop_id: SHOP_ID, full_name: 'QA Staff', role: 'staff', permissions: { money: true } };
  const { ctx, page } = await makeContext(browser, { profile: staff });
  await page.goto(`${BASE}/#/shipments`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const url1 = page.url();
  check('bị chặn khỏi /shipments', !url1.includes('/shipments'), url1);
  await page.goto(`${BASE}/#/sale`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const url2 = page.url();
  check('bị chặn khỏi /sale', !url2.includes('/sale'), url2);
  await ctx.close();
}

console.log('\n== E7: link khôi phục mật khẩu → trang đặt lại, không bị hash-router nuốt ==');
{
  const { ctx, page, consoleErrors } = await makeContext(browser, { loggedIn: false });
  await page.goto(
    `${BASE}/#/reset-password#access_token=${fakeJwt}&refresh_token=fake-refresh&expires_in=3600&token_type=bearer&type=recovery`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  );
  await page.waitForTimeout(2500);
  const url = page.url();
  check('URL được chuẩn hoá về #/reset-password', /#\/reset-password$/.test(url), url);
  const text = await page.evaluate(() => document.body.innerText);
  check('hiện form mật khẩu mới', /Mật khẩu mới/i.test(text), text.slice(0, 100).replace(/\n/g, ' | '));
  const inputs = page.locator('ion-input input[type="password"]');
  check('có 2 ô mật khẩu', (await inputs.count()) === 2);
  await page.screenshot({ path: join(OUT, 'e2e-reset.png'), fullPage: false });
  await inputs.nth(0).fill('MatKhauMoi123');
  await inputs.nth(1).fill('MatKhauMoi123');
  await page.click('ion-button:has-text("Lưu mật khẩu mới")');
  await page.waitForTimeout(1800);
  check('đổi xong quay về trang đăng nhập', page.url().includes('/login'), page.url());
  check('không lỗi console', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 160));
  await ctx.close();
}

console.log('\n== E8: link reset không có token → báo lỗi rõ, không treo ==');
{
  const { ctx, page } = await makeContext(browser, { loggedIn: false });
  await page.goto(`${BASE}/#/reset-password`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText);
  check('báo link không hợp lệ/hết hạn', /không hợp lệ|hết hạn/i.test(text), text.slice(0, 100).replace(/\n/g, ' | '));
  check('có nút về đăng nhập', /Về trang đăng nhập/i.test(text));
  await ctx.close();
}

console.log('\n== E9: trả hàng đơn ghi nợ — UI nói rõ giảm công nợ, không hoàn tiền mặt ==');
{
  const orderId = '44444444-4444-4444-8444-444444444444';
  const order = {
    id: orderId, shop_id: SHOP_ID, code: 'DH-QA-RET', customer_id: null, customer_name: 'Khách QA',
    status: 'debt', total: 300000, discount: 0, paid: false, debt_amount: 300000,
    created_at: new Date().toISOString(),
  };
  const item = { id: '55555555-5555-4555-8555-555555555555', order_id: orderId, product_id: PRODUCT_ID, name: 'SP QA 1', price: 100000, qty: 3, total: 300000 };
  const { ctx, page } = await makeContext(browser, {
    tables: { orders: [order], order_items: [item], return_notes: [] },
    rpc: { inv_create_return_note: { id: '66666666-6666-4666-8666-666666666666', code: 'TH-QA', total: 200000, refunded: true, cash_refund: 0, debt_credit: 200000 } },
  });
  await page.goto(`${BASE}/#/order/${orderId}/return`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  const text = await page.evaluate(() => document.body.innerText);
  check('cảnh báo hoàn tiền mặt theo phần đã trả', /Chỉ hoàn tiền mặt phần khách đã trả/i.test(text), text.slice(0, 120).replace(/\n/g, ' | '));
  await page.click('ion-checkbox:has-text("Chọn tất cả")');
  await page.waitForTimeout(300);
  const qty = page.locator('.return-qty input');
  await qty.fill('2');
  await page.waitForTimeout(300);
  await page.click('ion-button:has-text("Xác nhận trả hàng")');
  await page.waitForTimeout(2000);
  const toastText = await page.evaluate(() =>
    [...document.querySelectorAll('ion-toast')].map((t) => t.shadowRoot?.textContent ?? t.textContent ?? '').join(' ')
  );
  check('toast nêu giảm công nợ 200.000 ₫', /giảm công nợ 200\.000/.test(toastText), toastText.slice(0, 160));
  check('toast KHÔNG nói hoàn tiền mặt', !/hoàn tiền mặt/i.test(toastText), toastText.slice(0, 160));
  await page.screenshot({ path: join(OUT, 'e2e-return-debt.png'), fullPage: false });
  await ctx.close();
}

await writeFile(join(OUT, 'e2e-smoke.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
server.close();
if (failed.length) process.exitCode = 1;
