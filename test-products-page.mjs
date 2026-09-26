// Test trang Sản phẩm (/product) — clone ISale: dropdown Lọc theo, icon đa sắc, card 2 cột, FAB giữa
// Chạy: node test-products-page.mjs   (yêu cầu đã build: npm run build)
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8349;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

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

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-4000-8000-000000000001', email: 'piopio.test01@isale.online', role: 'authenticated' })}.fakesig`;
const session = { access_token: fakeJwt, token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake', user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'piopio.test01@isale.online', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Test' }, created_at: new Date().toISOString() } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const now = new Date().toISOString();
const SHOP = { id: '11111111-1111-4111-8111-111111111111', name: 'Shop Test', owner_id: session.user.id, created_at: now };
// 45 sản phẩm -> 3 trang (page size 20); P1 số lượng ÂM để kiểm tra màu
const PRODUCTS = Array.from({ length: 45 }, (_, i) => ({
  id: `p${i + 1}`,
  shop_id: SHOP.id,
  name: i === 0 ? '[TAS.1] Đũa tách OPP kèm Tăm' : `Sản phẩm测试 ${i + 1}`,
  sku: `P${String(i + 1).padStart(4, '0')}`,
  unit: 'Cái',
  price: 15000 - i * 100,
  cost: i % 3 === 0 ? 11000 : null,
  stock: i === 0 ? -520 : 10 + i,
  active: true,
  created_at: now,
}));

const errors = [];
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await ctx.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const table = url.split('/rest/v1/')[1]?.split('?')[0] ?? '';
  let body = [];
  if (table === 'shops') body = [SHOP];
  else if (table === 'profiles') body = [{ id: session.user.id, full_name: 'Test', role: 'owner', shop_id: SHOP.id }];
  else if (table === 'products') body = PRODUCTS;
  else if (table === 'categories') body = [{ id: 'c1', name: 'Nhựa' }];
  const count = Array.isArray(body) ? body.length : 1;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` }, body: JSON.stringify(body) });
});

await page.goto(`${BASE}/#/product`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.product-card', { timeout: 25000 });
await page.waitForTimeout(3000);

const ui = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const q = (sel) => active?.querySelector(sel);
  const card = q('.product-card');
  const fab = q('ion-fab.add-fab ion-fab-button');
  const fabBox = fab?.getBoundingClientRect();
  const negVal = card?.querySelector('.field-value');
  const optLabels = Array.from(active?.querySelectorAll('ion-select.sort-select ion-select-option') ?? []).map((o) => o.textContent?.trim());
  return {
    title: q('ion-title')?.textContent?.trim(),
    titleColor: (() => { const t = q('ion-title'); return t ? getComputedStyle(t).color : null; })(),
    hasGreenBarcode: !!q('ion-buttons ion-button.ic-green ion-icon[name="barcode-sharp"]'),
    hasAddRound: !!q('ion-button.add-round'),
    hasPurpleApps: !!q('ion-buttons ion-button.ic-purple ion-icon[name="apps"]'),
    sortSelect: !!q('ion-select.sort-select'),
    sortOptions: optLabels,
    catBtn: q('.cat-btn')?.textContent?.trim(),
    catBtnTransform: (() => { const b = q('.cat-btn'); return b ? getComputedStyle(b).textTransform : null; })(),
    funnelPurple: !!q('.list-toolbar .toolbar-left ion-button.ic-purple'),
    actionIcons: {
      green: active?.querySelectorAll('.toolbar-actions ion-button.ic-green').length ?? 0,
      orange: active?.querySelectorAll('.toolbar-actions ion-button.ic-orange').length ?? 0,
      purple: active?.querySelectorAll('.toolbar-actions ion-button.ic-purple').length ?? 0,
      gray: active?.querySelectorAll('.toolbar-actions ion-button.ic-gray').length ?? 0,
    },
    totalText: q('.toolbar-total')?.textContent?.trim(),
    pagerLabel: q('.pager .pager-label')?.textContent?.trim(),
    hasForward: !!q('.pager ion-button ion-icon[name="chevron-forward"]'),
    cardCount: active?.querySelectorAll('.product-card').length ?? 0,
    firstCardName: card?.querySelector('.product-name')?.textContent?.trim(),
    labels: card ? Array.from(card.querySelectorAll('.field-label')).map((l) => l.textContent?.trim()) : [],
    negValText: negVal?.textContent?.trim(),
    negValColor: negVal ? getComputedStyle(negVal).color : null,
    toggleCount: active?.querySelectorAll('.product-card ion-toggle').length ?? 0,
    hasChips: !!q('.filter-chip'),
    hasCostFieldOnCard3: active?.querySelectorAll('.product-card')[2]?.querySelectorAll('.field-label')?.length ?? 0,
    fabCenterX: fabBox ? Math.round(fabBox.left + fabBox.width / 2) : null,
    viewportW: window.innerWidth,
    cardRadius: card ? getComputedStyle(card).borderRadius : null,
    nameColor: (() => { const n = card?.querySelector('.product-name'); return n ? getComputedStyle(n).color : null; })(),
  };
});

// Chụp ảnh: desktop + mobile
await page.screenshot({ path: 'audit-output/products-isale-desktop.png' });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'audit-output/products-isale-mobile.png' });

console.log('PRODUCTS UI:', JSON.stringify(ui, null, 1));
console.log('real console errors (bo 401/anh mang):', errors.filter((e) => !/\b401\b/.test(e) && !/picsum|net::|Failed to load resource/.test(e)).length);

const vw2 = ui.viewportW ?? 1440;
const ok = ui.title === 'Sản phẩm'
  && ui.hasGreenBarcode && ui.hasAddRound && ui.hasPurpleApps
  && ui.sortSelect && ui.sortOptions.length >= 3 && ui.sortOptions.includes('Tất cả') && ui.sortOptions.includes('Gần đây') && ui.sortOptions.includes('Còn số lượng')
  && /chọn nhóm hàng/i.test(ui.catBtn ?? '') && ui.catBtnTransform === 'uppercase'
  && ui.funnelPurple
  && ui.actionIcons.green === 2 && ui.actionIcons.orange === 1 && ui.actionIcons.gray === 1
  && ui.totalText === 'Tổng: 45 sản phẩm'
  && ui.pagerLabel === 'Trang 1/3' && ui.hasForward
  && ui.cardCount === 45
  && ui.labels.includes('Số lượng') && ui.labels.includes('Đơn giá') && ui.labels.includes('Đơn vị') && ui.labels.includes('Quản lý Serial/IMEI?')
  && ui.negValText === '-520' && ui.negValColor === 'rgb(33, 37, 41)'
  && ui.toggleCount === 45
  && !ui.hasChips
  && ui.hasCostFieldOnCard3 === 4 // cost=null => 4 nhãn: Số lượng, Đơn giá, Đơn vị, Serial (Giá nhập ẩn)
  && Math.abs((ui.fabCenterX ?? 0) - vw2 / 2) <= 40
  && ui.cardRadius === '14px'
  && ui.nameColor === 'rgb(39, 50, 74)';
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
