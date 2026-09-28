// Smoke test: module Báo cáo & Biểu đồ v26 (audit isale-report/AUDIT-REPORT.md)
//  - /report dashboard: 5 chip kỳ, 3 KPI (Doanh thu/Lợi nhuận/Số đơn) + Δ kỳ trước/năm trước
//  - mini stats (thu/chi/hoàn/chưa thu), biểu đồ cột SVG + drill:
//      * cột ngày -> sheet hóa đơn (mã KH, badge trạng thái, đã thu/chưa thu) -> mở /order/:id
//      * cột tháng -> zoom cả dashboard vào tháng (chip bỏ lọc)
//  - Top SP/KH + tab NV (trạng thái giải thích staff_id), tồn kho biến chuyển, cohort heatmap
//  - Xuất CSV đơn hàng (chunked) + audit log report_log_export
// REST Supabase được mock qua page.route (RPC report_*), không cần DB thật.
// Chạy: node test-report.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8351;
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

const num = (n) => ({ defaultValue: n }); // rõ nghĩa khi dựng fixture
const totals = (over = {}) => ({
  from: '2026-09-01', to: '2026-09-30',
  revenue: 183268860, orders: 91, discount: 5000000,
  paid_total: 150000000, unpaid_orders: 12,
  cogs: 96000000, profit: 87268860,
  income: 200000000, expense: 41000000,
  returns_total: 2500000, returns_count: 3,
  ...over,
});
const kpisFixture = {
  current: totals(),
  prev: totals({ revenue: 195548920, orders: 86, cogs: 105000000, profit: 90548920, unpaid_orders: 9, returns_total: 0, returns_count: 0 }),
  yoy: totals({ revenue: 0, orders: 0, cogs: 0, profit: 0, income: 0, expense: 0, unpaid_orders: 0 }),
};
const dayBuckets = Array.from({ length: 10 }, (_, i) => {
  const d = String(i + 1).padStart(2, '0');
  return {
    bucket: `2026-09-${d}`,
    revenue: 1000000 * (i + 1), orders: i + 1,
    cogs: 400000 * (i + 1), profit: 600000 * (i + 1),
    income: 1100000 * (i + 1), expense: 200000 * (i + 1),
  };
});
const monthBuckets = Array.from({ length: 12 }, (_, i) => ({
  bucket: `2026-${String(i + 1).padStart(2, '0')}-01`,
  revenue: 50000000 + i * 10000000, orders: 40 + i,
  cogs: 30000000, profit: 20000000 + i * 10000000,
  income: 52000000, expense: 9000000,
}));
const orderRows = [
  { id: 'ORD-1', code: 'DH-260901-A1', customer_name: 'Nguyễn Văn A', status: 'completed', paid: true, total: 450000, discount: 0, created_at: '2026-09-01T02:30:00Z', total_count: 2 },
  { id: 'ORD-2', code: 'DH-260901-B2', customer_name: null, status: 'pending', paid: false, total: 1200000, discount: 50000, created_at: '2026-09-01T08:10:00Z', total_count: 2 },
];
const exportOrders = [
  { code: 'DH-260901-A1', created_at: '2026-09-01T02:30:00Z', customer_name: 'Nguyễn Văn A', status: 'completed', paid: true, total: 450000, discount: 0 },
  { code: 'DH-260901-B2', created_at: '2026-09-01T08:10:00Z', customer_name: null, status: 'pending', paid: false, total: 1200000, discount: 50000 },
];
const topProducts = [
  { product_id: 'P1', name: 'Trà sữa trân đường', unit: 'ly', qty: 120, revenue: 5400000, cogs: 2400000, profit: 3000000, orders: 45 },
  { product_id: 'P2', name: 'Cà phê sữa đá', unit: 'ly', qty: 90, revenue: 3150000, cogs: 1350000, profit: 1800000, orders: 38 },
  { product_id: null, name: 'Topping phô mai', unit: 'phần', qty: 30, revenue: 900000, cogs: 300000, profit: 600000, orders: 20 },
];
const topCustomers = [
  { customer_id: 'C1', name: 'Nguyễn Văn A', orders: 12, revenue: 5600000, last_order_at: '2026-09-20T10:00:00Z' },
  { customer_id: null, name: 'Khách lẻ', orders: 30, revenue: 4200000, last_order_at: '2026-09-25T09:00:00Z' },
];
const cohortRows = [
  { cohort_month: '2026-05-01', month_n: 0, buyers: 10, revenue: 8000000 },
  { cohort_month: '2026-05-01', month_n: 1, buyers: 4, revenue: 3200000 },
  { cohort_month: '2026-05-01', month_n: 2, buyers: 2, revenue: 1500000 },
  { cohort_month: '2026-06-01', month_n: 0, buyers: 8, revenue: 6400000 },
  { cohort_month: '2026-06-01', month_n: 1, buyers: 3, revenue: 2400000 },
];
const inventoryRows = [
  { product_id: 'P1', name: 'Trà sữa trân đường', sku: 'TS001', unit: 'ly', stock_now: 58, sold: 120, returned: 2, received: 150, transferred: 0, est_start: 30 },
  { product_id: 'P2', name: 'Cà phê sữa đá', sku: 'CF001', unit: 'ly', stock_now: 40, sold: 90, returned: 0, received: 100, transferred: 5, est_start: 35 },
];
const rpcHits = { kpis: 0, timeseries: 0, ordersDay: 0, logExport: 0, lastGrain: '' };

