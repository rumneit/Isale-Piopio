// Audit toan bo route cua app Piopio bang Playwright (chay local, khong push)
// Cach chay:  npm run build  ->  node audit.mjs
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
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

// ---- Danh sach du phong cho checkout khong co source route ----
// Danh sach chinh duoc phat hien tu app.routes.ts o ben duoi de tranh audit
// bi lech khi route duoc them, xoa hoac doi ten.
const ROUTES_FALLBACK = [
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
  '/shipping-partners',
  '/point-config',
  '/level-config',
  '/ai-dynamic-page',
  '/ai-page/00000000-0000-4000-8000-000000000000',
  '/cyberlotus-tax',
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

const routeSource = await readFile(join(process.cwd(), 'src', 'app', 'app.routes.ts'), 'utf8').catch(() => '');
const discoveredRoutes = [...routeSource.matchAll(/\bpath\s*:\s*'([^']+)'/g)]
  .map((match) => match[1])
  .filter((path) => path && path !== '**' && path !== 'login' && path !== 'reset-password')
  .map((path) => `/${path.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000000')}`);
const ROUTES = [...new Set(discoveredRoutes.length ? discoveredRoutes : ROUTES_FALLBACK)];
const requestedRoutes = (process.env.AUDIT_ROUTES ?? '')
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean);
const ROUTES_TO_AUDIT = requestedRoutes.length ? requestedRoutes : ROUTES;

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

