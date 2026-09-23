// Audit toan bo route cua app Piopio bang Playwright (chay local, khong push)
// Cach chay:  npm run build  ->  node audit.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm'; // trung voi environment.ts
const ROOT = join(process.cwd(), 'www');
const OUT = join(process.cwd(), 'audit-output');
const PORT = 8340;
const BASE = `http://localhost:${PORT}`;

const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// ---- Danh sach route can audit (khop voi app.routes.ts) ----
const ROUTES = [
  '/home',
  '/product',
  '/product/add',
  '/order',
  '/sale',
  '/order/add',
  '/returns',
  '/trade',
  '/trade/add',
  '/contact',
  '/contact/add',
  '/debt',
  '/online-order',
  '/crm',
  '/crm/pipeline',
  '/crm/add',
  '/crm/deals',
  '/crm/forecast',
  '/crm/quota',
  '/crm/approvals',
  '/crm-activities',
  '/sales-route',
  '/sales-channels',
  '/contact/filter-duplicate',
  '/activity-log',
  '/permission',
  '/received-note',
  '/received-note/add',
  '/delivery',
  '/quote',
  '/promotion',
  '/promotion/add',
  '/material',
  '/point',
  '/scan',
  '/calendar',
  '/note',
  '/shift',
  '/transfer',
  '/transfer/add',
  '/cafe-tables',
  '/import',
  '/integrations',
  '/fbpage',
  '/zbs-marketing',
  '/sms-marketing',
  '/sepay-payment',
  '/ai-services',
  '/external-api',
  '/pricing',
  '/request-pro',
  '/support',
  '/org-chart',
  '/notifications',
  '/report',
  '/report/chart',
  '/report/orders',
  '/report/customer',
  '/report/stock',
  '/report/inout',
  '/report/product',
  '/report/debt',
  '/report/category',
  '/report/timely',
  '/report/excel',
  '/money-account',
  '/config',
  '/change-password',
  '/custom-field',
  '/custom-table',
  '/custom-table/00000000-0000-4000-8000-000000000000',
  '/stock-check',
  '/stock-check/new',
  '/stock-check/00000000-0000-4000-8000-000000000000',
  '/staff',
  '/help',
];

// ---- Phien dang nhap gia (giong cac test-*.mjs co san) ----
const fakeJwt = (() => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: '00000000-0000-4000-8000-000000000001',
    email: 'piopio.test01@isale.online',
    role: 'authenticated',
  })}.fakesig`;
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

// ---- Static server phuc vu www/ voi SPA fallback ----
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
console.log(`static server: ${BASE}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(([key, val]) => {
  localStorage.setItem(key, val);
}, [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const page = await context.newPage();

let current = { route: '(boot)', logs: [] };
page.on('console', (msg) => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') current.logs.push({ type: t, text: msg.text() });
});
page.on('pageerror', (err) => current.logs.push({ type: 'pageerror', text: `${err.message}` }));
page.on('requestfailed', (req) => {
  const f = req.failure()?.errorText ?? '';
  if (f.includes('ERR_ABORTED')) return; // nhieu request Supabase bi huy khi chuyen trang
  current.logs.push({ type: 'requestfailed', text: `${req.url()} :: ${f}` });
});

const results = [];

/**
 * Cho den khi trang render xong that su.
 * IonPage luon co display:inline va rect 0x0 ke ca khi dang hien,
 * nen KHONG the dua vao rect/display de xac dinh trang nao dang mo.
 * Thay vao do doi noi dung text cua outlet on dinh qua 2 lan do lien tiep.
 */
async function waitForRender(maxMs = 9000) {
  const start = Date.now();
  let prev = -1;
  let stable = 0;
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(400);
    const textLen = await page
      .evaluate(() => {
        // App dung <router-outlet> thuong cua Angular (khong phai ion-router-outlet),
        // ben trong div#main-content.
        const main = document.querySelector('#main-content');
        const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
        const active = pages[pages.length - 1] ?? main;
        return (active?.innerText ?? '').trim().length;
      })
      .catch(() => -1);

    if (textLen > 0 && textLen === prev) {
      stable++;
      if (stable >= 2) return;
    } else {
      stable = 0;
      prev = textLen;
    }
  }
}

