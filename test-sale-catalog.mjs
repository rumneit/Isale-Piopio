// Kiem tra nhanh: trang Ban hang hien danh sach san pham inline (giong Isale)
// Chay: node test-sale-catalog.mjs
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const REF = 'ndsrwpsdqmsbclverbpm';
const ROOT = join(process.cwd(), 'www');
const PORT = 8341;
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
  const catalog = active?.querySelector('.catalog-card');
  return {
    title: active?.querySelector('ion-title')?.textContent?.trim() ?? '',
    hasCatalog: !!catalog,
    catalogHead: catalog?.querySelector('.catalog-head')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
    hasSearch: !!catalog?.querySelector('.picker-search ion-input'),
    searchPlaceholder: catalog?.querySelector('.picker-search ion-input')?.placeholder ?? null,
    emptyText: catalog?.querySelector('.app-empty')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
    pickerItems: active?.querySelectorAll('.picker-item').length ?? 0,
    pager: catalog?.querySelector('.picker-pager')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
    bodyHasOldPanel: !!document.querySelector('.picker-overlay'),
  };
});

console.log(JSON.stringify(state, null, 2));
console.log('console errors (real, bo 401):', errors.filter((e) => !/\b401\b/.test(e)).length);
for (const e of [...new Set(errors.filter((e) => !/\b401\b/.test(e)))]) console.log('  -', e.slice(0, 200));

await browser.close();
server.close();
process.exit(state.hasCatalog ? 0 : 1);
