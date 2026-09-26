// Xac minh: luoi san pham co anh + tim kiem khong dau + bam chon them vao don
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);

const now = new Date().toISOString();
const SHOP = { id: '11111111-1111-4111-8111-111111111111', name: 'Shop Test', owner_id: '00000000-0000-4000-8000-000000000001', created_at: now };
const PRODUCTS = [
  { id: 'p1', shop_id: SHOP.id, name: 'Tô nhựa 1000ml UKP Trong', sku: 'PIO0112', unit: 'Cái', price: 12000, cost: 8000, stock: 25, category_id: null, active: true, image: 'https://picsum.photos/seed/p1/200/200', created_at: now },
  { id: 'p2', shop_id: SHOP.id, name: 'Ly nhựa 500ml', sku: 'PIO0113', unit: 'Cái', price: 5000, cost: 3000, stock: 0, category_id: null, active: true, image: null, created_at: now },
  { id: 'p3', shop_id: SHOP.id, name: 'Hộp giấy takeaway', sku: 'PIO0114', unit: 'Hộp', price: 2500, cost: 1500, stock: 100, category_id: null, active: true, image: 'https://picsum.photos/seed/p3/200/200', created_at: now },
];

await ctx.route('**/rest/v1/**', async (route) => {
  const url = route.request().url();
  const table = url.split('/rest/v1/')[1]?.split('?')[0] ?? '';
  let body = [];
  if (table === 'shops') body = [SHOP];
  else if (table === 'profiles') body = [{ id: session.user.id, full_name: 'Test', role: 'owner', shop_id: SHOP.id }];
  else if (table === 'products') body = PRODUCTS;
  const count = Array.isArray(body) ? body.length : 0;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` },
    body: JSON.stringify(body),
  });
});

const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(`${BASE}/#/sale`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#main-content .ion-page, #main-content ion-title', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(4000);

const state = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const grid = active?.querySelector('.catalog-grid');
  const tiles = Array.from(active?.querySelectorAll('.catalog-tile') ?? []);
  return {
    head: active?.querySelector('.catalog-head')?.innerText?.replace(/\s+/g, ' ').trim(),
    tileCount: tiles.length,
    tiles: tiles.map((t) => ({
      name: t.querySelector('.tile-name')?.textContent?.trim(),
      price: t.querySelector('.tile-price')?.textContent?.trim(),
      stock: t.querySelector('.tile-stock')?.textContent?.trim(),
      hasImg: !!t.querySelector('img'),
      imgSrc: t.querySelector('img')?.getAttribute('src') ?? null,
      hasPlaceholderIcon: !!t.querySelector('.tile-img ion-icon'),
    })),
    gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
    fab: (() => {
      const f = active?.querySelector('ion-fab.sale-fab');
      if (!f) return null;
      const btn = f.querySelector('ion-fab-button');
      const fb = f.getBoundingClientRect();
      const cs = btn ? getComputedStyle(btn) : null;
      const tileAdd = active?.querySelector('.tile-add');
      return {
        visible: fb.width > 0 && fb.height > 0,
        circular: cs ? (cs.getPropertyValue('--border-radius').trim() === '50%' || (() => {
          const inner = btn && btn.shadowRoot ? btn.shadowRoot.querySelector('button') : null;
          if (!inner) return false;
          const ir = parseFloat(getComputedStyle(inner).borderRadius || '0');
          return Math.abs(ir - fb.width / 2) < 3;
        })()) : false,
        centerX: Math.abs((fb.left + fb.right) / 2 - window.innerWidth / 2) < 40,
        nearBottom: window.innerHeight - fb.bottom < 90,
        tileAddCircular: tileAdd ? getComputedStyle(tileAdd).borderRadius === '50%' : false,
      };
    })(),
  };
});

// 1) Tim khong dau: "to nhu" -> ra "Tô nhựa 1000ml..."
await page.fill('.picker-search ion-input input, .picker-search input', 'to nhu');
await page.waitForTimeout(800);
const searchResult = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return Array.from(active?.querySelectorAll('.catalog-tile .tile-name') ?? []).map((t) => t.textContent?.trim());
});

// 2) Xoa tim kiem, bam tile dau tien -> THEM TRUC TIEP VAO DON
//    (Chi tiet san pham 8 tab nam o Kho/San pham — /product/detail/:id)
await page.fill('.picker-search ion-input input, .picker-search input', '');
await page.waitForTimeout(500);
await page.locator('.catalog-tile').first().click();
await page.waitForTimeout(1200);
const afterClick = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    saleItems: Array.from(active?.querySelectorAll('.sale-item') ?? []).map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    totalDue: active?.querySelector('.total-row.big')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
    modalOpened: !!document.querySelector('ion-modal.product-detail-modal'),
  };
});

