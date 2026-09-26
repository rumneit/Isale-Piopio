// audit-deep.mjs — DEEP E2E AUDIT (Global Launch QA)
// Tiêu chí: console/pageerror, tràn ngang mobile (chỉ phần tử gây tràn),
// ảnh vỡ, nút icon thiếu accessible name (WCAG 2.2), i18n chuỗi dài, double-submit.
// Chạy: node audit-deep.mjs  (yêu cầu đã build: npm run build)
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8361;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  let p = req.url.split('?')[0].split('#')[0];
  if (p === '/' || p === '') p = '/index.html';
  try {
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(d);
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(await readFile(join(ROOT, 'index.html')));
  }
});
await new Promise((r) => server.listen(PORT, r));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-4000-8000-000000000001', email: 'piopio.test01@isale.online', role: 'authenticated' })}.x`;
const session = { access_token: fakeJwt, token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake', user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'piopio.test01@isale.online', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Test' }, created_at: new Date().toISOString() } };

const now = new Date().toISOString();
const SHOP = { id: '11111111-1111-4111-8111-111111111111', name: 'Shop Test', owner_id: session.user.id, created_at: now };
const PRODUCT = { id: 'p1', shop_id: SHOP.id, name: '[TAS.1] Đũa tách OPP kèm Tăm', sku: 'TAS001', unit: 'Bao (100 đôi)', price: 15000, cost: 11000, stock: -520, category_id: 'c1', active: true, serial_managed: false, expiry_date: null, barcode: '8934506789123', image: null, images: [], units: [{ name: 'Thùng (40 Bao)', conversion: 40, price: 540000, cost: 430000 }], discounts: [], options: [], tags: [], dich_vu: false, ngoai_te: false, gia_nhap_nt: null, hien_tren_web: true, ban_chay: false, moi: false, hien_gia_web: false, khuyen_mai: false, mo_ta: null, price_settings: [], barcodes: [], custom_fields: [], created_at: now };
const ORDER = { id: 'o1', shop_id: SHOP.id, code: 'HD001', total: 150000, status: 'completed', customer_id: null, created_at: now };
const CUSTOMER = { id: 'cu1', shop_id: SHOP.id, name: 'Nguyễn Văn A', phone: '0900000000', created_at: now };

const ROUTES = [
  '/home', '/sale', '/product', '/product/detail/p1', '/product/update/p1', '/product/add',
  '/order', '/order/add', '/contact', '/debt', '/report', '/config', '/trade', '/crm',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const patches = [];
await ctx.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = req.url();
  const table = url.split('/rest/v1/')[1]?.split('?')[0] ?? '';
  if (req.method() === 'PATCH') {
    patches.push({ table, body: req.postDataJSON() ?? {} });
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  let body = [];
  if (table === 'shops') body = [SHOP];
  else if (table === 'profiles') body = [{ id: session.user.id, full_name: 'Test', role: 'owner', shop_id: SHOP.id }];
  else if (table === 'products') body = /[?&]id=eq\./.test(url) ? PRODUCT : [PRODUCT];
  else if (table === 'orders') body = /[?&]id=eq\./.test(url) ? ORDER : [ORDER];
  else if (table === 'customers') body = /[?&]id=eq\./.test(url) ? CUSTOMER : [CUSTOMER];
  else if (table === 'categories') body = [{ id: 'c1', name: 'Nhựa' }];
  else body = [];
  const count = Array.isArray(body) ? body.length : 1;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` }, body: JSON.stringify(body) });
});

const issues = [];
const report = [];

const auditRoute = async (routePath, viewport) => {
  const tag = `${routePath} [${viewport}]`;
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize(viewport.width < 500 ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.goto(`${BASE}/#${routePath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2600);

  const res = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const out = { overflow: [], brokenImgs: 0, unnamed: 0, unnamedSamples: [], placeholderOnly: 0 };
    if (!active) return out;
    // Tiền tố: phần tử nằm trong vùng cuộn ngang có chủ đích (segment/carousel) không tính là tràn
    const inScrollableX = (el) => {
      let cur = el.parentElement;
      for (let i = 0; cur && i < 8; i++) {
        const cs = getComputedStyle(cur);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && cur.scrollWidth > cur.clientWidth + 2) return true;
        cur = cur.parentElement;
      }
      return false;
    };
    // 1) Tràn ngang: phần tử vượt viewport phải (bỏ qua drawer cố định + vùng cuộn có chủ đích)
    const vw = window.innerWidth;
    const all = active.querySelectorAll('*');
    for (const el of all) {
      if (el.tagName === 'ION-SEGMENT-BUTTON') continue; // segment luôn cuộn ngang theo thiết kế
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2 && r.left < vw) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.position === 'absolute') continue; // drawer/overlay cố ý
        if (inScrollableX(el)) continue;
        const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        out.overflow.push(el.tagName.toLowerCase() + cls + ` right=${Math.round(r.right)}`);
        if (out.overflow.length >= 3) break;
      }
    }
    // 2) Ảnh vỡ
    for (const img of active.querySelectorAll('img')) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) out.brokenImgs++;
    }
    // 3) Nút/liên kết icon-only thiếu accessible name (host hoặc inner shadow button)
    const els = [...active.querySelectorAll('button, ion-button, a, ion-fab-button, [role="button"]')];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const txt = (el.textContent || '').trim();
      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        el.getAttribute('title') ||
        el.ariaLabel ||
        (el.shadowRoot?.querySelector('button')?.getAttribute('aria-label') ?? '') ||
        (el.shadowRoot?.querySelector('button')?.getAttribute('aria-labelledby') ?? '');
      if (!txt && !label) {
        out.unnamed++;
        if (out.unnamedSamples.length < 3) {
          const icon = el.querySelector('ion-icon')?.getAttribute('name') ?? '';
          const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
          out.unnamedSamples.push(el.tagName.toLowerCase() + cls + (icon ? ` icon=${icon}` : ''));
        }
      }
    }
    // 4) Input chỉ có placeholder (không label/aria-label) — WCAG 3.3.2
    // Ionic đưa aria-label xuống input thật bên trong shadow DOM → phải soi cả shadow.
    const inpLabel = (inp) => {
      const own =
        inp.getAttribute('aria-label') ||
        inp.getAttribute('aria-labelledby') ||
        inp.getAttribute('label') ||
        inp.ariaLabel ||
        '';
      if (own) return own;
      const inner = inp.shadowRoot?.querySelector('input, textarea');
      return inner?.getAttribute('aria-label') || inner?.getAttribute('aria-labelledby') || '';
    };
    for (const inp of active.querySelectorAll('input:not([type="hidden"]), ion-input, ion-textarea, ion-select')) {
      if (inp.getBoundingClientRect().width === 0) continue;
      const ph = inp.getAttribute('placeholder');
      if (ph && !inpLabel(inp)) out.placeholderOnly++;
    }
    return out;
  });

  const realErrors = errors.filter((e) => !/\b4\d\d\(\)/.test(e) && !/Failed to load resource.*4\d\d/.test(e) && !/picsum|net::ERR_FAILED|Failed to fetch/.test(e));
  if (realErrors.length) issues.push(`${tag} — console: ${realErrors[0].slice(0, 110)}`);
  if (res.overflow.length) issues.push(`${tag} — TRÀN NGANG: ${res.overflow.join(' | ')}`);
  if (res.brokenImgs) issues.push(`${tag} — ${res.brokenImgs} ảnh vỡ`);
  if (res.unnamed > 0) issues.push(`${tag} — ${res.unnamed} nút thiếu accessible name: ${res.unnamedSamples.join(', ')}`);
  report.push({ route: routePath, viewport: viewport.width, ...res, realErrors: realErrors.length });
  await page.close();
};