const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

await ctx.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const segments = url.pathname.split('/');
  const table = segments[segments.length - 1];
  const method = req.method();
  if (table === 'profiles') {
    if (method === 'GET') return route.fulfill(json([{ id: USER, full_name: 'Test', role: 'owner', shop_id: SHOP }]));
    return route.fulfill(json({ id: USER, shop_id: SHOP }));
  }
  if (table === 'shops') {
    if (method === 'GET') return route.fulfill(json([{ id: SHOP, name: 'PioPio Store', owner_id: USER }]));
    return route.fulfill(json({ id: SHOP, name: 'PioPio Store', owner_id: USER }));
  }
  if (segments.includes('rpc')) {
    const fnName = table;
    if (fnName === 'report_kpis') { rpcHits.kpis++; return route.fulfill(json(kpisFixture)); }
    if (fnName === 'report_timeseries') {
      rpcHits.timeseries++;
      const body = req.postDataJSON() ?? {};
      rpcHits.lastGrain = String(body.p_grain ?? 'day');
      return route.fulfill(json(rpcHits.lastGrain === 'month' ? monthBuckets : dayBuckets));
    }
    if (fnName === 'report_orders_day') { rpcHits.ordersDay++; return route.fulfill(json(orderRows)); }
    if (fnName === 'report_top_products') return route.fulfill(json(topProducts));
    if (fnName === 'report_top_customers') return route.fulfill(json(topCustomers));
    if (fnName === 'report_inventory') return route.fulfill(json(inventoryRows));
    if (fnName === 'report_cohort') return route.fulfill(json(cohortRows));
    if (fnName === 'report_log_export') { rpcHits.logExport++; return route.fulfill(json(null)); }
    if (fnName === 'report_export_logs') return route.fulfill(json([]));
    return route.fulfill(json(null));
  }
  if (table === 'orders') return route.fulfill(json(exportOrders));
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

await page.goto(`${BASE}/#/report`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const r = {};

// 1) Khung trang + KPI + PoP
r.frame = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const kpis = Array.from(active.querySelectorAll('.kpi-card'));
  const chips = Array.from(active.querySelectorAll('.range-chip')).map((b) => b.textContent?.trim() ?? '');
  return {
    title: active.querySelector('ion-title')?.textContent?.trim() ?? '',
    chips,
    kpiNames: kpis.map((k) => k.querySelector('.kpi-name')?.textContent?.trim() ?? ''),
    kpiRevenue: kpis[0]?.querySelector('.kpi-value')?.textContent?.trim() ?? '',
    kpiProfit: kpis[1]?.querySelector('.kpi-value')?.textContent?.trim() ?? '',
    kpiOrders: kpis[2]?.querySelector('.kpi-value')?.textContent?.trim() ?? '',
    deltas: Array.from(active.querySelectorAll('.kpi-card:first-child .delta')).map((d) => d.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
    miniStats: active.querySelector('.mini-stats')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    bars: active.querySelectorAll('.rc-bar-g').length,
    hubItems: Array.from(active.querySelectorAll('.hub-card ion-item')).length,
  };
});

