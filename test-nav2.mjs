// Test 2: seed fake session → guard thật → click navigation → dump console
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

const fakeJwt = (() => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-4000-8000-000000000001', email: 'piopio.test01@isale.online', role: 'authenticated' })}.fakesig`;
})();

const session = {
  access_token: fakeJwt,
  token_type: 'bearer',
  expires_in: 360000,
  expires_at: Math.floor(Date.now() / 1000) + 360000,
  refresh_token: 'fake-refresh-token',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'piopio.test01@isale.online',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Test User' },
    created_at: new Date().toISOString(),
  },
};

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

await new Promise((r) => server.listen(8334, r));
console.log('server on :8334');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(([key, val]) => {
  localStorage.setItem(key, val);
}, [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const page = await context.newPage();
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[PAGEERROR] ${err.message}\n${(err.stack ?? '').split('\n').slice(0, 5).join('\n')}`));

await page.goto('http://localhost:8334/#/home', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);

console.log('=== URL boot:', page.url());
console.log('=== title boot:', await page.locator('ion-title').first().textContent().catch(() => 'N/A'));
console.log('=== home hero visible:', (await page.locator('.home-hero').count()) > 0 ? 'YES' : 'NO');

// Click quick action "Đơn hàng mới"
const action = page.locator('.app-action', { hasText: 'Đơn hàng mới' }).first();
console.log('=== action count:', await action.count());
await action.click();
await page.waitForTimeout(3500);

console.log('=== URL after click:', page.url());
console.log('=== title after click:', await page.locator('ion-title').first().textContent().catch(() => 'N/A'));
const orderAddVisible = (await page.locator('ion-select').count()) > 0;
console.log('=== order-add form visible:', orderAddVisible ? 'YES' : 'NO');

// Thử thêm 1 nav nữa: Báo cáo
const rep = page.locator('.app-action', { hasText: 'Báo cáo doanh thu' }).first();
if ((await rep.count()) > 0) {
  await rep.click();
  await page.waitForTimeout(2500);
  console.log('=== URL after report click:', page.url());
}

// TEST NÚT BACK + MENU: về home (đổi hash), mở menu, vào Sản phẩm, bấm back
await page.evaluate(() => {
  location.hash = '#/home';
});
await page.waitForTimeout(3000);
console.log('=== URL ve home:', page.url());
let pass = true;

// mở menu
const menuBtn = page.locator('ion-menu-button').first();
if ((await menuBtn.count()) > 0) {
  await menuBtn.click();
  await page.waitForTimeout(1200);
  const menuItem = page.locator('ion-menu ion-item', { hasText: 'Sản phẩm' }).first();
  if ((await menuItem.count()) > 0) {
    await menuItem.click();
    await page.waitForTimeout(2000);
    console.log('=== URL after menu->product:', page.url());
    if (!page.url().includes('/product')) pass = false;

    const backBtn = page.locator('ion-back-button').first();
    if ((await backBtn.count()) > 0) {
      await backBtn.click();
      await page.waitForTimeout(2000);
      console.log('=== URL after BACK click:', page.url());
      if (!page.url().includes('/home')) pass = false;
    } else {
      console.log('!!! no back button found on product page');
      pass = false;
    }
  } else {
    console.log('!!! menu item Sản phẩm not found');
    pass = false;
  }
} else {
  console.log('!!! menu button not found');
  pass = false;
}

// Kiểm tra trang đích render đúng (không chỉ URL đổi)
const heroVisible = await page.locator('.home-hero').isVisible().catch(() => false);
console.log('=== home hero visible after back:', heroVisible ? 'YES' : 'NO');
if (!heroVisible) pass = false;

console.log('\n=== KET QUA NGHIEM THU:', pass ? 'PASS ✓' : 'FAIL ✗');

console.log('\n=== CONSOLE (last 45) ===');
console.log(logs.slice(-45).join('\n'));

await browser.close();
server.close();
process.exit(0);
