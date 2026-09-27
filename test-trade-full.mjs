// Smoke test: trang Quan ly Thu/Chi nang cap (audit isale-thuchi P0-P3)
//  - Frame: 3 tab thang (mac dinh thang hien tai), loc loai giao dich,
//    toolbar Tong/Tien vao/Tien ra, summary 3 o + du bao + bieu do theo ngay
//  - Modal Them giao dich day du: Tien vao/ra, So tien (+x100/x1000), Muc (+them),
//    Mo ta, Ngay tao (date picker), Vi/Tai khoan, Hinh thuc thanh toan, Anh bien lai
//  - Bulk select bar; sheet Giao dich dinh ky
//  - /money-account: nut chuyen tien noi bo (can >=2 so)
// Chay: node test-trade-full.mjs
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
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(`${BASE}/#/trade`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const activePage = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};

const r = {};

// 1) Khung trang
r.frame = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    title: active.querySelector('ion-title')?.textContent?.trim() ?? '',
    monthTabs: Array.from(active.querySelectorAll('.month-tab')).map((m) => m.textContent.trim()),
    filterLabel: active.querySelector('.filter-row .filter-label')?.textContent?.trim() ?? '',
    filterBtn: active.querySelector('.filter-row .filter-btn')?.textContent?.trim() ?? '',
    toolbarTotal: active.querySelector('.toolbar-total')?.textContent?.trim() ?? '',
    summaryCells: Array.from(active.querySelectorAll('.trade-summary .cell .cell-label')).map((c) => c.textContent.trim()),
    hasChart: !!active.querySelector('.trade-summary .day-chart'),
    chartCols: active.querySelectorAll('.trade-summary .day-col').length,
  };
});

// 2) Tab thang hien tai (index 1) -> du bao xuat hien
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelectorAll('.month-tab')[1]?.click();
});
await page.waitForTimeout(500);
r.forecast = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const row = active.querySelector('.forecast-row')?.textContent?.trim() ?? '';
  return { hasForecast: row.includes('Dự báo'), text: row.slice(0, 90) };
});

// 3) Loc loai giao dich -> action sheet
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.filter-row .filter-btn')?.click();
});
await page.waitForTimeout(900);
r.typeSheet = await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  const btns = Array.from(sheet?.querySelectorAll('button') ?? []).map((b) => b.textContent?.trim() ?? '');
  const ok = btns.some((t) => t.includes('Toàn bộ')) && btns.some((t) => t.includes('Tiền vào')) && btns.some((t) => t.includes('Tiền ra'));
  Array.from(sheet?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Hủy'))?.click();
  return { open: !!sheet, ok };
});
await page.waitForTimeout(600);

// 4) Modal them giao dich (FAB +)
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('app-fab-trio ion-fab-button')?.click();
});
await page.waitForTimeout(1200);
r.addModal = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.show-modal ion-modal, ion-modal');
  if (!modal) return { open: false };
  const root = modal.querySelector('.ion-page') ?? modal;
  const title = root.querySelector('ion-title')?.textContent?.trim() ?? '';
  const attrLabels = Array.from(root.querySelectorAll('[label]')).map((i) => i.getAttribute('label') ?? '');
  const segLabels = Array.from(root.querySelectorAll('ion-segment-button')).map((i) => i.textContent?.trim() ?? '');
  const joined = [...attrLabels, ...segLabels].join(' | ');
  return {
    open: true,
    title,
    labels: attrLabels,
    hasSegmentInOut: segLabels.some((t) => t.includes('Tiền vào')) && segLabels.some((t) => t.includes('Tiền ra')),
    hasMoney: joined.includes('Số tiền'),
    quickButtons: Array.from(root.querySelectorAll('.trade-quick ion-button')).map((b) => b.textContent?.trim() ?? ''),
    hasCategory: joined.includes('Mục'),
    hasNote: joined.includes('Mô tả ngắn'),
    hasDate: joined.includes('Ngày tạo'),
    hasAccount: joined.includes('Ví/Tài khoản'),
    hasPayment: joined.includes('Hình thức thanh toán'),
    hasReceipts: (root.querySelector('.trade-receipts .receipts-title')?.textContent ?? '').includes('Ảnh biên lai'),
    dateInputs: root.querySelectorAll('ion-input[type="date"]').length,
  };
});
// Dong modal (nut X dau tien)
await page.evaluate(() => {
  const modal = document.querySelector('ion-modal');
  const root = modal?.querySelector('.ion-page') ?? modal;
  const btns = Array.from(root?.querySelectorAll('ion-header ion-button') ?? []);
  btns[0]?.click();
});
await page.waitForTimeout(900);