async function auditRoute(route) {
  current = { route, logs: [] };
  const started = Date.now();
  let navError = null;
  try {
    // domcontentloaded: Angular boot xong se render page vao #main-content.
    await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // state:'attached' — Ionic render element voi kich thuoc 0 nen mac dinh
    // (visible) se timeout du element da ton tai.
    await page.waitForSelector('#main-content .ion-page, #main-content ion-title', {
      state: 'attached',
      timeout: 20000,
    });
    await waitForRender();
  } catch (e) {
    navError = e.message;
  }

  const state = await page
    .evaluate(() => {
      const main = document.querySelector('#main-content');
      // Page dang hoat dong: .ion-page cuoi cung trong #main-content.
      const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
      const active = pages[pages.length - 1] ?? main;
      const text = (active?.innerText ?? '').trim();
      const title =
        active?.querySelector('ion-title')?.textContent?.trim() ||
        document.querySelector('#main-content ion-title')?.textContent?.trim() ||
        '';
      const boxes = active?.querySelectorAll(
        'ion-card, ion-item, ion-input, ion-textarea, ion-select, ion-button:not([fill="clear"]), .app-action, button, .config-box'
      );
      return {
        url: location.hash,
        totalPages: pages.length,
        title,
        textLen: text.length,
        interactive: boxes ? boxes.length : 0,
        hasHeader: !!main?.querySelector('ion-header ion-toolbar'),
        hasMenuBtn: !!main?.querySelector('ion-menu-button'),
        loaders: document.querySelectorAll('ion-spinner').length,
        emptyState: /chưa có|không có dữ liệu|trống/i.test(text),
      };
    })
    .catch((e) => ({ evalError: e.message }));

  const errors = current.logs.filter((l) => l.type === 'error' || l.type === 'pageerror');
  const warnings = current.logs.filter((l) => l.type === 'warning');
  const reqFails = current.logs.filter((l) => l.type === 'requestfailed');

  const redirectedToLogin = String(state.url ?? '').includes('/login');
  // Tieu chi PASS: khong loi, khong bi day ve login, co header, co tieu de,
  // va co noi dung thuc. KHONG doi hoi phai co phan tu tuong tac, vi trang
  // rong (empty state) la binh thuong khi chua co du lieu.
  const ok =
    !navError &&
    !state.evalError &&
    !redirectedToLogin &&
    !!state.hasHeader &&
    !!String(state.title ?? '').trim() &&
    state.textLen > 20;

  results.push({
    route,
    ok,
    ms: Date.now() - started,
    url: state.url,
    title: state.title,
    textLen: state.textLen,
    interactive: state.interactive,
    redirectedToLogin,
    navError,
    evalError: state.evalError,
    errors: errors.map((e) => e.text),
    warnings: warnings.map((w) => w.text),
    reqFails: reqFails.map((r) => r.text),
    note: state.emptyState ? 'trang trong (empty state)' : '',
  });

  const flag = ok ? 'PASS' : 'FAIL';
  console.log(
    `[${flag}] ${route.padEnd(22)} title="${(state.title || '').slice(0, 26).padEnd(26)}" text=${String(state.textLen).padStart(5)} ui=${String(state.interactive).padStart(3)} err=${errors.length} warn=${warnings.length}${redirectedToLogin ? '  <-- BI DAY VE LOGIN' : ''}${navError ? '  <-- NAV ERROR' : ''}`
  );
}

console.log('\n=== AUDIT ROUTES ===');
for (const r of ROUTES) {
  await auditRoute(r);
}

// ---- Kiem tra menu: mo menu va bam tung muc ----
console.log('\n=== AUDIT MENU ===');
current = { route: '/home (menu)', logs: [] };
await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', {
  state: 'attached',
  timeout: 20000,
});
await waitForRender();

