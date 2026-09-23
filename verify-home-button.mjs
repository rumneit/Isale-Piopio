// Verify: moi trang con deu co nut Home o header va bam vao quay ve /home.
// Chay: npm run build  ->  node verify-home-button.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const OUT = join(process.cwd(), 'audit-output');
const PORT = 8341;
const BASE = `http://localhost:${PORT}`;

const MIME = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

// Cac trang con dai dien cho tung nhom (inline template, html template, nhieu toolbar, co goBack)
const ROUTES = [
  '/money-account', '/staff', '/material', '/activity-log', '/report/chart',
  '/report/customer', '/crm', '/crm/pipeline', '/delivery', '/point', '/quote',
  '/promotion', '/received-note', '/returns', '/scan', '/stock-check',
  '/stock-check/new', '/support', '/org-chart', '/note', '/calendar',
  '/shift', '/transfer', '/transfer/add', '/import', '/integrations',
  '/external-api', '/shipping-partners', '/point-config', '/level-config',
  '/ai-dynamic-page', '/cyberlotus-tax', '/sales-channels', '/sales-route',
  '/permission', '/cafe-tables', '/custom-field', '/custom-table',
  '/change-password', '/contact/filter-duplicate', '/help', '/notifications',
  '/order/00000000-0000-4000-8000-000000000000',
];

const fakeJwt = (() => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-4000-8000-000000000001', email: 'piopio.test01@isale.online', role: 'authenticated' })}.fakesig`;
})();
const session = {
  access_token: fakeJwt, token_type: 'bearer', expires_in: 360000,
  expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake-refresh-token',
  user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'piopio.test01@isale.online', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Test User' }, created_at: new Date().toISOString() },
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
await new Promise((r) => server.listen(PORT, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(([key, val]) => localStorage.setItem(key, val), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await context.newPage();

async function waitRender(maxMs = 9000) {
  const start = Date.now(); let prev = -1, stable = 0;
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(350);
    const len = await page.evaluate(() => {
      const main = document.querySelector('#main-content');
      const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
      return ((pages[pages.length - 1] ?? main)?.innerText ?? '').trim().length;
    }).catch(() => -1);
    if (len > 0 && len === prev) { if (++stable >= 2) return; } else { stable = 0; prev = len; }
  }
}

const results = [];
for (const route of ROUTES) {
  const rec = { route, hasHome: false, navigatedHome: false, title: '', error: null };
  try {
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#main-content ion-title', { state: 'attached', timeout: 20000 });
    await waitRender();
    rec.title = (await page.locator('#main-content ion-title').last().textContent().catch(() => '')) ?? '';

    // Nut Home nam trong ion-buttons slot="start" cua toolbar dau tien
    const homeBtn = page.locator('#main-content ion-header ion-toolbar ion-buttons[slot="start"] ion-button:has(ion-icon[name="home-outline"])').first();
    rec.hasHome = (await homeBtn.count()) > 0;

    if (rec.hasHome) {
      await homeBtn.click();
      await page.waitForTimeout(900);
      const hash = await page.evaluate(() => location.hash);
      rec.navigatedHome = hash === '#/home' || hash.startsWith('#/home');
      if (!rec.navigatedHome) rec.error = `click -> ${hash}`;
    } else {
      rec.error = 'khong thay nut Home';
    }
  } catch (e) { rec.error = e.message; }
  results.push(rec);
  console.log(`${rec.hasHome ? (rec.navigatedHome ? 'OK  ' : 'NAV?') : 'MISS'}  ${route.padEnd(46)} "${rec.title.slice(0, 22)}"${rec.error ? '  :: ' + rec.error : ''}`);
}

const missing = results.filter((r) => !r.hasHome);
const badNav = results.filter((r) => r.hasHome && !r.navigatedHome);
console.log(`\n=== TONG KET ===\nTrang kiem tra: ${results.length} | Co nut Home: ${results.length - missing.length} | Bam ve /home OK: ${results.filter(r => r.navigatedHome).length}`);
if (missing.length) console.log('THIEU NUT HOME: ' + missing.map((m) => m.route).join(', '));
if (badNav.length) console.log('BAM KHONG VE /home: ' + badNav.map((m) => `${m.route} (${m.error})`).join(', '));

await writeFile(join(OUT, 'home-button-verify.json'), JSON.stringify({ at: new Date().toISOString(), results, missing: missing.map(m => m.route), badNav: badNav.map(m => m.route) }, null, 2), 'utf8');

// Anh chup man hinh de QA truc quan
const shots = ['/money-account', '/staff', '/report/chart', '/transfer/add', '/stock-check/new'];
for (const r of shots) {
  await page.goto(`${BASE}/#${r}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#main-content ion-title', { state: 'attached' });
  await waitRender(6000);
  await page.screenshot({ path: join(OUT, `home-btn-${r.replace(/\//g, '_')}.png`) });
}

await browser.close();
server.close();
process.exit(missing.length || badNav.length ? 1 : 0);