// 2b) Nut + tren the: them nhanh tiep san pham thu 2
await page.locator('.catalog-tile .tile-add').nth(1).click();
await page.waitForTimeout(1100);
const quickAdd = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  return {
    saleItems: Array.from(active?.querySelectorAll('.sale-item') ?? []).map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    totalDue: active?.querySelector('.total-row.big')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
    modalOpened: !!document.querySelector('ion-modal.product-detail-modal'),
  };
});

// 3) Bam nut + noi giua day man hinh -> cuon toi khung chon san pham + focus o tim
await page.evaluate(() => {
  const c = document.querySelector('ion-content');
  if (c && typeof c.scrollToBottom === 'function') c.scrollToBottom(0);
});
await page.waitForTimeout(700);
await page.locator('ion-fab.sale-fab ion-fab-button').click();
await page.waitForTimeout(1100);
const fabClick = await page.evaluate(() => {
  const card = document.querySelector('.catalog-card');
  const r = card?.getBoundingClientRect();
  return {
    cardTopInViewport: !!r && r.top >= -10 && r.top < window.innerHeight * 0.5,
    searchFocused: document.activeElement?.tagName === 'INPUT',
  };
});

// 4) Man hinh rong (>=992px): chia doi don hang | chon san pham nhu Isale
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(600);
const desktop = await page.evaluate(() => {
  const main = document.querySelector('#main-content');
  const pages = Array.from(main?.querySelectorAll('.ion-page') ?? []);
  const active = pages[pages.length - 1] ?? main;
  const split = active?.querySelector('.sale-split');
  const top = active?.querySelector('.sale-split-top');
  const aside = active?.querySelector('.sale-split-aside');
  const bottom = active?.querySelector('.sale-split-bottom');
  const card = active?.querySelector('.catalog-card');
  const scroll = active?.querySelector('.catalog-scroll');
  const grid = active?.querySelector('.catalog-grid');
  const topBox = top?.getBoundingClientRect();
  const asideBox = aside?.getBoundingClientRect();
  const cols = split ? getComputedStyle(split).gridTemplateColumns.split(' ').length : 0;
  return {
    hasSplit: !!split,
    splitCols: cols,
    asideOnRight: !!topBox && !!asideBox && asideBox.left >= topBox.right - 2,
    topContainsOrderCard: !!top?.querySelector('.sale-item'),
    bottomContainsTotals: !!bottom?.querySelector('.total-row.big'),
    cardFlex: card ? getComputedStyle(card).display === 'flex' : false,
    cardMaxH: card ? getComputedStyle(card).maxHeight : null,
    scrollable: scroll ? getComputedStyle(scroll).overflowY === 'auto' : false,
    gridColsDesktop: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
    nameOverImage: (() => {
      const n = active?.querySelector('.catalog-tile .tile-name');
      const i = active?.querySelector('.catalog-tile .tile-img');
      if (!n || !i) return false;
      const nb = n.getBoundingClientRect();
      const ib = i.getBoundingClientRect();
      return nb.top >= ib.top && nb.bottom <= ib.bottom;
    })(),
    fabHidden: (() => {
      const f = active?.querySelector('ion-fab.sale-fab');
      if (!f) return true;
      return getComputedStyle(f).display === 'none';
    })(),
  };
});

console.log('GRID:', JSON.stringify(state, null, 2));
console.log('SEARCH "to nhu":', JSON.stringify(searchResult));
console.log('AFTER TILE CLICK:', JSON.stringify(afterClick, null, 2));
console.log('QUICK ADD (+):', JSON.stringify(quickAdd, null, 2));
console.log('QUICK ADD (+):', JSON.stringify(quickAdd, null, 2));
console.log('FAB CLICK:', JSON.stringify(fabClick, null, 2));
console.log('DESKTOP SPLIT:', JSON.stringify(desktop, null, 2));
console.log('real console errors (bo 401/anh mang):', errors.filter((e) => !/\b401\b/.test(e) && !/picsum|net::|Failed to load resource/.test(e)).length);

const ok = state.tileCount === 3
  && state.tiles[0].hasImg && !state.tiles[1].hasImg && state.tiles[1].hasPlaceholderIcon
  && state.gridCols === 3
  && searchResult.length === 1 && /Tô nhựa/.test(searchResult[0])
  && afterClick.saleItems.length === 1 && /12\.000/.test(afterClick.totalDue ?? '') && !afterClick.modalOpened
  && quickAdd.saleItems.length === 2 && /17\.000/.test(quickAdd.totalDue ?? '') && !quickAdd.modalOpened
  && !!state.fab && state.fab.visible && state.fab.circular && state.fab.centerX && state.fab.nearBottom && state.fab.tileAddCircular
  && fabClick.cardTopInViewport
  && desktop.hasSplit && desktop.splitCols === 2 && desktop.asideOnRight
  && desktop.topContainsOrderCard && desktop.bottomContainsTotals
  && desktop.cardFlex && desktop.cardMaxH !== 'none' && desktop.scrollable
  && desktop.gridColsDesktop === 4 && desktop.nameOverImage
  && desktop.fabHidden;
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