// 5) Bulk select
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('.toolbar-actions ion-button')).find((b) => b.querySelector('ion-icon[name="checkbox-outline"]'));
  btn?.click();
});
await page.waitForTimeout(700);
r.bulk = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const bar = active.querySelector('.bulk-bar');
  const ok = !!bar && bar.textContent.includes('Chọn trang');
  bar?.querySelector('ion-button:last-of-type')?.click();
  return { ok };
});
await page.waitForTimeout(500);

// 6) Giao dich dinh ky (nut repeat tren header)
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('ion-header ion-button')).find((b) => b.querySelector('ion-icon[name="repeat-outline"]'));
  btn?.click();
});
await page.waitForTimeout(900);
r.recurring = await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  const btns = Array.from(sheet?.querySelectorAll('button') ?? []).map((b) => b.textContent?.trim() ?? '');
  const ok = btns.some((t) => t.includes('Thêm định kỳ'));
  Array.from(sheet?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Đóng'))?.click();
  return { open: !!sheet, ok };
});
await page.waitForTimeout(600);

// 7) /money-account: nut chuyen tien noi bo
await page.goto(`${BASE}/#/money-account`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);
r.transfer = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('ion-header ion-button')).find((b) => b.querySelector('ion-icon[name="swap-horizontal-outline"]'));
  btn?.click();
  return { hasBtn: !!btn };
});
await page.waitForTimeout(900);
r.transferToast = await page.evaluate(() => {
  const toast = document.querySelector('ion-toast');
  const msg = toast?.shadowRoot?.querySelector('.toast-message')?.textContent ?? toast?.querySelector('.toast-message')?.textContent ?? '';
  return { msg: msg.slice(0, 90), ok: msg.includes('2 sổ tiền') };
});

const realErrors = errors.filter((e) => !/\b401\b|\b403\b|\b404\b/.test(e) && !/Failed to load resource|net::ERR|supabase|PGRST/i.test(e));
r.realConsoleErrors = realErrors.length;

console.log(JSON.stringify(r, null, 2));
for (const e of [...new Set(realErrors)]) console.log('  ERR -', e.slice(0, 200));

const pass =
  r.frame.title === 'Quản lý Thu/Chi' &&
  r.frame.monthTabs.length === 3 &&
  r.frame.filterLabel === 'Loại giao dịch' &&
  r.frame.filterBtn.includes('Toàn bộ') &&
  r.frame.toolbarTotal.includes('Tổng: 0 giao dịch') &&
  r.frame.summaryCells.join(',').includes('Tiền vào') &&
  r.frame.summaryCells.join(',').includes('Tiền ra') &&
  r.frame.summaryCells.join(',').includes('Chênh lệch') &&
  r.frame.hasChart &&
  r.frame.chartCols >= 28 &&
  r.forecast.hasForecast &&
  r.typeSheet.open && r.typeSheet.ok &&
  r.addModal.open && r.addModal.title === 'Thêm giao dịch' &&
  r.addModal.hasSegmentInOut && r.addModal.hasMoney && r.addModal.hasCategory &&
  r.addModal.hasNote && r.addModal.hasDate && r.addModal.hasAccount && r.addModal.hasPayment &&
  r.addModal.hasReceipts && r.addModal.dateInputs === 1 &&
  r.addModal.quickButtons.join(',').includes('×100') &&
  r.bulk.ok &&
  r.recurring.open && r.recurring.ok &&
  r.transfer.hasBtn && r.transferToast.ok &&
  r.realConsoleErrors === 0;

await browser.close();
server.close();
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
