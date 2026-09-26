// read-tabs.mjs — đọc các tab trong Edge debug (CDP 127.0.0.1:9222)
// Cách dùng:
//   node read-tabs.mjs                                  -> liệt kê mọi tab (số thứ tự + tiêu đề + URL)
//   node read-tabs.mjs <số|từ-khóa-url> text [maxChars] -> đọc chữ trong tab (xel cả shadow DOM Ionic)
//   node read-tabs.mjs <số|từ-khóa-url> shot [file.png] -> chụp màn hình tab
//   node read-tabs.mjs <số|từ-khóa-url> info            -> URL + tiêu đề
// Lưu ý: kết nối CDP chỉ ĐỌC + điều hướng khi được yêu cầu; browser.close() chỉ ngắt kết nối, KHÔNG đóng Edge.
import { chromium } from 'playwright';

const CDP = 'http://127.0.0.1:9222';
const [, , target, action, arg] = process.argv;

const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const pages = ctx.pages();

if (!target) {
  for (let i = 0; i < pages.length; i++) {
    console.log(`${i}: [${await pages[i].title()}] ${pages[i].url()}`);
  }
  await browser.close();
  process.exit(0);
}

let page;
if (/^\d+$/.test(target)) page = pages[Number(target)];
else {
  const key = target.toLowerCase();
  for (const p of pages) {
    const url = p.url().toLowerCase();
    let title = '';
    try { title = (await p.title()).toLowerCase(); } catch {}
    if (url.includes(key) || title.includes(key)) { page = p; break; }
  }
}
if (!page) { console.log('KHONG THAY TAB:', target); process.exit(1); }

if (action === 'text') {
  const max = Number(arg ?? 6000);
  const text = await page.evaluate(() => {
    const out = [];
    const walk = (root, depth) => {
      if (depth > 15 || !root) return;
      const tw = root.ownerDocument?.createTreeWalker
        ? document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        : null;
      if (tw) {
        let n;
        while ((n = tw.nextNode())) {
          const p = n.parentElement;
          if (p && /^(SCRIPT|STYLE)$/.test(p.tagName)) continue;
          const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
          if (t) out.push(t);
        }
      }
      for (const el of root.querySelectorAll ? root.querySelectorAll('*') : []) {
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    walk(document, 0);
    // gộp các đoạn trùng liền nhau
    return out.filter((t, i) => t !== out[i - 1]).join(' | ');
  });
  console.log('URL:', page.url());
  console.log(text.slice(0, max));
} else if (action === 'shot') {
  const file = arg ?? 'audit-output/edge-shot.png';
  await page.screenshot({ path: file });
  console.log('Saved:', file);
} else {
  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());
}

await browser.close();
process.exit(0);
