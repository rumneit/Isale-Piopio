// Smoke test: trang Don tu Website (dong bo ISale 09/2026)
//  - 3 tab thang, toolbar: tim kiem + funnel loc trang thai + Tong tien + so don
//  - Empty state ISale (khong the sua, chi chuyen doi sang don thuong)
//  - Funnel mo sheet 11 trang thai + Tat ca; tim kiem toggle
// Chay: node test-online-order.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8346;
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
const session = { access_token: fakeJwt, token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake', user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'piopio.test01@isale.online', user_metadata: { full_name: 'Test' }, created_at: new Date().toISOString() } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(`${BASE}/#/online-order`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const r = {};

// 1) Khung trang
r.frame = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    title: active.querySelector('ion-title')?.textContent?.trim() ?? '',
    monthTabs: active.querySelectorAll('.month-tab').length,
    total: active.querySelector('.online-total')?.textContent?.trim() ?? '',
    count: active.querySelector('.online-count')?.textContent?.trim() ?? '',
  };
});

// 2) Empty state ISale
r.empty = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const e = active.querySelector('.online-empty');
  return { present: !!e, mentionsConvert: e?.textContent?.includes('Chuyển đổi sang đơn thường') ?? false };
});

// 3) Tim kiem toggle
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('.online-toolbar ion-button')).find((b) => b.querySelector('ion-icon[name="search-outline"]'));
  btn?.click();
});
await page.waitForTimeout(600);
r.searchbar = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return !!active.querySelector('ion-searchbar');
});

// 4) Funnel -> sheet trang thai -> chon Tat ca
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.funnel-btn')?.click();
});
await page.waitForTimeout(900);
r.sheet = await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  if (!sheet) return { open: false };
  const btns = Array.from(sheet.querySelectorAll('button')).map((b) => b.textContent?.trim());
  return { open: true, count: btns.length, hasAll: btns.some((t) => t?.includes('Tất cả trạng thái')), hasCongNo: btns.some((t) => t?.includes('Công nợ')) };
});
await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  const btns = Array.from(sheet?.querySelectorAll('button') ?? []);
  btns.find((b) => b.textContent?.includes('Tất cả trạng thái'))?.click();
});
await page.waitForTimeout(600);
r.funnelReset = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return !active.querySelector('.funnel-btn.active');
});

const realErrors = errors.filter((e) => !/\b401\b/.test(e) && !/Failed to load resource|net::ERR|supabase/i.test(e));
r.realConsoleErrors = realErrors.length;

console.log(JSON.stringify(r, null, 2));
for (const e of [...new Set(realErrors)]) console.log('  ERR -', e.slice(0, 200));

const pass =
  r.frame.title === 'Đơn từ Website' &&
  r.frame.monthTabs === 3 &&
  r.frame.total.includes('Tổng: 0') &&
  r.frame.count.includes('0 đơn hàng') &&
  r.empty.present && r.empty.mentionsConvert &&
  r.searchbar &&
  r.sheet.open && r.sheet.hasAll && r.sheet.hasCongNo && r.sheet.count === 13 &&
  r.funnelReset &&
  r.realConsoleErrors === 0;

console.log('RESULT:', pass ? 'PASS' : 'FAIL');
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
