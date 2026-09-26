// Test trang CHI TIẾT SẢN PHẨM (/product/detail/:id) — clone ISale live 09/2026
// 6 tab chữ pill, chips 3 màu, lưới trường + toggle lưu ngay, barcode canvas,
// đơn vị quy đổi có phép tính, lịch sử có card lọc, AI button, summary + dashed empty.
// Chạy: node test-product-detail.mjs   (yêu cầu đã build: npm run build)
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

const now = new Date().toISOString();
const SHOP = { id: '11111111-1111-4111-8111-111111111111', name: 'Shop Test', owner_id: session.user.id, created_at: now };
const PRODUCT = {
  id: 'p1',
  shop_id: SHOP.id,
  name: '[TAS.1] Đũa tách OPP kèm Tăm',
  sku: 'TAS001',
  unit: 'Bao',
  price: 15000,
  cost: 11000,
  stock: -520,
  category_id: null,
  active: true,
  serial_managed: false,
  expiry_date: null,
  barcode: '8934506789123',
  image: null,
  images: [],
  price_wholesale: 13500,
  price_ctv: 12800,
  units: [{ name: 'Thùng (40 Bao)', conversion: 40, price: 540000, cost: 430000 }],
  discounts: [],
  options: [],
  tags: ['bán chạy'],
  dich_vu: false,
  ngoai_te: false,
  gia_nhap_nt: null,
  hien_tren_web: true,
  ban_chay: false,
  moi: false,
  hien_gia_web: false,
  khuyen_mai: false,
  mo_ta: 'Đũa tách OPP kèm tăm',
  price_settings: [
    { type: 'Khách sỉ', name: 'Cửa hàng ABC', price: 13500 },
    { type: 'CTV', name: 'CTV Nguyễn', price: 12800 },
  ],
  barcodes: ['8934506789123'],
  custom_fields: [{ key: 'Xuất xứ', value: 'Việt Nam' }],
  created_at: now,
};

const patches = [];
const errors = [];
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await ctx.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = req.url();
  const table = url.split('/rest/v1/')[1]?.split('?')[0] ?? '';
  if (req.method() === 'PATCH') {
    patches.push({ table, body: req.postDataJSON() ?? {} });
    await route.fulfill({ status: 204, contentType: 'application/json', body: '' });
    return;
  }
  let body = [];
  if (table === 'shops') body = [SHOP];
  else if (table === 'profiles') body = [{ id: session.user.id, full_name: 'Test', role: 'owner', shop_id: SHOP.id }];
  else if (table === 'products') {
    // get(:id) -> id=eq.p1 trả 1 object; list -> array
    body = /[?&]id=eq\./.test(url) ? PRODUCT : [PRODUCT];
  } else if (table === 'categories') body = [{ id: 'c1', name: 'Nhựa' }];
  else body = []; // lịch sử & bảng khác: rỗng
  const count = Array.isArray(body) ? body.length : 1;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` }, body: JSON.stringify(body) });
});

await page.goto(`${BASE}/#/product/detail/p1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.pd-grid', { timeout: 25000 });
await page.waitForTimeout(2500);

const uiRaw = await page.evaluate(() => {
    const main = document.querySelector('#main-content');
    const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
    const active = pages[pages.length - 1] ?? main;
    const q = (sel) => active?.querySelector(sel);
    const qa = (sel) => Array.from(active?.querySelectorAll(sel) ?? []);
    // probe màu success để so màu money-field
    const probe = document.createElement('span');
    probe.style.color = 'var(--ion-color-success)';
    document.body.appendChild(probe);
    const successRgb = getComputedStyle(probe).color;
    probe.remove();
    return {
      title: q('ion-title')?.textContent?.trim(),
      endIcons: qa('ion-buttons[slot="end"] ion-button ion-icon').map((i) => i.getAttribute('name')),
      segButtons: qa('ion-segment.pd-tabs ion-segment-button ion-label').map((l) => l.textContent?.trim()),
      segIconCount: qa('ion-segment.pd-tabs ion-segment-button ion-icon').length,
      chips: qa('.pd-chip').map((c) => ({ text: c.textContent?.trim(), bg: getComputedStyle(c).backgroundColor })),
      gridLabels: qa('.pd-field .pd-label').map((l) => l.textContent?.trim()),
      moneyColor: q('.pd-field .pd-val.money-field') ? getComputedStyle(q('.pd-field .pd-val.money-field')).color : null,
      successRgb,
      toggleCount: qa('.pd-grid ion-toggle').length,
      thumbCount: qa('.pd-grid .pd-thumb').length,
      customRow: qa('.pd-field .pd-label').some((l) => l.textContent?.trim() === 'Xuất xứ'),
    };
  });