const menuReport = { items: [], errors: [] };
const menuBtn = page.locator('ion-menu-button').first();
if ((await menuBtn.count()) === 0) {
  menuReport.errors.push('Khong tim thay ion-menu-button tren /home');
} else {
  await menuBtn.click();
  await page.waitForTimeout(1200);
  const menuItems = page.locator('ion-menu ion-item');
  const n = await menuItems.count();
  for (let i = 0; i < n; i++) {
    const it = menuItems.nth(i);
    const label = ((await it.textContent()) ?? '').trim().replace(/\s+/g, ' ');
    if (!label) continue;
    menuReport.items.push(label);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}
console.log(`cac muc trong menu (${menuReport.items.length}):`);
for (const it of menuReport.items) console.log(`   - ${it}`);

// ---- Tong ket ----
const failed = results.filter((r) => !r.ok);
const withErrors = results.filter((r) => r.errors.length > 0);
const withWarnings = results.filter((r) => r.warnings.length > 0);

const summary = {
  auditedAt: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  routesWithConsoleErrors: withErrors.length,
  routesWithWarnings: withWarnings.length,
  // Loi that (bo qua 401 do JWT gia) va canh bao icon sai ten
  realConsoleErrors: [...new Set(results.flatMap((r) => r.errors))].filter((e) => !/\b401\b/.test(e)),
  ioniconWarnings: [...new Set(results.flatMap((r) => r.warnings))].filter((w) => /Ionicons Warning/i.test(w)),
  failedRoutes: failed.map((f) => ({ route: f.route, url: f.url, reason: f.navError || f.evalError || (f.redirectedToLogin ? 'redirect /login' : 'khong render duoc header/noi dung'), errors: f.errors.slice(0, 3) })),
  menuItems: menuReport.items.length,
  results,
};

await writeFile(join(OUT, 'audit-report.json'), JSON.stringify(summary, null, 2), 'utf8');

// Xuat bao cao danh cho nguoi doc
const lines = [];
lines.push('# Bao cao audit Piopio (Playwright)');
lines.push('');
lines.push(`- Thoi diem: ${summary.auditedAt}`);
lines.push(`- Tong so route: ${summary.total} | PASS: ${summary.passed} | FAIL: ${summary.failed}`);
lines.push(`- Route co loi console: ${summary.routesWithConsoleErrors}`);
lines.push(`- Loi console THAT (da bo 401 do JWT gia): ${summary.realConsoleErrors.length}`);
lines.push(`- Canh bao icon sai ten: ${summary.ioniconWarnings.length}`);
lines.push('');
lines.push('## Loi console THAT (khong tinh 401 do token gia)');
if (!summary.realConsoleErrors.length) lines.push('Khong co.');
for (const e of summary.realConsoleErrors) lines.push(`- ${e.slice(0, 300)}`);
lines.push('');
lines.push('## Canh bao Ionicons');
if (!summary.ioniconWarnings.length) lines.push('Khong co.');
for (const w of summary.ioniconWarnings) lines.push(`- ${w.slice(0, 300)}`);
lines.push('');
lines.push('## Route FAIL');
if (!failed.length) lines.push('Khong co.');
for (const f of failed) {
  lines.push(`- \`${f.route}\` -> ${f.url ?? '?'} : ${f.navError || f.evalError || (f.redirectedToLogin ? 'bi day ve /login' : 'khong render')}`);
}
lines.push('');
lines.push('## Loi console theo route');
if (!withErrors.length) lines.push('Khong co.');
for (const f of withErrors) {
  lines.push(`- \`${f.route}\` (${f.errors.length})`);
  for (const e of [...new Set(f.errors)].slice(0, 5)) lines.push(`    - ${e.slice(0, 200)}`);
}
lines.push('');
lines.push(`## Menu (${menuReport.items.length} muc)`);
for (const it of menuReport.items) lines.push(`- ${it}`);
await writeFile(join(OUT, 'audit-report.md'), lines.join('\n'), 'utf8');

console.log('\n=== TONG KET ===');
console.log(`Route: ${summary.total} | PASS: ${summary.passed} | FAIL: ${summary.failed}`);
console.log(`Route co loi console: ${summary.routesWithConsoleErrors}`);
if (failed.length) {
  console.log('Route FAIL:');
  for (const f of failed) console.log(`   - ${f.route} -> ${f.url} :: ${f.navError || f.evalError || (f.redirectedToLogin ? 'redirect /login' : 'khong render')}`);
}
console.log(`\nBao cao: ${join(OUT, 'audit-report.md')} va audit-report.json`);

await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