const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Trình duyệt không hỗ trợ: ${browserName}`);
const viewport = {
  width: Number(process.env.VIEWPORT_WIDTH ?? 390),
  height: Number(process.env.VIEWPORT_HEIGHT ?? 844),
};
const browser = await browserType.launch();
const context = await browser.newContext({ viewport });
await context.addInitScript(([key, val]) => {
  localStorage.setItem(key, val);
}, [`sb-${REF}-auth-token`, JSON.stringify(session)]);

// Khong dung JWT gia de goi Supabase that: token se bi tu choi, guard day moi
// route ve /home va tao ket qua PASS gia. Mock lop HTTP o day de moi route duoc
// render trong mot tenant rong, co owner hop le, hoan toan khong ghi production.
const SHOP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = session.user.id;
const profile = { id: USER_ID, shop_id: SHOP_ID, full_name: 'QA Owner', role: 'owner', permissions: {} };
const shop = { id: SHOP_ID, name: 'QA Shop', owner_id: USER_ID, created_at: new Date().toISOString() };
await context.route('**/*', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200, headers = {}) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers });

  if (url.pathname.includes('/auth/v1/')) {
    if (url.pathname.endsWith('/user')) return json(session.user);
    if (url.pathname.includes('/token') || url.pathname.includes('/session')) return json(session);
    return json({});
  }
  if (url.pathname.includes('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/').pop();
    if (fn === 'report_kpis') {
      return json({ current: { revenue: 0, orders: 0, cogs: 0, profit: 0, income: 0, expense: 0 }, prev: {}, yoy: {} });
    }
    return json([]);
  }
  if (url.pathname.includes('/rest/v1/')) {
    const table = url.pathname.split('/rest/v1/')[1].split('/')[0];
    const rows = {
      profiles: [profile],
      shops: [shop],
      settings: [],
      money_accounts: [],
    }[table] ?? [];
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (req.method() !== 'GET') return json(single ? (rows[0] ?? {}) : []);
    return json(single ? (rows[0] ?? null) : rows, 200, {
      'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
    });
  }
  return route.continue();
});

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

  const errors = current.logs
    .filter((l) => l.type === 'error' || l.type === 'pageerror')
    // Firefox có thể ghi Cloudflare/Supabase cookie chéo miền thành
    // "JavaScript Error" dù trang và websocket vẫn hoạt động. Đây là chẩn
    // đoán của trình duyệt, không phải exception ứng dụng.
    .filter((l) => !/Cookie .*rejected for invalid domain/i.test(l.text));
  const warnings = current.logs.filter((l) => l.type === 'warning');
  const reqFails = current.logs.filter((l) => l.type === 'requestfailed');

  const renderedPath = String(state.url ?? '').replace(/^#/, '').split('?')[0];
  const expectedPath = route === '/order/add' ? '/sale' : route;
  const redirectedToLogin = renderedPath.includes('/login');
  // Tieu chi PASS: khong loi, khong bi day ve login, co header, co tieu de,
  // va co noi dung thuc. KHONG doi hoi phai co phan tu tuong tac, vi trang
  // rong (empty state) la binh thuong khi chua co du lieu.
  const ok =
    !navError &&
    !state.evalError &&
    !redirectedToLogin &&
    renderedPath === expectedPath &&
    errors.length === 0 &&
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
    renderedPath,
    expectedPath,
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
for (const r of ROUTES_TO_AUDIT) {
  await auditRoute(r);
}

// Axe trên các luồng đại diện, vì quét mọi biến thể dữ liệu của 89 route là
// không khả thi trong smoke test. Kết quả được ghi riêng, không bị đánh tráo
// thành chứng nhận WCAG cho toàn hệ thống.
console.log('\n=== ACCESSIBILITY SAMPLE (WCAG 2.2 AA) ===');
const a11yRoutes = ['/home', '/sale', '/order', '/product', '/contact', '/debt', '/config'];
const a11yResults = [];
for (const route of a11yRoutes) {
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#main-content .ion-page, #main-content ion-title', {
    state: 'attached',
    timeout: 20000,
  });
  await waitForRender();
  const analysis = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = analysis.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.length,
    targets: violation.nodes.slice(0, 5).map((node) => node.target),
  }));
  a11yResults.push({ route, violations });
  console.log(`[${violations.length ? 'FAIL' : 'PASS'}] ${route.padEnd(12)} violations=${violations.length}`);
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
  browser: browserName,
  viewport,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  routesWithConsoleErrors: withErrors.length,
  routesWithWarnings: withWarnings.length,
  // Loi that (bo qua 401 do JWT gia) va canh bao icon sai ten
  realConsoleErrors: [...new Set(results.flatMap((r) => r.errors))].filter((e) => !/\b401\b/.test(e)),
  ioniconWarnings: [...new Set(results.flatMap((r) => r.warnings))].filter((w) => /Ionicons Warning/i.test(w)),
  failedRoutes: failed.map((f) => ({
    route: f.route,
    url: f.url,
    reason: f.navError || f.evalError || (f.redirectedToLogin
      ? 'redirect /login'
      : f.renderedPath !== f.expectedPath
        ? `redirect ${f.renderedPath}`
        : f.errors[0] || 'khong render duoc header/noi dung'),
    errors: f.errors.slice(0, 3),
  })),
  accessibility: {
    sampledRoutes: a11yRoutes.length,
    routesWithViolations: a11yResults.filter((r) => r.violations.length > 0).length,
    totalViolationRules: a11yResults.reduce((sum, r) => sum + r.violations.length, 0),
    results: a11yResults,
  },
  menuItems: menuReport.items.length,
  results,
};

const artifactStem = `audit-report-${browserName}-${viewport.width}x${viewport.height}`;
await writeFile(join(OUT, `${artifactStem}.json`), JSON.stringify(summary, null, 2), 'utf8');
await writeFile(join(OUT, 'audit-report.json'), JSON.stringify(summary, null, 2), 'utf8');

// Xuat bao cao danh cho nguoi doc
const lines = [];
lines.push('# Bao cao audit Piopio (Playwright)');
lines.push('');
lines.push(`- Thoi diem: ${summary.auditedAt}`);
lines.push(`- Trinh duyet: ${browserName} | viewport: ${viewport.width}x${viewport.height}`);
lines.push(`- Tong so route: ${summary.total} | PASS: ${summary.passed} | FAIL: ${summary.failed}`);
lines.push(`- Route co loi console: ${summary.routesWithConsoleErrors}`);
lines.push(`- Loi console THAT (da bo 401 do JWT gia): ${summary.realConsoleErrors.length}`);
lines.push(`- Canh bao icon sai ten: ${summary.ioniconWarnings.length}`);
lines.push(`- Axe WCAG 2.2 AA: ${summary.accessibility.totalViolationRules} rule violation tren ${summary.accessibility.sampledRoutes} route mau`);
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
lines.push('## Accessibility sample');
for (const result of a11yResults) {
  lines.push(`- \`${result.route}\`: ${result.violations.length} rule violation`);
  for (const violation of result.violations) {
    lines.push(`    - ${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}; nodes=${violation.nodes}`);
  }
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
await writeFile(join(OUT, `${artifactStem}.md`), lines.join('\n'), 'utf8');
await writeFile(join(OUT, 'audit-report.md'), lines.join('\n'), 'utf8');

console.log('\n=== TONG KET ===');
console.log(`Route: ${summary.total} | PASS: ${summary.passed} | FAIL: ${summary.failed}`);
console.log(`Route co loi console: ${summary.routesWithConsoleErrors}`);
if (failed.length) {
  console.log('Route FAIL:');
  for (const f of failed) console.log(`   - ${f.route} -> ${f.url} :: ${f.navError || f.evalError || (f.redirectedToLogin ? 'redirect /login' : 'khong render')}`);
}
console.log(`\nBao cao: ${join(OUT, `${artifactStem}.md`)} va ${artifactStem}.json`);

await browser.close();
server.close();
process.exit(failed.length ? 1 : 0);