const ui = uiRaw;

// ---------- Tương tác: toggle "Bán chạy" -> PATCH ban_chay: true ----------
const banChayToggle = page.locator('.pd-field:has-text("Bán chạy") ion-toggle').first();
await banChayToggle.click();
await page.waitForTimeout(1400);

// ---------- Menu ⋮ -> Xem mã vạch -> panel canvas ----------
await page.locator('ion-buttons[slot="end"] ion-button').nth(2).click(); // nút thứ 3 = ⋮
await page.waitForTimeout(600);
await page.getByText('Xem mã vạch', { exact: true }).click();
await page.waitForTimeout(1000);
const barcodeUi = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const c = active?.querySelector('.pd-barcode canvas');
  return { visible: !!c, w: c ? c.getBoundingClientRect().width : 0 };
});

// ---------- Tab Đơn vị khác ----------
await page.locator('ion-segment-button:has-text("Đơn vị khác")').click();
await page.waitForTimeout(900);
const unitsUi = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    intro: active?.querySelector('.pd-intro')?.textContent?.trim(),
    baseUnit: active?.querySelector('.pd-card .pd-row b')?.textContent?.trim(),
    altHead: active?.querySelector('.pd-card-head.alt')?.textContent?.replace(/\s+/g, ' ').trim(),
    ratio: active?.querySelectorAll('.pd-card')[1]?.querySelectorAll('.pd-row')[3]?.querySelector('b')?.textContent?.trim(),
    calc: active?.querySelector('.pd-calc')?.textContent?.replace(/\s+/g, ' ').trim(),
  };
});

// ---------- Tab Lịch sử ----------
await page.locator('ion-segment-button:has-text("Lịch sử Nhập/Xuất")').click();
await page.waitForTimeout(1200);
const histUi = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    rangeText: active?.querySelector('.pd-hist-range')?.textContent?.replace(/\s+/g, ' ').trim(),
    total: active?.querySelector('.pd-hist-total')?.textContent?.trim(),
    hasFunnel: !!active?.querySelector('.pd-funnel'),
    dateInputs: active?.querySelectorAll('input.pd-date').length ?? 0,
  };
});

// ---------- Tab Ảnh ----------
await page.locator('ion-segment-button:has-text("Ảnh")').first().click();
await page.waitForTimeout(900);
const imgUi = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    aiBtn: active?.querySelector('.pd-ai-btn')?.textContent?.replace(/\s+/g, ' ').trim(),
    addTile: !!active?.querySelector('.pd-gallery-add'),
  };
});

// ---------- Tab Giá khách & CTV ----------
await page.locator('ion-segment-button:has-text("Giá khách")').click();
await page.waitForTimeout(900);
const priceUi = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    total: active?.querySelector('.pd-summary-total')?.textContent?.trim(),
    rows: active?.querySelectorAll('.pd-itemrow').length ?? 0,
    firstName: active?.querySelector('.pd-itemrow .name')?.textContent?.replace(/\s+/g, ' ').trim(),
    hasCtvBadge: !!active?.querySelector('.pd-type.ctv'),
    plusBtn: !!active?.querySelector('.pd-summary .pd-plus'),
  };
});

// ---------- Tab Chiết khấu (empty -> dashed box) ----------
await page.locator('ion-segment-button:has-text("Chiết khấu")').click();
await page.waitForTimeout(900);
const discUi = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    total: active?.querySelector('.pd-summary-total')?.textContent?.trim(),
    emptyText: active?.querySelector('.pd-emptybox')?.textContent?.trim(),
  };
});

// ---------- Modal Phân loại + Nhiều mã vạch ----------
await page.locator('ion-segment-button:has-text("Chi tiết")').click();
await page.waitForTimeout(700);
await page.locator('.pd-chip.chip-classify').click();
await page.waitForTimeout(1700);
const classifyUi = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.pd-modal.show-modal');
  const body = modal?.querySelector('.pd-modal-body');
  return {
    open: !!body,
    head: body?.querySelector('.pd-modal-head span')?.textContent?.trim(),
    hasSelect: !!body?.querySelector('ion-select'),
    tagChip: body?.querySelector('ion-chip ion-label')?.textContent?.trim(),
  };
});
await page.locator('ion-modal.pd-modal.show-modal .pd-modal-head ion-button').first().click();
await page.waitForTimeout(800);