for (const r of ROUTES) {
  await auditRoute(r, { width: 1440, height: 900 });
  await auditRoute(r, { width: 390, height: 844 });
}

// ===== i18n stress: tên sản phẩm cực dài + token liền trên trang Sửa =====
{
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/#/product/update/p1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.pe-grid4', { timeout: 25000 });
  await page.waitForTimeout(1200);
  const longName = 'X'.repeat(60) + ' SảnPhẩmSiêuDàiKhôngCóKhoảngTrốngĐểTestWordBreakWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW';
  await page.locator('.pe-grid2 .pe-field input').nth(1).fill(longName);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => {
    const bad = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll('.ion-page:last-of-type *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2 && r.left < vw) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.position === 'absolute') continue;
        bad.push(el.tagName.toLowerCase() + ` right=${Math.round(r.right)}`);
        if (bad.length >= 3) break;
      }
    }
    return bad;
  });
  if (overflow.length) issues.push(`/product/update/p1 [i18n-long-name mobile] — TRÀN NGANG: ${overflow.join(' | ')}`);
  await page.close();
}

// ===== Double-submit: bấm Lưu 2 lần liên tiếp => chỉ 1 PATCH =====
{
  patches.length = 0;
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/#/product/update/p1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.pe-grid4', { timeout: 25000 });
  await page.waitForTimeout(1500);
  const saveBtn = page.locator('ion-buttons[slot="end"] ion-button.pe-save');
  await saveBtn.click();
  await saveBtn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(1800);
  if (patches.length !== 1) issues.push(`/product/update/p1 — double-submit: ${patches.length} PATCH thay vì 1`);
  await page.close();
}

// ===== 404 route: giờ PHẢI hiển thị trang "Không tìm thấy trang" riêng =====
{
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/#/khong-ton-tai-xyz`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  const state = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    return {
      hash: location.hash,
      is404: !!active?.querySelector('.nf-code') && (active?.querySelector('h1')?.textContent ?? '').includes('Không tìm thấy trang'),
    };
  });
  if (!state.is404) issues.push(`404: URL lạ "${state.hash}" KHÔNG hiển thị trang 404 riêng`);
  await page.close();
}

// ===== Bàn phím: Tab đầu tiên focus được phần tử tương tác (sanity) =====
{
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/#/product/update/p1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.pe-grid4', { timeout: 25000 });
  await page.waitForTimeout(800);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? el.tagName.toLowerCase() + (el.textContent?.trim().slice(0, 20) || '') : 'none';
  });
  if (focused === 'none' || focused === 'body') issues.push('Keyboard: Tab không focus vào phần tử tương tác nào');
  await page.close();
}

await browser.close();
server.close();

console.log('===== AUDIT DEEP — KẾT QUẢ =====');
console.log(`Đã quét ${ROUTES.length} route × 2 viewport + 5 check chuyên sâu`);
console.log(`\nPHÁT HIỆN ${issues.length} VẤN ĐỀ:`);
for (const i of issues) console.log(' - ' + i);
console.log('\nCHI TIẾT (per-route):');
for (const r of report) {
  console.log(`${r.route} [${r.viewport}] overflow=${r.overflow?.length ?? 0} brokenImg=${r.brokenImgs} unnamed=${r.unnamed} phOnly=${r.placeholderOnly} err=${r.realErrors}`);
}
const fs = await import('fs');
fs.writeFileSync('audit-output/audit-deep-report.json', JSON.stringify({ issues, report }, null, 1));
console.log('\nBáo cáo: audit-output/audit-deep-report.json');
process.exit(0);
