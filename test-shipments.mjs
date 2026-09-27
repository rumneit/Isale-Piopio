// Smoke test: module Don van chuyen P0 (audit isale-shipping)
//  - /shipments: khung trang (title, bo loc Doi tac/Trang thai, dem), card van don
//    (tracking + badge trang thai + COD + KL), chi tiet: thanh tien trinh 6 moc
//  - Chi tiet: timeline events, doi trang thai qua action sheet (11 trang thai)
//  - Modal tao van don (FAB): du truong -> luu POST
//  - order-detail: khop van don lien quan + nut "Tao van don"
// REST Supabase duoc mock qua page.route (khong can DB that / migration).
// Chay: node test-shipments.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8350;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const SHOP = '11111111-1111-1111-1111-111111111111';
const USER = '00000000-0000-4000-8000-000000000001';

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

const partner = { id: 'PT1', shop_id: SHOP, name: 'GHN Quận 7', code: 'ghn', phone: null, api_endpoint: null, api_token: null, fee_percent: 0, active: true, is_default: false, note: null, created_at: '2026-09-01T00:00:00Z' };
const mkShip = (over) => ({
  id: 'SH1', shop_id: SHOP, order_id: 'ORD1', order_code: 'DH-260927-T1',
  partner_id: partner.id, partner_name: partner.name, provider: 'ghn',
  tracking_code: 'GHNTEST001', status: 'submitted',
  shipping_fee: 32000, cod_amount: 250000, weight_g: 1200, length_cm: 20, width_cm: 15, height_cm: 10,
  from_address: 'PioPio Store · 0900000000 · Q.7 TP.HCM',
  to_address: 'Nguyễn Văn A · 0903123456 · 12 Nguyễn Hữu Thọ, P.Tân Thuận, Q.7',
  label_url: null, expected_delivered_at: null, delivered_at: null, cancelled_at: null,
  fail_reason: null, note: 'Hàng dễ vỡ', external_ref: null, created_by: null,
  created_at: '2026-09-27T10:00:00Z', updated_at: '2026-09-27T10:00:00Z',
  ...over,
});
const ship2 = mkShip({ id: 'SH2', tracking_code: 'GHTKTEST2', status: 'in_transit', cod_amount: 0, weight_g: 800, length_cm: null, width_cm: null, height_cm: null, note: null });
let shipments = [mkShip({}), ship2];
const logsSH1 = [
  { id: 'L1', shipment_id: 'SH1', shop_id: SHOP, status: 'submitted', description: 'Vận đơn được tạo', location: null, event_time: '2026-09-27T10:00:00Z', created_at: '2026-09-27T10:00:00Z' },
  { id: 'L2', shipment_id: 'SH1', shop_id: SHOP, status: 'picking', description: 'Shipper đang lấy hàng', location: 'Bưu cục Q.7', event_time: '2026-09-27T11:30:00Z', created_at: '2026-09-27T11:30:00Z' },
];
const order = { id: 'ORD1', shop_id: SHOP, code: 'DH-260927-T1', customer_id: null, customer_name: 'Nguyễn Văn A', status: 'shipping', total: 450000, discount: 0, paid: false, note: null, created_at: '2026-09-27T09:00:00Z' };
const orderItems = [{ id: 'OI1', order_id: 'ORD1', product_id: null, name: 'Trà sữa trân đường', price: 45000, qty: 10, total: 450000 }];

const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const hits = { patch: 0, postShipment: 0, postLog: 0 };
await ctx.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const table = url.pathname.split('/').pop();
  const method = req.method();
  if (table === 'profiles') {
    if (method === 'GET') return route.fulfill(json([{ id: USER, full_name: 'Test', role: 'owner', shop_id: SHOP }]));
    return route.fulfill(json({ id: USER, shop_id: SHOP }));
  }
  if (table === 'shops') {
    if (method === 'GET') return route.fulfill(json([{ id: SHOP, name: 'PioPio Store', owner_id: USER }]));
    return route.fulfill(json({ id: SHOP, name: 'PioPio Store', owner_id: USER }));
  }
  if (table === 'shipments') {
    if (method === 'GET') {
      const idEq = url.searchParams.get('id')?.match(/eq\.(.+)/)?.[1];
      if (idEq) return route.fulfill(json(shipments.find((s) => s.id === idEq) ?? null));
      return route.fulfill(json(shipments));
    }
    if (method === 'POST') {
      const body = req.postDataJSON();
      const row = Array.isArray(body) ? body[0] : body;
      hits.postShipment++;
      const created = mkShip({ id: 'SH3', tracking_code: row.tracking_code, status: row.status, order_id: row.order_id ?? null, order_code: row.order_code ?? null, partner_id: row.partner_id ?? null, partner_name: row.partner_name ?? null, provider: row.provider ?? 'manual', shipping_fee: Number(row.shipping_fee ?? 0), cod_amount: Number(row.cod_amount ?? 0), weight_g: row.weight_g ?? null, length_cm: row.length_cm ?? null, width_cm: row.width_cm ?? null, height_cm: row.height_cm ?? null, from_address: row.from_address ?? null, to_address: row.to_address ?? null, note: row.note ?? null });
      shipments = [created, ...shipments];
      return route.fulfill(json(created, 201));
    }
    if (method === 'PATCH') {
      hits.patch++;
      const idMatch = url.searchParams.get('id')?.match(/eq\.(.+)/);
      const row = shipments.find((s) => s.id === idMatch?.[1]);
      if (row) {
        const patch = req.postDataJSON();
        Object.assign(row, patch);
      }
      return route.fulfill(json(row ?? {}, 200));
    }
  }
  if (table === 'shipment_tracking_logs') {
    if (method === 'GET') return route.fulfill(json(logsSH1));
    if (method === 'POST') { hits.postLog++; return route.fulfill(json({ id: 'L' + (logsSH1.length + 1) }, 201)); }
  }
  if (table === 'shipping_partners') return route.fulfill(json([partner]));
  if (table === 'orders') return route.fulfill(json([order]));
  if (table === 'order_items') return route.fulfill(json(orderItems));
  // Bang khac: tra rong cho GET, chap nhan cho ghi
  if (method === 'GET' || method === 'HEAD') return route.fulfill(json([]));
  return route.fulfill(json({}, 201));
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, email: 'piopio.test01@isale.online', role: 'authenticated' })}.fakesig`;
const session = { access_token: fakeJwt, token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, refresh_token: 'fake', user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'piopio.test01@isale.online', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Test' }, created_at: new Date().toISOString() } };
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const activePage = () => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  return pages[pages.length - 1] ?? main;
};

await page.goto(`${BASE}/#/shipments`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const r = {};