await page.locator('.pd-chip.chip-barcodes').click();
await page.waitForTimeout(1700);
const bcModalUi = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.pd-modal.show-modal');
  const body = modal?.querySelector('.pd-modal-body');
  return {
    head: body?.querySelector('.pd-modal-head span')?.textContent?.trim(),
    barcodeRow: body?.querySelector('.pd-itemrow .name')?.textContent?.trim(),
  };
});
await page.locator('ion-modal.pd-modal.show-modal .pd-modal-head ion-button').first().click();
await page.waitForTimeout(600);

// ---------- Ảnh chụp ----------
await page.screenshot({ path: 'audit-output/piopio-detail-info.png' });
await page.locator('ion-segment-button:has-text("Đơn vị khác")').click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'audit-output/piopio-detail-units.png' });
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('ion-segment-button:has-text("Chi tiết")').click();
await page.waitForTimeout(900);
await page.screenshot({ path: 'audit-output/piopio-detail-mobile.png' });

const ok =
  ui.title === 'Chi tiết sản phẩm' &&
  JSON.stringify(ui.endIcons) === JSON.stringify(['settings-outline', 'create-outline', 'ellipsis-vertical']) &&
  ui.segButtons.length === 6 &&
  ui.segButtons[0] === 'Chi tiết' &&
  ui.segButtons[4] === 'Giá khách & CTV' &&
  ui.segIconCount === 0 &&
  ui.chips.length === 3 &&
  ui.chips[0].bg === 'rgb(96, 48, 255)' &&
  ui.chips[1].bg === 'rgb(45, 213, 91)' &&
  ui.chips[2].bg === 'rgb(71, 187, 181)' &&
  ui.gridLabels.includes('Mã SP') &&
  ui.gridLabels.includes('Tiêu đề sản phẩm') &&
  ui.gridLabels.includes('Giá bán') &&
  ui.gridLabels.includes('Ngoại tệ') &&
  ui.gridLabels.includes('Hiện trên web') &&
  ui.gridLabels.includes('Khuyến mại') &&
  ui.gridLabels.includes('Mô tả') &&
  ui.gridLabels.includes('Xử lý ảnh với AI') &&
  ui.customRow &&
  ui.toggleCount === 9 &&
  ui.thumbCount === 1 &&
  !!ui.moneyColor && ui.moneyColor === ui.successRgb;
console.log('DETAIL UI:', JSON.stringify({ ui, barcodeUi, unitsUi, histUi, imgUi, priceUi, discUi, classifyUi, bcModalUi, patches: patches.length, patchBodies: patches.map((p) => p.body) }, null, 1));
console.log('real console errors:', errors.filter((e) => !/\b401\b/.test(e) && !/picsum|net::|Failed to load resource/.test(e)).length);

const ok2 =
  patches.some((p) => p.body.ban_chay === true) &&
  barcodeUi.visible && barcodeUi.w > 100 &&
  unitsUi.baseUnit === 'Bao' &&
  unitsUi.calc?.includes('13.500') &&
  histUi.total === 'Tổng: +0 ₫' && histUi.hasFunnel && histUi.dateInputs === 2 &&
  imgUi.aiBtn?.includes('XỬ LÝ ẢNH VỚI AI') && imgUi.addTile &&
  priceUi.total === 'Tổng: 2' && priceUi.rows === 2 && priceUi.plusBtn && priceUi.hasCtvBadge &&
  discUi.total === 'Tổng: 0' && discUi.emptyText?.includes('Chưa có chiết khấu của khách nào cả') &&
  classifyUi.open && classifyUi.head === 'Phân loại' && classifyUi.hasSelect && classifyUi.tagChip === 'bán chạy' &&
  bcModalUi.head === 'Nhiều mã vạch' && bcModalUi.barcodeRow === '8934506789123';

console.log(ok2 && true ? 'RESULT: PASS' : 'RESULT: FAIL');

await browser.close();
server.close();
process.exit(ok2 ? 0 : 1);
