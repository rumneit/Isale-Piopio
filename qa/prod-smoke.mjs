// Smoke production: chỉ kiểm tra phần công khai (không đăng nhập, không ghi dữ liệu).
// Xác minh bundle mới đã deploy: trang login render, route reset-password tồn tại,
// guard chặn /home khi chưa có session, không lỗi console.
//
//   FONTCONFIG_FILE=... LD_LIBRARY_PATH=... node qa/prod-smoke.mjs
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.PROD_URL ?? 'https://quanlykhopiopio.vercel.app';
const OUT = join(process.cwd(), 'qa', 'evidence');
await mkdir(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported browser: ${browserName}`);
const browser = await browserType.launch(browserName === 'chromium' ? { args: ['--no-sandbox'] } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

console.log('\n== P1: trang đăng nhập production ==');
await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3000);
let text = await page.evaluate(() => document.body.innerText);
check('login render', /Đăng nhập|đăng nhập/i.test(text), text.slice(0, 80).replace(/\n/g, ' | '));
check('không lỗi console', errors.length === 0, errors.join(' | ').slice(0, 200));
await page.screenshot({ path: join(OUT, 'prod-login.png') });

console.log('\n== P2: guard chặn /home khi chưa đăng nhập ==');
await page.goto(`${BASE}/#/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);
check('bị đưa về /login', page.url().includes('/login'), page.url());

console.log('\n== P3: route đặt lại mật khẩu đã deploy ==');
errors.length = 0;
await page.goto(`${BASE}/#/reset-password`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);
text = await page.evaluate(() => document.body.innerText);
check('trang reset tồn tại (không 404)', /Đặt lại mật khẩu/i.test(text), text.slice(0, 80).replace(/\n/g, ' | '));
check('báo link không hợp lệ khi không có token', /không hợp lệ|hết hạn/i.test(text));
check('không lỗi console', errors.length === 0, errors.join(' | ').slice(0, 200));
await page.screenshot({ path: join(OUT, 'prod-reset.png') });

console.log('\n== P4: URL lạ hiển thị 404 ==');
await page.goto(`${BASE}/#/khong-ton-tai-qa`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2000);
text = await page.evaluate(() => document.body.innerText);
check('có trang không tìm thấy', /không tìm thấy|404/i.test(text), text.slice(0, 80).replace(/\n/g, ' | '));

await writeFile(join(OUT, 'prod-smoke.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
if (failed.length) process.exitCode = 1;