// 1) Khung trang /shipments
r.frame = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const selects = Array.from(active.querySelectorAll('.filter-card ion-select')).map((s) => s.getAttribute('label') ?? '');
  const cards = Array.from(active.querySelectorAll('.ship-card'));
  return {
    title: active.querySelector('ion-title')?.textContent?.trim() ?? '',
    filterLabels: selects,
    count: active.querySelector('.filter-count')?.textContent?.trim() ?? '',
    cardCount: cards.length,
    firstCard: cards[0]?.querySelector('h2')?.textContent?.trim() ?? '',
    firstBadge: cards[0]?.querySelector('ion-badge')?.textContent?.trim() ?? '',
    secondBadge: cards[1]?.querySelector('ion-badge')?.textContent?.trim() ?? '',
    hasCod: (cards[0]?.textContent ?? '').includes('250.000'),
    hasWeight: (cards[0]?.textContent ?? '').includes('1.2 kg'),
    hasCancelBtnOnDelivered: false,
  };
});

// 2) Chi tiet van don SH1
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.ship-card h2')?.click();
});
await page.waitForTimeout(2500);
r.detail = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const steps = Array.from(active.querySelectorAll('.progress-step'));
  const tl = Array.from(active.querySelectorAll('.tl-item'));
  const btnTexts = Array.from(active.querySelectorAll('ion-content ion-button')).map((b) => b.textContent?.trim() ?? '');
  return {
    title: active.querySelector('ion-title')?.textContent?.trim() ?? '',
    code: active.querySelector('.detail-code')?.textContent?.trim() ?? '',
    badge: active.querySelector('.detail-head ion-badge')?.textContent?.trim() ?? '',
    stepCount: steps.length,
    doneSteps: steps.filter((s) => s.classList.contains('done')).length,
    timelineCount: tl.length,
    timelineHasLoc: (active.querySelector('.tl-item .tl-loc')?.textContent ?? '').includes('Bưu cục'),
    hasChangeBtn: btnTexts.some((t) => t.includes('Đổi trạng thái')),
    hasPrintBtn: btnTexts.some((t) => t.includes('In vận đơn')),
    hasCancelBtn: btnTexts.some((t) => t.includes('Hủy vận đơn')),
    hasDeleteBtn: btnTexts.some((t) => t.includes('Xóa vận đơn')),
    hasOrderLink: (active.querySelector('.app-card ion-list')?.textContent ?? '').includes('DH-260927-T1'),
  };
});

// 3) Doi trang thai qua action sheet -> chon "Dang phat" (out_for_delivery)
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('.detail-head ion-badge')?.click();
});
await page.waitForTimeout(1000);
r.statusSheet = await page.evaluate(() => {
  const sheet = document.querySelector('ion-action-sheet');
  const btns = Array.from(sheet?.querySelectorAll('button') ?? []).map((b) => b.textContent?.trim() ?? '');
  const target = Array.from(sheet?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Đang phát'));
  target?.click();
  return { open: !!sheet, statusCount: btns.filter((t) => t && t !== 'Đóng').length };
});
await page.waitForTimeout(1500);
r.afterStatus = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return { badge: active.querySelector('.detail-head ion-badge')?.textContent?.trim() ?? '' };
});

