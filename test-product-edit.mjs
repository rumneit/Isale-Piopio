// Test trang SỬA SẢN PHẨM (/product/update/:id) — clone ISale live 09/2026
// Header Đóng/Lưu, 2 tab pill, card Mã vạch + Sinh mã + Nhiều mã vạch,
// Mục, grid4 giá, unit row Mặc định/Quy đổi, 4 toggle card, Ngoại tệ,
// Ảnh [Chọn nhiều]+AI, Cấu hình Website, Phân loại, Trường tùy chỉnh, PATCH khi Lưu.
// Chạy: node test-product-edit.mjs   (yêu cầu đã build: npm run build)
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8351;
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
  unit: 'Bao (100 đôi)',
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
  units: [{ name: 'Thùng (40 Bao)', conversion: 40, price: 540000, cost: 430000, is_default: false }],
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
  price_settings: [],
  barcodes: ['8934506789123b'],
  custom_fields: [],
  la_combo: false,
  tu_tru_nvl: false,
  ngoai_te_tien_te: null,
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
  else if (table === 'products') body = /[?&]id=eq\./.test(url) ? PRODUCT : [PRODUCT];
  else if (table === 'categories') body = [{ id: 'c1', name: 'Nhựa' }];
  else body = [];
  const count = Array.isArray(body) ? body.length : 1;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` }, body: JSON.stringify(body) });
});

await page.goto(`${BASE}/#/product/update/p1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('.pe-grid4', { timeout: 25000 });
await page.waitForTimeout(2500);

const ui = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const q = (sel) => active?.querySelector(sel);
  const qa = (sel) => Array.from(active?.querySelectorAll(sel) ?? []);
  return {
    title: q('ion-title')?.textContent?.trim(),
    closeText: q('ion-buttons[slot="start"] ion-button')?.textContent?.replace(/\s+/g, ' ').trim(),
    endBtns: qa('ion-buttons[slot="end"] ion-button').map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()),
    segButtons: qa('ion-segment.pe-tabs ion-segment-button ion-label').map((l) => l.textContent?.trim()),
    segIconCount: qa('ion-segment.pe-tabs ion-segment-button ion-icon').length,
    bcBtns: qa('.pe-bc-actions .pe-btn-outline').map((b) => b.textContent?.replace(/\s+/g, ' ').trim()),
    bcPlaceholder: q('.pe-bc-card input.bordered')?.getAttribute('placeholder'),
    skuVal: qa('.pe-grid2 .pe-field input')[0]?.value,
    nameVal: qa('.pe-grid2 .pe-field input')[1]?.value,
    mucHead: q('.pe-card-head span')?.textContent?.trim(),
    mucAdd: q('.pe-card-head .pe-link')?.textContent?.trim(),
    grid4Labels: qa('.pe-grid4 .pe-label').map((l) => l.textContent?.replace(/\s+/g, ' ').trim()),
    grid4Vals: qa('.pe-grid4 input').map((i) => i.value),
    redHint: q('.pe-hint-red')?.textContent?.trim(),
    miniBtns: qa('.pe-grid4 .pe-mini').map((b) => b.textContent?.trim()),
    addUnitBtn: qa('.pe-card .pe-btn-outline:not(.sm):not(.wide)').map((b) => b.textContent?.replace(/\s+/g, ' ').trim())[0],
    unitDefLabel: q('.pe-def')?.textContent?.replace(/\s+/g, ' ').trim(),
    unitHasCheckbox: !!q('.pe-def ion-checkbox'),
    unitNameVal: q('.pe-unitrow .pe-unit-main input')?.value,
    unitDel: !!q('.pe-unitrow .pe-unit-del'),
    tcards: qa('.pe-tcard h3').map((h) => h.textContent?.trim()),
    tdescs: qa('.pe-tcard p').map((p) => p.textContent?.trim()),
    dateInput: !!q('input[type="date"]'),
    hasNgoaiTeSelect: !!q('ion-select.pe-select'),
    ntLabel: qa('.pe-grid2 .pe-label').map((l) => l.textContent?.replace(/\s+/g, ' ').trim()),
    moTaVal: q('textarea.pe-input')?.value,
    imgHead: q('.pe-img-head')?.textContent?.replace(/\s+/g, ' ').trim(),
    aiBtn: qa('.pe-img-actions .pe-btn-outline').map((b) => b.textContent?.replace(/\s+/g, ' ').trim())[0],
    chonNhieu: qa('.pe-img-actions .pe-link').map((b) => b.textContent?.trim())[0],
    imgEmptyB: q('.pe-img-empty b')?.textContent?.trim(),
    imgEmptyS: q('.pe-img-empty span')?.textContent?.trim(),
    webTitle: q('.pe-web-title')?.textContent?.trim(),
    webLabels: qa('.pe-web-item span').map((s) => s.textContent?.trim()),
    webFirstChecked: q('.pe-web-item ion-toggle')?.checked ?? null,
    khuyenMai: qa('.pe-tcard h3').map((h) => h.textContent?.trim()).includes('Khuyến mại?'),
    phanLoaiBtn: qa('.pe-btn-outline.wide').map((b) => b.textContent?.replace(/\s+/g, ' ').trim())[0],
  };
});