// 2) Cột ngày -> sheet hóa đơn -> mở đơn
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  (active.querySelectorAll('.rc-bar-g')[3])?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(1500);
r.sheet = await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.show-modal');
  if (!modal) return { open: false };
  const root = modal.querySelector('.ion-page') ?? modal;
  const rows = Array.from(root.querySelectorAll('ion-item')).map((i) => ({
    code: i.querySelector('.ord-code')?.textContent?.trim() ?? '',
    badge: i.querySelector('ion-badge')?.textContent?.trim() ?? '',
    total: i.querySelector('.ord-total')?.textContent?.trim() ?? '',
  }));
  return {
    open: true,
    title: root.querySelector('ion-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    rows,
  };
});
// Chạm hóa đơn đầu -> điều hướng /order/ORD-1
await page.evaluate(() => {
  const modal = document.querySelector('ion-modal.show-modal');
  const root = modal?.querySelector('.ion-page') ?? modal;
  root?.querySelector('ion-item')?.click();
});
await page.waitForTimeout(2500);
r.orderNav = await page.evaluate(() => ({
  url: location.hash,
  title: document.querySelector('#main-content .ion-page:last-child ion-title')?.textContent?.trim() ?? '',
}));

// 3) Về /report, đổi grain sang Tháng -> cột tháng -> drill vào tháng
await page.goto(`${BASE}/#/report`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const segs = Array.from(active.querySelectorAll('ion-segment'));
  const grainSeg = segs.find((s) => Array.from(s.querySelectorAll('ion-segment-button')).some((b) => (b.textContent ?? '').includes('Tháng')));
  grainSeg?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'month' } }));
});
await page.waitForTimeout(1800);
r.monthChart = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return { bars: active.querySelectorAll('.rc-bar-g').length };
});
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  (active.querySelectorAll('.rc-bar-g')[5])?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(2000);
r.drill = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    rangeLabel: active.querySelector('.range-label')?.textContent?.trim() ?? '',
    hasDrillChip: !!active.querySelector('.drill-chip'),
    bars: active.querySelectorAll('.rc-bar-g').length,
  };
});

// 4) Tabs Top
r.tops = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const firstNames = () => Array.from(active.querySelectorAll('.lb-row .lb-name')).slice(0, 3).map((n) => n.textContent?.trim() ?? '');
  const productNames = firstNames();
  const segs = Array.from(active.querySelectorAll('ion-segment'));
  const topSeg = segs.find((s) => Array.from(s.querySelectorAll('ion-segment-button')).some((b) => (b.textContent ?? '').includes('Khách hàng')));
  topSeg?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'customer' } }));
  return { productNames, segsFound: segs.length };
});
await page.waitForTimeout(600);
r.topsCustomer = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const names = Array.from(active.querySelectorAll('.lb-row .lb-name')).slice(0, 2).map((n) => n.textContent?.trim() ?? '');
  const segs = Array.from(active.querySelectorAll('ion-segment'));
  const topSeg = segs.find((s) => Array.from(s.querySelectorAll('ion-segment-button')).some((b) => (b.textContent ?? '').includes('Nhân viên')));
  topSeg?.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 'staff' } }));
  return { names };
});
await page.waitForTimeout(600);
r.topsStaff = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const empty = active.querySelector('.staff-empty');
  return { hasStaffInfo: !!empty, mentionsStaffId: (empty?.textContent ?? '').includes('staff_id') };
});

