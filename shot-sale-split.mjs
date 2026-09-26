// Chup anh man hinh: bo cuc chia don hang | chon san pham (desktop 1440x900)
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8344;
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
const names = ['Tô nhựa 1000ml UKP Trong', 'Ly nhựa 500ml giấy', 'Hộp giấy takeaway', 'Ống hút giấy 8mm', 'Túi giấy kraft', 'Màng bọc thực phẩm', 'Khăn giấy vuông', 'Găng tay ni lông', 'Nắp cốc nhựa 95mm', 'Khay nhựa ĐNN', 'Bát nhựa 500ml', 'Muỗng nhựa gỗ'];
const PRODUCTS = names.map((n, i) => ({
  id: 'p' + (i + 1), shop_id: SHOP.id, name: n, sku: 'PIO' + String(101 + i), unit: 'Cái',
  price: (i + 1) * 2500, cost: (i + 1) * 1500, stock: i === 4 ? 0 : 25 + i * 3, category_id: null, active: true,
  image: i % 3 === 1 ? null : `https://picsum.photos/seed/pp${i}/300/220`, created_at: now,
}));

await ctx.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const table = url.split('/rest/v1/')[1]?.split('?')[0] ?? '';
  let body = [];
  if (table === 'shops') body = [SHOP];
  else if (table === 'profiles') body = [{ id: session.user.id, full_name: 'Test', role: 'owner', shop_id: SHOP.id }];
  else if (table === 'products') {
    // get(id) dung maybeSingle -> tra VE MOT OBJECT; list() -> mang
    // (?<=[?&])id=eq. — chi dung cho bo loc id, khong nham voi shop_id=eq.
    const m = url.match(/[?&]id=eq\.([^&]+)/);
    if (m) {
      const found = PRODUCTS.find((x) => x.id === m[1]) ?? PRODUCTS[0];
      body = found;
    } else {
      body = PRODUCTS;
    }
  }
  const count = Array.isArray(body) ? body.length : 1;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` }, body: JSON.stringify(body) });
});

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message.slice(0, 200)));
await page.goto(`${BASE}/#/sale`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.catalog-tile', { timeout: 25000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: 'audit-output/sale-split-desktop.png', fullPage: false });

// Mobile chia doi
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await page.screenshot({ path: 'audit-output/sale-split-mobile.png', fullPage: false });

// ===== Trang Chi tiet san pham (/product/detail/p1) — 8 tab kieu ISale =====
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/#/product/detail/p1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.pd-tabs', { timeout: 25000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'audit-output/product-detail-desktop.png', fullPage: false });

// Tab Don vi khac + Lich su (desktop)
await page.locator('ion-segment-button[value="units"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'audit-output/product-detail-tab-units-desktop.png', fullPage: false });
await page.locator('ion-segment-button[value="history"]').click();
await page.waitForTimeout(1400);
await page.screenshot({ path: 'audit-output/product-detail-tab-history-desktop.png', fullPage: false });

// Mobile: tab Anh + tab Chi tiet
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await page.locator('ion-segment-button[value="images"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'audit-output/product-detail-tab-images-mobile.png', fullPage: false });
await page.locator('ion-segment-button[value="info"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'audit-output/product-detail-mobile.png', fullPage: false });

console.log('done');
await browser.close();
server.close();
process.exit(0);