// ---- Mục: chọn nhóm hàng qua action sheet ----
await page.locator('.pe-card-head .pe-link').first().click();
await page.waitForTimeout(900);
await page.locator('ion-action-sheet button', { hasText: 'Nhựa' }).click();
await page.waitForTimeout(700);
const mucVal = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return active?.querySelector('.pe-muc-row span')?.textContent?.trim();
});

// ---- Sinh mã: 13 số ----
await page.locator('.pe-bc-actions .pe-btn-outline', { hasText: 'Sinh mã' }).click();
await page.waitForTimeout(300);
const sinhVal = await page.evaluate(() => document.querySelector('.pe-bc-card input.bordered')?.value);

// ---- Stepper Số lượng: − từ -520 -> -521 ----
await page.locator('.pe-grid4 .pe-mini', { hasText: '−' }).click();
await page.waitForTimeout(300);
const stockAfter = await page.evaluate(() => document.querySelectorAll('.pe-grid4 input')[3]?.value);

// ---- Modal Nhiều mã vạch ----
await page.locator('.pe-bc-actions .pe-btn-outline', { hasText: 'Nhiều mã vạch' }).click();
await page.waitForTimeout(1700);
const bcModal = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.pe-modal.show-modal');
  const body = modal?.querySelector('.pe-modal-body');
  return {
    head: body?.querySelector('.pe-modal-head span')?.textContent?.trim(),
    rows: body?.querySelectorAll('.pe-itemrow').length ?? 0,
    addBtn: body?.querySelector('.pe-modal-add')?.textContent?.replace(/\s+/g, ' ').trim(),
  };
});
await page.locator('ion-modal.pe-modal.show-modal .pe-modal-head ion-button').first().click();
await page.waitForTimeout(700);

// ---- Modal Phân loại ----
await page.locator('.pe-btn-outline.wide').click();
await page.waitForTimeout(1700);
const clsModal = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.pe-modal.show-modal');
  const body = modal?.querySelector('.pe-modal-body');
  return {
    head: body?.querySelector('.pe-modal-head span')?.textContent?.trim(),
    hasSelect: !!body?.querySelector('ion-select'),
    tagChip: body?.querySelector('ion-chip ion-label')?.textContent?.trim(),
  };
});
await page.locator('ion-modal.pe-modal.show-modal .pe-modal-head ion-button').first().click();
await page.waitForTimeout(700);

// ---- Tab Trường tùy chỉnh: empty state + thêm trường qua alert ----
await page.locator('ion-segment-button', { hasText: 'Trường tùy chỉnh' }).click();
await page.waitForTimeout(900);
const customEmpty = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    emptyB: active?.querySelector('.pe-custom-empty b')?.textContent?.trim(),
    emptyS: active?.querySelector('.pe-custom-empty span')?.textContent?.trim(),
    btn: active?.querySelector('.pe-custom-empty .pe-btn-outline')?.textContent?.replace(/\s+/g, ' ').trim(),
  };
});
await page.locator('.pe-custom-empty .pe-btn-outline').click();
await page.waitForTimeout(800);
await page.locator('ion-alert input').nth(0).fill('Xuất xứ');
await page.locator('ion-alert input').nth(1).fill('Việt Nam');
await page.locator('ion-alert button', { hasText: 'Thêm' }).click();
await page.waitForTimeout(800);
const cfRow = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return active?.querySelector('.pe-cf-row b')?.textContent?.trim();
});

// ---- Lưu -> PATCH ----
await page.locator('ion-segment-button', { hasText: 'Cơ bản' }).click();
await page.waitForTimeout(600);
await page.locator('ion-buttons[slot="end"] ion-button.pe-save').click();
await page.waitForTimeout(1600);

// ---- Ảnh chụp ----
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/#/product/update/p1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pe-grid4', { timeout: 25000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: 'audit-output/piopio-edit-mobile.png' });

console.log('EDIT UI:', JSON.stringify({ ui, mucVal, sinhVal, stockAfter, bcModal, clsModal, customEmpty, cfRow, patches: patches.length, patchBodies: patches.map((p) => p.body) }, null, 1));
console.log('real console errors:', errors.filter((e) => !/\b401\b/.test(e) && !/picsum|net::|Failed to load resource/.test(e)).length);