// 5) Tồn kho + cohort
r.inventory = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const table = active.querySelector('.inv-table');
  const rows = Array.from(table?.querySelectorAll('tbody tr') ?? []).map((tr) => tr.querySelector('.inv-name')?.textContent?.trim() ?? '');
  return {
    headers: Array.from(table?.querySelectorAll('thead th') ?? []).map((th) => th.textContent?.trim() ?? ''),
    rows,
    hasEst: (table?.textContent ?? '').includes('30') && (table?.textContent ?? '').includes('35'),
    note: (active.querySelector('.inv-note')?.textContent ?? '').includes('ước tính'),
  };
});
r.cohort = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const table = active.querySelector('.cohort-table');
  const cells = Array.from(table?.querySelectorAll('.cohort-cell') ?? []).map((c) => c.textContent?.trim() ?? '');
  return {
    hasTable: !!table,
    rowLabels: Array.from(table?.querySelectorAll('.cohort-lab') ?? []).map((c) => c.textContent?.trim() ?? ''),
    pctCells: cells,
    has40: cells.includes('40%'),
    has38: cells.includes('38%'),
    zeroEmpty: cells[cells.length - 1] === '',
  };
});

// 6) Xuất CSV + audit log
await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const btn = Array.from(active.querySelectorAll('ion-header ion-button')).find(
    (b) => b.querySelector('ion-icon')?.getAttribute('name') === 'download-outline'
  );
  btn?.click();
});
await page.waitForTimeout(2000);
r.export = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return { note: active.querySelector('.export-note')?.textContent?.trim() ?? '' };
});

const realErrors = errors.filter(
  (e) => !/\b401\b|\b403\b|\b404\b|\b409\b/.test(e) &&
    !/Failed to load resource|net::ERR|supabase|PGRST|realtime|WebSocket|postgrest/i.test(e)
);
r.realConsoleErrors = realErrors.length;
r.rpcHits = rpcHits;

console.log(JSON.stringify(r, null, 2));
for (const e of [...new Set(realErrors)]) console.log('  ERR -', e.slice(0, 200));

const pass =
  r.frame.title === 'Báo cáo' &&
  r.frame.chips.length === 5 &&
  r.frame.chips.join(',').includes('Hôm nay') &&
  r.frame.kpiNames.join(',').includes('Doanh thu') &&
  r.frame.kpiNames.join(',').includes('Lợi nhuận') &&
  r.frame.kpiNames.join(',').includes('Số đơn') &&
  r.frame.kpiRevenue.includes('183.268.860') &&
  r.frame.kpiProfit.includes('87.268.860') &&
  r.frame.kpiOrders === '91' &&
  r.frame.deltas.join(' ').includes('▼') &&
  r.frame.deltas.join(' ').includes('6,3%') &&
  r.frame.deltas.join(' ').includes('—') &&
  r.frame.miniStats.includes('200.000.000') &&
  r.frame.miniStats.includes('41.000.000') &&
  r.frame.miniStats.includes('2.500.000') &&
  r.frame.bars === 10 &&
  r.frame.hubItems >= 8 &&
  r.sheet.open &&
  r.sheet.title.includes('Hóa đơn') &&
  r.sheet.rows.length === 2 &&
  r.sheet.rows[0].code === 'DH-260901-A1' &&
  r.sheet.rows[0].badge === 'Hoàn tất' &&
  r.sheet.rows[1].badge === 'Chờ xử lý' &&
  r.sheet.rows[1].total.includes('1.200.000') &&
  r.orderNav.url.includes('/order/ORD-1') &&
  r.monthChart.bars === 12 &&
  r.drill.hasDrillChip &&
  r.drill.bars === 10 &&
  r.drill.rangeLabel.includes('/2026') &&
  r.tops.productNames.join('|').includes('Trà sữa trân đường') &&
  r.tops.productNames.length === 3 &&
  r.topsCustomer.names.join('|').includes('Nguyễn Văn A') &&
  r.topsStaff.hasStaffInfo && r.topsStaff.mentionsStaffId &&
  r.inventory.rows.length === 2 &&
  r.inventory.headers.join(',').includes('Tồn đầu') &&
  r.inventory.hasEst && r.inventory.note &&
  r.cohort.hasTable &&
  r.cohort.rowLabels.join(',').includes('T5/26') &&
  r.cohort.has40 && r.cohort.has38 && r.cohort.zeroEmpty &&
  r.export.note.includes('Đã xuất 2 đơn') &&
  rpcHits.kpis >= 1 && rpcHits.timeseries >= 2 && rpcHits.ordersDay >= 1 && rpcHits.logExport >= 1 &&
  r.realConsoleErrors === 0;

await browser.close();
server.close();
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
