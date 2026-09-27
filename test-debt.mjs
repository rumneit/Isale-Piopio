// Smoke test: trang Quan ly cong no (dong bo ISale 09/2026)
//  - 3 tab thang, chip loc: Tat ca + 4 kieu vay/no ISale + Chi con no + nut funel
//  - Funnel -> action sheet loc kieu vay/no
//  - Modal Them/Sua vay/no (form ISale debt-add): kieu, doi tac, so tien,
//    muc, lai suat, ngay tao, ngay den han, da tra toggle, ghi chu
//  - Tong ket 3 o: Con phai thu / Con phai tra / Tong gia tri; empty state ISale
// Chay: node test-debt.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8347;
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

await page.goto(`${BASE}/#/debt`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const activePage = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};

const r = {};

// 1) Khung trang: title, 3 tab thang, chip row
r.frame = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const chips = Array.from(active.querySelectorAll('.debt-chip'))
    .map((c) => c.textContent.trim())
    .filter((t) => t.length > 0);
  return {
    title: active.querySelector('ion-title')?.textContent?.trim() ?? '',
    monthTabs: active.querySelectorAll('.month-tab').length,
    chips,
    filterBtn: !!active.querySelector('.debt-chip.filter-btn'),
  };
});

// 2) Chip "Da vay ban" -> active
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  Array.from(active.querySelectorAll('.debt-chip')).find((c) => c.textContent.includes('Đã vay bạn'))?.click();
});
await page.waitForTimeout(400);
r.chipLentActive = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const c = Array.from(active.querySelectorAll('.debt-chip')).find((c) => c.textContent.includes('Đã vay bạn'));
  return c?.classList.contains('active') ?? false;
});

// 3) Chip "Chi con no" -> active
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  Array.from(active.querySelectorAll('.debt-chip')).find((c) => c.textContent.includes('Chỉ còn nợ'))?.click();
});
await page.waitForTimeout(400);
r.leftOnlyActive = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const c = Array.from(active.querySelectorAll('.debt-chip')).find((c) => c.textContent.includes('Chỉ còn nợ'));
  return c?.classList.contains('active') ?? false;
});
// ve "Tat ca" + tat left-only
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  Array.from(active.querySelectorAll('.debt-chip')).find((c) => c.textContent.trim() === 'Tất cả')?.click();
  Array.from(active.querySelectorAll('.debt-chip')).find((c) => c.textContent.includes('Chỉ còn nợ'))?.click();
});
await page.waitForTimeout(300);

// 4) Funnel -> action sheet loc
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.debt-chip.filter-btn')?.click();
});
await page.waitForTimeout(900);
r.filterSheet = await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  if (!sheet) return { open: false };
  const btns = Array.from(sheet.querySelectorAll('button')).map((b) => b.textContent?.replace(/[✓\s]+/g, ' ').trim());
  return {
    open: true,
    btns,
    hasAll: btns.some((t) => t?.startsWith('Tất cả')),
    hasBorrowed: btns.some((t) => t?.startsWith('Bạn đã vay')),
    hasLent: btns.some((t) => t?.startsWith('Đã vay bạn')),
    hasPayable: btns.some((t) => t?.startsWith('Nợ phải trả')),
    hasReceivable: btns.some((t) => t?.startsWith('Nợ của khách')),
    hasLeftOnly: btns.some((t) => t?.includes('Chỉ hiện các khoản vẫn còn nợ')),
  };
});
await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  Array.from(sheet?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Đóng') || b.textContent?.includes('Cancel'))?.click();
});
await page.waitForTimeout(600);

