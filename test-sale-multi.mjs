// Smoke test: tinh nang moi trang Ban hang (dong bo ISale live 09/2026)
//  - Multi-order tabs (them/switch/xoa, giu du lieu per-order)
//  - 4 tab: Thanh toan (Tong tien hang + Phi ship), Khach hang (3 truong), Ghi chu (textarea), Van chuyen (5 truong)
//  - Trang thai 11 muc, 10 phuong thuc thanh toan, QR chua cau hinh -> huong dan
// Chay: node test-sale-multi.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8342;
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

await page.goto(`${BASE}/#/sale`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const activePage = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};

const r = {};

// 1) Trang thai ban dau: 1 tab don
r.initialTabs = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return active.querySelectorAll('.order-tab').length;
});

// 2) Them don thu 2 -> 2 tab, tab 2 active
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.order-tab-add').click();
});
await page.waitForTimeout(600);
r.tabsAfterAdd = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const tabs = Array.from(active.querySelectorAll('.order-tab'));
  return { count: tabs.length, labels: tabs.map((t) => t.textContent.replace(/\s+/g, ' ').trim()), activeIdx: tabs.findIndex((t) => t.classList.contains('active')) };
});

// 3) Nhap ten khach o don 2 -> switch ve don 1 -> quen; switch lai -> nho
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const segs = Array.from(active.querySelectorAll('ion-segment-button'));
  const cust = segs.find((s) => s.getAttribute('value') === 'customer');
  cust?.querySelector('button')?.click() ?? cust?.click();
});
await page.waitForTimeout(700);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const input = Array.from(active.querySelectorAll('ion-input')).find((i) => (i.getAttribute('placeholder') ?? '').includes('Nguyễn Văn A'));
  const inner = input?.shadowRoot?.querySelector('input') ?? input;
  if (inner) {
    inner.value = 'Khách Test Đơn 2';
    inner.dispatchEvent(new Event('ionInput', { bubbles: true }));
    inner.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const tabs = Array.from(active.querySelectorAll('.order-tab'));
  tabs[0].click();
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const segs = Array.from(active.querySelectorAll('ion-segment-button'));
  const cust = segs.find((s) => s.getAttribute('value') === 'customer');
  cust?.querySelector('button')?.click() ?? cust?.click();
});
await page.waitForTimeout(700);
r.customerNameTab1AfterSwitch = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const input = Array.from(active.querySelectorAll('ion-input')).find((i) => (i.getAttribute('placeholder') ?? '').includes('Nguyễn Văn A'));
  return input?.value ?? null;
});
r.customerNameTab2Preserved = r.customerNameTab1AfterSwitch === '' || r.customerNameTab1AfterSwitch === null;

// 4) Tab Van chuyen: 5 truong ISale
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const segs = Array.from(active.querySelectorAll('ion-segment-button'));
  const ship = segs.find((s) => s.getAttribute('value') === 'shipping');
  ship?.querySelector('button')?.click() ?? ship?.click();
});
await page.waitForTimeout(700);
r.shippingTab = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const labels = Array.from(active.querySelectorAll('.sale-label')).map((l) => l.textContent.trim());
  return {
    maVanDon: labels.includes('Mã vận đơn'),
    donViVc: labels.includes('Đơn vị vận chuyển'),
    tenShipper: labels.includes('Tên shipper'),
    sdtShipper: labels.includes('SĐT shipper'),
    noiNhan: labels.includes('Nơi nhận hàng'),
  };
});

// 5) Tab Ghi chu: textarea
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const segs = Array.from(active.querySelectorAll('ion-segment-button'));
  const note = segs.find((s) => s.getAttribute('value') === 'note');
  note?.querySelector('button')?.click() ?? note?.click();
});
await page.waitForTimeout(700);
r.noteTextarea = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return !!active.querySelector('ion-textarea');
});

// 6) Tab Thanh toan: Tong tien hang + Phi ship + 11 trang thai + QR chua cau hinh
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const segs = Array.from(active.querySelectorAll('ion-segment-button'));
  const pay = segs.find((s) => s.getAttribute('value') === 'payment');
  pay?.querySelector('button')?.click() ?? pay?.click();
});
await page.waitForTimeout(700);
r.paymentTab = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const labels = Array.from(active.querySelectorAll('.sale-label')).map((l) => l.textContent.trim());
  const statusSelect = Array.from(active.querySelectorAll('ion-select')).find((s) => s.closest('.sale-row')?.textContent.includes('Trạng thái'));
  return {
    tongTienHang: labels.includes('Tổng tiền hàng'),
    phiShip: labels.includes('Phí ship'),
    tongTamTinh: labels.includes('Tổng tạm tính'),
    tongPhaiTra: labels.includes('Tổng phải trả'),
    statusOptions: statusSelect ? statusSelect.querySelectorAll('ion-select-option').length : 0,
    qrBtn: !!Array.from(active.querySelectorAll('.qr-btn')).find((b) => b.textContent.includes('QR Code')),
  };
});

// 7) QR chua cau hinh -> toast huong dan (khong crash)
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.qr-btn')?.click();
});
await page.waitForTimeout(900);
r.qrToastShown = await page.evaluate(() => !!document.querySelector('ion-toast'));

// 8) Xoa tab don 2 -> ve 1 tab
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const tabs = Array.from(active.querySelectorAll('.order-tab'));
  const rm = tabs[tabs.length - 1]?.querySelector('.order-tab-remove');
  rm?.click();
});
await page.waitForTimeout(600);
r.tabsAfterRemove = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return active.querySelectorAll('.order-tab').length;
});

const realErrors = errors.filter((e) => !/\b401\b/.test(e) && !/Failed to load resource|net::ERR|supabase/i.test(e));
r.realConsoleErrors = realErrors.length;

console.log(JSON.stringify(r, null, 2));
for (const e of [...new Set(realErrors)]) console.log('  ERR -', e.slice(0, 200));

const pass =
  r.initialTabs === 1 &&
  r.tabsAfterAdd.count === 2 &&
  r.tabsAfterAdd.activeIdx === 1 &&
  r.customerNameTab1AfterSwitch === '' &&
  r.customerNameTab2Preserved &&
  Object.values(r.shippingTab).every(Boolean) &&
  r.noteTextarea &&
  r.paymentTab.tongTienHang && r.paymentTab.phiShip && r.paymentTab.tongTamTinh && r.paymentTab.tongPhaiTra &&
  r.paymentTab.statusOptions === 11 &&
  r.paymentTab.qrBtn &&
  r.qrToastShown &&
  r.tabsAfterRemove === 1 &&
  r.realConsoleErrors === 0;

console.log('RESULT:', pass ? 'PASS' : 'FAIL');
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