const pb = patches[0]?.body ?? {};
const fails = [];
const chk = (name, cond) => { if (!cond) fails.push(name); };
chk('title', ui.title === 'Sửa sản phẩm');
chk('closeText', ui.closeText?.includes('Đóng') ?? false);
chk('endBtns', ui.endBtns.length === 2 && ui.endBtns[1] === 'Lưu');
chk('seg2', ui.segButtons.length === 2 && ui.segButtons[0] === 'Cơ bản' && ui.segButtons[1] === 'Trường tùy chỉnh');
chk('segNoIcon', ui.segIconCount === 0);
chk('bcBtns', JSON.stringify(ui.bcBtns) === JSON.stringify(['Mã vạch', 'Sinh mã', 'Nhiều mã vạch']));
chk('bcPlaceholder', ui.bcPlaceholder === 'Chọn ô này, sử dụng đầu đọc hoặc nhập tay');
chk('skuName', ui.skuVal === 'TAS001' && ui.nameVal === '[TAS.1] Đũa tách OPP kèm Tăm');
chk('muc', ui.mucHead === 'Mục' && ui.mucAdd === '+ Thêm' && mucVal === 'Nhựa');
chk('grid4Labels', ui.grid4Labels.length === 4 && ui.grid4Labels[1]?.startsWith('Giá nhập'));
chk('grid4Vals', ui.grid4Vals[0] === 'Bao (100 đôi)' && ui.grid4Vals[1] === '11000' && ui.grid4Vals[2] === '15000' && ui.grid4Vals[3] === '-520');
chk('redHint', ui.redHint === 'Đơn vị nhỏ nhất, vd: Chiếc, cái..');
chk('miniBtns', ui.miniBtns.includes('.00') && ui.miniBtns.includes('.000') && ui.miniBtns.includes('−') && ui.miniBtns.includes('+'));
chk('addUnitBtn', ui.addUnitBtn === 'Thêm đơn vị');
chk('unitRow', ui.unitDefLabel === 'Mặc định' && ui.unitHasCheckbox && ui.unitNameVal === 'Thùng (40 Bao)' && ui.unitDel);
chk('tcards', JSON.stringify(ui.tcards.slice(0, 4)) === JSON.stringify(['Là sản phẩm combo?', 'Tự trừ nguyên vật liệu?', 'Là một dịch vụ?', 'Quản lý Serial/IMEI?']));
chk('tdesc0', ui.tdescs[0] === 'Combo là sản phẩm kết hợp nhiều mặt hàng với tổng giá thành có thể nhỏ hơn');
chk('tdesc3', ui.tdescs[3]?.startsWith('Bật quản lý Serial/IMEI') ?? false);
chk('dateNgoaiTe', ui.dateInput && ui.hasNgoaiTeSelect);
chk('moTa', ui.moTaVal === 'Đũa tách OPP kèm tăm');
chk('imgHead', ui.imgHead === 'Ảnh' && ui.aiBtn === 'Xử lý ảnh với AI' && ui.chonNhieu === '[Chọn nhiều]');
chk('imgEmpty', ui.imgEmptyB === 'Chưa có ảnh nào' && ui.imgEmptyS === 'Thêm ảnh để khách hàng có thể xem sản phẩm tốt hơn');
chk('web', ui.webTitle === 'Cấu hình Website' && JSON.stringify(ui.webLabels) === JSON.stringify(['Hiện trên web', 'Là SP Bán chạy', 'Là SP Mới', 'Hiện giá trên web']));
chk('webFirst', ui.webFirstChecked === true);
chk('khuyenMai', ui.khuyenMai);
chk('phanLoai', ui.phanLoaiBtn === 'Phân loại');
chk('sinhMa', /^\d{13}$/.test(sinhVal ?? ''));
chk('stockStep', stockAfter === '-521');
chk('bcModal', bcModal.head === 'Nhiều mã vạch' && bcModal.rows === 2 && bcModal.addBtn === 'Thêm mã vạch');
chk('clsModal', clsModal.head === 'Phân loại' && clsModal.hasSelect && clsModal.tagChip === 'bán chạy');
chk('customEmpty', customEmpty.emptyB === 'Chưa có trường tùy chỉnh' && customEmpty.btn === 'THÊM TRƯỜNG TÙY CHỈNH');
chk('cfRow', cfRow === 'Xuất xứ');
chk('patchCount', patches.length === 1);

chk('pb.name', pb.name === '[TAS.1] Đũa tách OPP kèm Tăm');
chk('pb.sku', pb.sku === 'TAS001');
chk('pb.unit', pb.unit === 'Bao (100 đôi)');
chk('pb.gia', pb.price === 15000 && pb.cost === 11000 && pb.stock === -521);
chk('pb.barcode', pb.barcode === sinhVal);
chk('pb.units', Array.isArray(pb.units) && pb.units[0]?.name === 'Thùng (40 Bao)' && pb.units[0]?.conversion === 40);
chk('pb.moTa', pb.mo_ta === 'Đũa tách OPP kèm tăm');
chk('pb.web', pb.hien_tren_web === true && pb.khuyen_mai === false && pb.la_combo === false);
chk('pb.category', pb.category_id === 'c1');
chk('pb.tags', Array.isArray(pb.tags) && pb.tags.includes('bán chạy'));
chk('pb.customFields', Array.isArray(pb.custom_fields) && pb.custom_fields[0]?.key === 'Xuất xứ');
chk('pb.barcodes', Array.isArray(pb.barcodes) && pb.barcodes.includes('8934506789123b'));

console.log('FAILED CHECKS:', JSON.stringify(fails));
const ok = fails.length === 0;
const ok2 = ok;
console.log(ok2 ? 'RESULT: PASS' : 'RESULT: FAIL');

await browser.close();
server.close();
process.exit(ok2 ? 0 : 1);