// 5) Modal Them vay/no (nut + tren header)
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btns = Array.from(active.querySelectorAll('ion-header ion-button'));
  btns[btns.length - 1]?.click();
});
await page.waitForTimeout(900);
r.addModal = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal');
  if (!modal) return { open: false };
  const root = modal.querySelector('.ion-page') ?? modal;
  const title = root.querySelector('ion-title')?.textContent?.trim() ?? '';
  // label cua ion-input/ion-select nam trong attribute (shadow DOM khong doc qua textContent)
  const labels = Array.from(root.querySelectorAll('[label]')).map((i) => i.getAttribute('label') ?? '');
  const joined = labels.join(' | ');
  return {
    open: true,
    title,
    labels,
    hasType: joined.includes('Kiểu vay/nợ'),
    hasParty: joined.includes('Tên người/đối tác'),
    hasMoney: joined.includes('Số tiền'),
    hasCategory: joined.includes('Mục'),
    hasInterest: joined.includes('Lãi suất'),
    hasCreatedAt: joined.includes('Ngày tạo'),
    hasMaturity: joined.includes('Ngày đến hạn'),
    hasPaid: joined.includes('Đã trả?'),
    hasNote: joined.includes('Mô tả ngắn'),
    dateInputs: root.querySelectorAll('ion-input[type="date"]').length,
  };
});
// Dong modal (nut X)
await page.evaluate(() => {
  const modal = document.querySelector('ion-modal');
  const root = modal?.querySelector('.ion-page') ?? modal;
  const btns = Array.from(root?.querySelectorAll('ion-header ion-button') ?? []);
  btns[0]?.click();
});
await page.waitForTimeout(800);

// 6) Tong ket 3 o + toolbar + empty state
r.summary = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const summary = Array.from(active.querySelectorAll('.summary-item')).map((s) => s.textContent.trim());
  return {
    count: summary.length,
    hasCollect: summary.some((s) => s.includes('Còn phải thu')),
    hasPay: summary.some((s) => s.includes('Còn phải trả')),
    hasTotal: summary.some((s) => s.includes('Tổng giá trị')),
  };
});
r.toolbar = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    total: active.querySelector('.toolbar-total')?.textContent?.trim() ?? '',
    empty: active.querySelector('.debt-empty')?.textContent?.includes('Chưa có khoản Vay/Nợ nào') ?? false,
  };
});

const realErrors = errors.filter((e) => !/\b401\b/.test(e) && !/Failed to load resource|net::ERR|supabase/i.test(e));
r.realConsoleErrors = realErrors.length;

console.log(JSON.stringify(r, null, 2));
for (const e of [...new Set(realErrors)]) console.log('  ERR -', e.slice(0, 200));

const pass =
  r.frame.title === 'Quản lý công nợ' &&
  r.frame.monthTabs === 3 &&
  r.frame.chips.length === 6 &&
  r.frame.chips.includes('Tất cả') &&
  r.frame.chips.includes('Bạn đã vay') &&
  r.frame.chips.includes('Đã vay bạn') &&
  r.frame.chips.includes('Nợ phải trả') &&
  r.frame.chips.includes('Nợ của khách') &&
  r.frame.chips.includes('Chỉ còn nợ') &&
  r.frame.filterBtn &&
  r.chipLentActive &&
  r.leftOnlyActive &&
  r.filterSheet.open && r.filterSheet.hasAll && r.filterSheet.hasBorrowed && r.filterSheet.hasLent &&
  r.filterSheet.hasPayable && r.filterSheet.hasReceivable && r.filterSheet.hasLeftOnly &&
  r.addModal.open && r.addModal.title === 'Thêm vay/nợ' &&
  r.addModal.hasType && r.addModal.hasParty && r.addModal.hasMoney && r.addModal.hasCategory &&
  r.addModal.hasInterest && r.addModal.hasCreatedAt && r.addModal.hasMaturity && r.addModal.hasPaid && r.addModal.hasNote &&
  r.addModal.dateInputs === 2 &&
  // summary chi render khi co du lieu (trang rong -> empty state); dung thu tu qua du lieu that
  (r.summary.count === 0 || (r.summary.count === 3 && r.summary.hasCollect && r.summary.hasPay && r.summary.hasTotal)) &&
  r.toolbar.total.includes('Tổng: 0 công nợ') &&
  r.toolbar.empty &&
  r.realConsoleErrors === 0;

await browser.close();
server.close();
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
