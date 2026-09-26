// isale-audit-detail.mjs — PHẦN 1: Deep-audit trang CHI TIẾT SẢN PHẨM Isale qua CDP
// Điều hướng: /product -> bấm card đầu -> /product/detail/:id -> dump đủ 8 tab (text + ảnh)
import { chromium } from 'playwright';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages().find((x) => x.url().includes('isale.online'));
if (!p) { console.log('NO ISALE TAB'); process.exit(1); }

// --- 0) Về trang Sản phẩm, bấm card đầu tiên ---
await p.evaluate(() => { location.hash = '/product'; });
await p.waitForTimeout(3500);
try {
  await p.locator('ion-card').first().click({ timeout: 8000 });
} catch (e) {
  console.log('CLICK CARD FAIL:', e.message.split('\n')[0]);
}
await p.waitForTimeout(4500);
console.log('DETAIL URL:', p.url());

// --- 1) Text đầy đủ tab Chi tiết ---
const dumpText = async (excludeSegment) => {
  return p.evaluate((exSeg) => {
    const out = [];
    const walk = (root, depth) => {
      if (depth > 16 || !root) return;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        const pa = n.parentElement;
        if (pa && /^(SCRIPT|STYLE)$/.test(pa.tagName)) continue;
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      }
      for (const el of root.querySelectorAll ? root.querySelectorAll('*') : []) {
        if (exSeg && el.tagName === 'ION-SEGMENT') continue;
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    const seg = document.querySelector('ion-segment');
    const base = exSeg && seg ? seg.parentElement || document : document;
    walk(base, 0);
    return out.filter((t, i) => t !== out[i - 1]).join(' | ');
  }, excludeSegment);
};

console.log('== TEXT FULL (tab Chi tiết) ==');
console.log((await dumpText(false)).slice(0, 10000));

// --- 2) Danh sách tab + click lần lượt từng tab, dump text pane + chụp ảnh ---
const tabs = await p.evaluate(() =>
  Array.from(document.querySelectorAll('ion-segment ion-segment-button')).map((sb) => ({
    label: (sb.textContent || '').trim(),
    value: sb.getAttribute('value') ?? '',
  }))
);
console.log('== TABS ==', JSON.stringify(tabs));

const screenKeys = ['chitiet', 'donvi', 'lichsu', 'anh', 'gia', 'chietkhau', 'options', 'phanloai'];
for (let i = 0; i < tabs.length; i++) {
  const lbl = tabs[i].label;
  try {
    await p.locator('ion-segment-button', { hasText: lbl }).first().click({ timeout: 6000 });
  } catch (e) {
    console.log(`CLICK TAB "${lbl}" FAIL`);
    continue;
  }
  await p.waitForTimeout(i === 2 ? 2600 : 1400); // tab Lịch sử đợi tải dữ liệu
  const pane = await dumpText(true);
  console.log(`== PANE [${lbl}] ==`);
  console.log(pane.slice(0, 2600));
  await p.screenshot({ path: `audit-output/isale-detail-${screenKeys[i] ?? i}.png` });
}

// --- 3) Cấu trúc DOM: outline nội dung trang (ion-content CUỐI = trang route, không phải menu) ---
const struct = await p.evaluate(() => {
  const contents = Array.from(document.querySelectorAll('ion-content'));
  const ic = contents[contents.length - 1];
  const outline = [];
  const dive = (el, d) => {
    if (d > 5 || outline.length > 80) return;
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    outline.push('  '.repeat(d) + el.tagName.toLowerCase() + cls);
    for (const c of el.children) if (!/^(SCRIPT|STYLE|ION-ICON|SVG)$/.test(c.tagName)) dive(c, d + 1);
  };
  if (ic) for (const c of ic.children) dive(c, 0);
  const tags = {};
  const census = (root) => { for (const el of root.querySelectorAll('*')) tags[el.tagName.toLowerCase()] = (tags[el.tagName.toLowerCase()] || 0) + 1; };
  const walkAll = (root) => { census(root); for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walkAll(el.shadowRoot); };
  walkAll(document);
  return { outline, ionTags: Object.entries(tags).filter(([t]) => t.startsWith('ion-')).sort((a, b2) => b2[1] - a[1]).slice(0, 30) };
});
console.log('== STRUCT ==');
console.log(JSON.stringify(struct, null, 1));

console.log('DONE');
await b.close();
process.exit(0);
