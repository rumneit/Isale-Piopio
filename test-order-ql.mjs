// Smoke test: trang Quan ly don hang (dong bo ISale 09/2026)
//  - 3 tab thang, 4 tab trang thai nhanh + nut ••• mo cac trang thai phu (Nháp/Đang xử lý/Công nợ...)
//  - Toolbar: Tong don + Tong tien, chon nhieu (bulk), xuat Excel, nhap
//  - Bulk bar: Chon tat ca / Doi trang thai / Xoa / Thoat
//  - Empty state ISale; khong loi console that su
// Chay: node test-order-ql.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8343;
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
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(`${BASE}/#/order`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const activePage = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};

const r = {};

// 1) Khung trang: title, 3 tab thang, 4 tab nhanh + •••
r.frame = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    title: active.querySelector('ion-title')?.textContent?.trim() ?? '',
    monthTabs: active.querySelectorAll('.month-tab').length,
    statusTabs: Array.from(active.querySelectorAll('.status-tab')).map((t) => t.textContent.trim()),
  };
});

// 2) Toolbar: tong don, nut bulk select, export, import
r.toolbar = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const total = active.querySelector('.toolbar-total')?.textContent?.trim() ?? '';
  const icons = Array.from(active.querySelectorAll('.toolbar-actions ion-icon')).map((i) => i.getAttribute('name'));
  return { total, icons };
});

// 3) ••• mo action sheet trang thai phu -> chon "Công nợ"
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.status-tab.more-tab')?.click();
});
await page.waitForTimeout(900);
r.moreSheet = await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  if (!sheet) return { open: false };
  const btns = Array.from(sheet.querySelectorAll('button')).map((b) => b.textContent?.trim());
  return { open: true, hasCongNo: btns.some((t) => t?.includes('Công nợ')), hasAll: btns.some((t) => t?.includes('Tất cả trạng thái')), count: btns.length };
});
await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  const btns = Array.from(sheet?.querySelectorAll('button') ?? []);
  btns.find((b) => b.textContent?.includes('Công nợ'))?.click();
});
await page.waitForTimeout(800);
r.filteredByDebt = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const more = active.querySelector('.status-tab.more-tab');
  return { text: more?.textContent?.trim() ?? '', active: more?.classList.contains('active') ?? false };
});

// 4) Ve "Toàn bộ"
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const tabs = Array.from(active.querySelectorAll('.status-tab'));
  tabs.find((t) => t.textContent.trim() === 'Toàn bộ')?.click();
});
await page.waitForTimeout(500);

// 5) Bat che do chon nhieu -> bulk bar hien
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('.toolbar-actions ion-button')).find((b) => b.textContent.includes('') && b.querySelector('ion-icon[name="checkbox-outline"]'));
  btn?.click();
});
await page.waitForTimeout(700);
r.bulkBar = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const bar = active.querySelector('.bulk-bar');
  if (!bar) return { open: false };
  const txt = bar.textContent;
  return { open: true, chonTatCa: txt.includes('Chọn tất cả'), doiTrangThai: txt.includes('Đổi trạng thái'), xoa: txt.includes('Xóa'), thoat: txt.includes('Thoát') };
});

// 6) Thoat che do chon -> bulk bar an
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const bar = active.querySelector('.bulk-bar');
  const btns = Array.from(bar?.querySelectorAll('button') ?? []);
  btns.find((b) => b.textContent.trim() === 'Thoát')?.click();
});
await page.waitForTimeout(500);
r.bulkBarClosed = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return !active.querySelector('.bulk-bar');
});

// 7) Empty state ISale
r.emptyState = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const empty = active.querySelector('.order-empty');
  return { present: !!empty, mentionsPrint: empty?.textContent?.includes('in đơn hàng') ?? false };
});

const realErrors = errors.filter((e) => !/\b401\b/.test(e) && !/Failed to load resource|net::ERR|supabase/i.test(e));
r.realConsoleErrors = realErrors.length;

console.log(JSON.stringify(r, null, 2));
for (const e of [...new Set(realErrors)]) console.log('  ERR -', e.slice(0, 200));

const pass =
  r.frame.title === 'Đơn hàng' &&
  r.frame.monthTabs === 3 &&
  r.frame.statusTabs.length === 5 &&
  r.toolbar.total.includes('Tổng: 0 đơn hàng') &&
  r.toolbar.icons.includes('checkbox-outline') &&
  r.toolbar.icons.includes('download-outline') &&
  r.moreSheet.open &&
  r.moreSheet.hasCongNo &&
  r.moreSheet.hasAll &&
  r.filteredByDebt.text === 'Công nợ' &&
  r.filteredByDebt.active &&
  r.bulkBar.open && r.bulkBar.chonTatCa && r.bulkBar.doiTrangThai && r.bulkBar.xoa && r.bulkBar.thoat &&
  r.bulkBarClosed &&
  r.emptyState.present &&
  r.emptyState.mentionsPrint &&
  r.realConsoleErrors === 0;

console.log('RESULT:', pass ? 'PASS' : 'FAIL');
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
