// Debug menu state
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

await new Promise((r) => server.listen(8336, r));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // mobile viewport như điện thoại
await context.addInitScript(([key, val]) => {
  localStorage.setItem(key, val);
}, [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const page = await context.newPage();
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[PAGEERROR] ${err.message}`));
await page.goto('http://localhost:8336/#/home', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(4000);

const menuState = await page.evaluate(async () => {
  const menu = document.querySelector('ion-menu');
  let isActive = null;
  try {
    isActive = await menu?.isActive?.();
  } catch (e) {
    isActive = 'ERR ' + e;
  }
  return {
    isActive,
    isOpen: menu?.isOpen,
    didLoad: menu?.didLoad,
    contentEl: menu?.contentEl?.id ?? String(menu?.contentEl),
    menuContentClasses: menu?.contentEl?.className,
  };
});
console.log('MENU STATE:', JSON.stringify(menuState));
console.log('CONSOLE ERRORS:', logs.filter((l) => l.includes('ion-menu') || l.includes('error') || l.includes('Error')).slice(0, 10).join(' || '));

// Test 1: JS click trên nút
const afterJsClick = await page.evaluate(async () => {
  const btn = document.querySelector('ion-menu-button');
  const menu = document.querySelector('ion-menu');
  btn?.click();
  await new Promise((r) => setTimeout(r, 1200));
  return { isOpen: menu?.isOpen, isAnimating: menu?.isAnimating, itemRect: document.querySelector('ion-menu ion-item')?.getBoundingClientRect().width };
});
console.log('after JS click:', JSON.stringify(afterJsClick));

// Test 2: gọi toggle trực tiếp trên menu element
const afterToggle = await page.evaluate(async () => {
  const menu = document.querySelector('ion-menu');
  const r = await menu?.toggle?.();
  await new Promise((res) => setTimeout(res, 1200));
  return { toggleReturned: r, isOpen: menu?.isOpen, itemRect: document.querySelector('ion-menu ion-item')?.getBoundingClientRect().width };
});
console.log('after toggle():', JSON.stringify(afterToggle));

const info = await page.evaluate(() => {
  const menu = document.querySelector('ion-menu');
  const btn = document.querySelector('ion-menu-button');
  const cs = btn ? getComputedStyle(btn) : null;
  return {
    menuExists: !!menu,
    menuType: menu?.type,
    menuSide: menu?.side,
    menuDisabled: menu?.disabled,
    menuIsOpen: menu?.isOpen,
    menuContentId: menu?.contentId,
    btnExists: !!btn,
    btnClass: btn?.className,
    btnDisplay: cs?.display,
    btnVisibility: cs?.visibility,
    btnRect: btn ? `${Math.round(btn.getBoundingClientRect().width)}x${Math.round(btn.getBoundingClientRect().height)}` : '',
    windowWidth: window.innerWidth,
  };
});
console.log(JSON.stringify(info, null, 2));

// Thử bấm NÚT MENU (không dùng API) rồi kiểm tra trạng thái
const btn = page.locator('ion-menu-button').first();
console.log('btn visible:', await btn.isVisible());
await btn.click();
await page.waitForTimeout(1500);
const afterBtn = await page.evaluate(() => {
  const menu = document.querySelector('ion-menu');
  const item = document.querySelector('ion-menu ion-item');
  const cs = item ? getComputedStyle(item) : null;
  return {
    isOpen: menu?.isOpen,
    itemDisplay: cs?.display,
    itemRect: item ? `${Math.round(item.getBoundingClientRect().width)}x${Math.round(item.getBoundingClientRect().height)}` : '',
    itemOffsetLeft: item?.getBoundingClientRect().left,
  };
});
console.log('after BUTTON click:', JSON.stringify(afterBtn));

// Bấm thử menu item Sản phẩm khi menu đang mở
const item = page.locator('ion-menu ion-item', { hasText: 'Sản phẩm' }).first();
if ((await item.count()) > 0) {
  await item.click();
  await page.waitForTimeout(2000);
  console.log('URL after menu item click:', page.url());
}

await browser.close();
server.close();
process.exit(0);
