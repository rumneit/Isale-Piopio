// Test 3: kiểm tra VISIBILITY thực của các .ion-page sau khi điều hướng
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

await new Promise((r) => server.listen(8335, r));

const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(([key, val]) => {
  localStorage.setItem(key, val);
}, [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const page = await context.newPage();
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[PAGEERROR] ${err.message}`));

const dumpPages = async (label) => {
  const info = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.ion-page')).map((el) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        cls: el.className,
        ariaHidden: el.getAttribute('aria-hidden'),
        display: cs.display,
        opacity: cs.opacity,
        zIndex: cs.zIndex,
        transform: cs.transform === 'none' ? 'none' : 'matrix',
        rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
        hasTitle: el.querySelector('ion-title')?.textContent?.trim() ?? '',
      };
    });
  });
  console.log(`--- ${label} ---`);
  for (const p of info) console.log(JSON.stringify(p));
};

await page.goto('http://localhost:8335/#/home', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);
await dumpPages('BOOT (home)');

const action = page.locator('.app-action', { hasText: 'Đơn hàng mới' }).first();
await action.click();
await page.waitForTimeout(1200);
await dumpPages('SAU CLICK 1.2s (giữa transition)');
await page.waitForTimeout(3000);
await dumpPages('SAU CLICK 4.2s (sau transition)');

// Kiểm tra text ĐỘC QUYỀN của order-add có hiển thị không
const totalVisible = await page.getByText('Tổng cộng').first().isVisible().catch(() => false);
console.log('=== "Tổng cộng" (order-add) visible:', totalVisible ? 'YES' : 'NO');

console.log('\n=== CONSOLE (last 30) ===');
console.log(logs.slice(-30).join('\n'));

await browser.close();
server.close();
process.exit(0);
