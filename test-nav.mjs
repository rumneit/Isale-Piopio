// Script tái hiện lỗi điều hướng — chạy local, không push
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const ROOT = join(process.cwd(), 'www');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  let p = req.url.split('?')[0].split('#')[0];
  if (p === '/' || p === '') p = '/index.html';
  try {
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA fallback
    const data = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  }
});

await new Promise((r) => server.listen(8333, r));
console.log('server on :8333');

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleLogs = [];
page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => consoleLogs.push(`[PAGEERROR] ${err.message}\n${err.stack?.split('\n').slice(0, 4).join('\n')}`));
page.on('requestfailed', (req) => consoleLogs.push(`[REQFAIL] ${req.url()} :: ${req.failure()?.errorText}`));

await page.goto('http://localhost:8333/#/home', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

console.log('=== URL after boot:', page.url());
console.log('=== Page title visible:', await page.locator('ion-title').first().textContent().catch(() => 'N/A'));

// Bấm quick action "Đơn hàng mới"
const action = page.locator('.app-action', { hasText: 'Đơn hàng mới' }).first();
const actionCount = await action.count();
console.log('=== action found:', actionCount);
if (actionCount > 0) {
  await action.click();
  await page.waitForTimeout(3500);
  console.log('=== URL after click:', page.url());
  const title = await page.locator('ion-title').first().textContent().catch(() => 'N/A');
  console.log('=== title after click:', title);
  // Có nội dung trang order-add không?
  const hasForm = await page.locator('text=Khách hàng').count();
  console.log('=== order-add content found:', hasForm > 0 ? 'YES' : 'NO');
} else {
  console.log('!!! quick action not found — maybe redirected to login');
  const loginVisible = await page.locator('.login-wrapper').count();
  console.log('=== login wrapper visible:', loginVisible);
}

console.log('\n=== CONSOLE LOGS (last 40) ===');
console.log(consoleLogs.slice(-40).join('\n'));

await browser.close();
server.close();
process.exit(0);