// 4) Ve list, mo modal tao van don tu FAB -> luu
await page.goto(`${BASE}/#/shipments`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  active.querySelector('app-fab-trio ion-fab-button')?.click();
});
await page.waitForTimeout(1400);
r.form = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.show-modal ion-modal, ion-modal');
  if (!modal) return { open: false };
  const root = modal.querySelector('.ion-page') ?? modal;
  const labels = Array.from(root.querySelectorAll('[label]')).map((i) => i.getAttribute('label') ?? '');
  const joined = labels.join(' | ');
  const seg = Array.from(root.querySelectorAll('ion-segment-button')).map((i) => i.textContent?.trim() ?? '');
  return {
    open: true,
    title: root.querySelector('ion-title')?.textContent?.trim() ?? '',
    labels,
    hasPartner: joined.includes('Đối tác vận chuyển'),
    hasTracking: joined.includes('Mã vận đơn'),
    hasFee: joined.includes('Phí vận chuyển'),
    hasCod: joined.includes('COD'),
    hasWeight: joined.includes('Khối lượng'),
    hasDims: joined.includes('Dài × Rộng × Cao'),
    hasFrom: joined.includes('Địa chỉ gửi'),
    hasTo: joined.includes('Địa chỉ nhận'),
    hasOrderCode: joined.includes('Mã đơn liên quan'),
    seg,
  };
});
// Nhap ma + luu
await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.show-modal ion-modal, ion-modal');
  const root = modal?.querySelector('.ion-page') ?? modal;
  const input = Array.from(root?.querySelectorAll('ion-input') ?? []).find((i) => (i.getAttribute('label') ?? '') === 'Mã vận đơn');
  const native = input?.shadowRoot?.querySelector('input') ?? input?.querySelector('input');
  native?.dispatchEvent(new Event('ionInput', { bubbles: true }));
  if (native) {
    native.value = 'GHNNEW999';
    native.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input?.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 'GHNNEW999' } }));
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.show-modal ion-modal, ion-modal');
  const root = modal?.querySelector('.ion-page') ?? modal;
  const save = Array.from(root?.querySelectorAll('ion-header ion-button') ?? []).find((b) => b.textContent?.includes('Lưu'));
  save?.click();
});
await page.waitForTimeout(1500);
r.saved = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    modalClosed: !document.querySelector('ion-modal.show-modal'),
    cardCount: active.querySelectorAll('.ship-card').length,
    hasNew: (active.textContent ?? '').includes('GHNNEW999'),
  };
});

// 5) order-detail: van don lien quan + nut Tao van don
await page.goto(`${BASE}/#/order/ORD1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3500);
r.orderIntegration = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const shipItems = Array.from(active.querySelectorAll('.app-card ion-item')).filter((i) => (i.textContent ?? '').includes('GHNTEST001'));
  const createBtn = Array.from(active.querySelectorAll('ion-button')).find((b) => (b.textContent ?? '').includes('Tạo vận đơn'));
  return { hasShipmentRow: shipItems.length > 0, hasCreateBtn: !!createBtn };
});

const realErrors = errors.filter(
  (e) => !/\b401\b|\b403\b|\b404\b|\b409\b/.test(e) &&
    !/Failed to load resource|net::ERR|supabase|PGRST|realtime|WebSocket|postgrest/i.test(e)
);
r.realConsoleErrors = realErrors.length;
r.hits = hits;

console.log(JSON.stringify(r, null, 2));
for (const e of [...new Set(realErrors)]) console.log('  ERR -', e.slice(0, 200));

const pass =
  r.frame.title === 'Đơn vận chuyển' &&
  r.frame.filterLabels.join(',').includes('Đối tác') &&
  r.frame.filterLabels.join(',').includes('Trạng thái') &&
  r.frame.count.includes('2 vận đơn') &&
  r.frame.cardCount === 2 &&
  r.frame.firstCard === 'GHNTEST001' &&
  r.frame.firstBadge === 'Đã tạo' &&
  r.frame.secondBadge === 'Đang vận chuyển' &&
  r.frame.hasCod && r.frame.hasWeight &&
  r.detail.title === 'Chi tiết vận đơn' &&
  r.detail.code === 'GHNTEST001' &&
  r.detail.badge === 'Đã tạo' &&
  r.detail.stepCount === 5 && r.detail.doneSteps === 1 &&
  r.detail.timelineCount === 2 && r.detail.timelineHasLoc &&
  r.detail.hasChangeBtn && r.detail.hasPrintBtn && r.detail.hasCancelBtn && r.detail.hasDeleteBtn &&
  r.detail.hasOrderLink &&
  r.statusSheet.open && r.statusSheet.statusCount === 10 &&
  r.afterStatus.badge === 'Đang phát' &&
  r.form.open && r.form.title === 'Tạo vận đơn' &&
  r.form.hasPartner && r.form.hasTracking && r.form.hasFee && r.form.hasCod &&
  r.form.hasWeight && r.form.hasDims && r.form.hasFrom && r.form.hasTo && r.form.hasOrderCode &&
  r.form.seg.join(',').includes('Nháp') && r.form.seg.join(',').includes('Đã tạo') &&
  r.saved.modalClosed && r.saved.cardCount === 3 && r.saved.hasNew &&
  r.orderIntegration.hasShipmentRow && r.orderIntegration.hasCreateBtn &&
  hits.patch >= 1 && hits.postShipment >= 1 &&
  r.realConsoleErrors === 0;

await browser.close();
server.close();
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
