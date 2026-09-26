// isale-audit-edit.mjs — PHẦN 1: Deep-audit trang SỬA SẢN PHẨM Isale (#/product/update/:id)
// Chỉ ĐỌC + tương tác UI an toàn (KHÔNG bấm Lưu, KHÔNG tạo/xóa dữ liệu thật)
import { chromium } from 'playwright';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages().find((x) => x.url().includes('isale.online'));
if (!p) { console.log('NO ISALE TAB'); process.exit(1); }

// --- 0) Về trang sửa ---
await p.evaluate(() => { location.hash = '/product/update/135960'; });
await p.waitForTimeout(3500);
console.log('EDIT URL:', p.url());

// --- 1) Text đầy đủ ---
const dumpText = () =>
  p.evaluate(() => {
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
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    walk(document, 0);
    return out.filter((t, i) => t !== out[i - 1]).join(' | ');
  });

console.log('== TEXT FULL ==');
console.log((await dumpText()).slice(0, 12000));

// --- 2) Cuộn toàn trang, chụp từng khung ---
const shInfo = await p.evaluate(() => {
  const ics = Array.from(document.querySelectorAll('ion-content'));
  const ic = ics[ics.length - 1];
  const main = ic?.shadowRoot?.querySelector('main');
  return main ? { sh: main.scrollHeight, ch: main.clientHeight } : { sh: 0, ch: 0 };
});
console.log('== SCROLL HEIGHT ==', JSON.stringify(shInfo));

let step = 0;
for (let y = 0; y < 12000; y += 700) {
  const done = await p.evaluate((yy) => {
    const ics = Array.from(document.querySelectorAll('ion-content'));
    const ic = ics[ics.length - 1];
    const main = ic?.shadowRoot?.querySelector('main');
    if (!main) return true;
    main.scrollTop = yy;
    return main.scrollTop + main.clientHeight >= main.scrollHeight - 4;
  }, y);
  await p.waitForTimeout(450);
  await p.screenshot({ path: `audit-output/isale-edit-s${String(step).padStart(2, '0')}.png` });
  step++;
  if (done) break;
}
console.log('== SCROLL SHOTS ==', step);

// --- 3) Tab "Trường tùy chỉnh" ---
const tabs = await p.evaluate(() =>
  Array.from(document.querySelectorAll('ion-segment ion-segment-button')).map((sb) => ({
    label: (sb.textContent || '').trim(),
    value: sb.getAttribute('value') ?? '',
  }))
);
console.log('== TABS ==', JSON.stringify(tabs));
const customTab = tabs.find((t) => /Trường tùy chỉnh/i.test(t.label));
if (customTab) {
  await p.locator('ion-segment-button', { hasText: 'Trường tùy chỉnh' }).first().click({ timeout: 6000 });
  await p.waitForTimeout(1500);
  console.log('== PANE [Trường tùy chỉnh] ==');
  console.log((await dumpText()).slice(-2600));
  await p.screenshot({ path: 'audit-output/isale-edit-custom.png' });
  // về tab Cơ bản
  await p.locator('ion-segment-button', { hasText: 'Cơ bản' }).first().click({ timeout: 6000 });
  await p.waitForTimeout(900);
}

// --- 4) Tương tác an toàn: "Mục + Thêm" (modal nhóm hàng?) ---
try {
  await p.locator('text=+ Thêm').first().click({ timeout: 5000 });
  await p.waitForTimeout(1600);
  console.log('== MODAL MỤC (text) ==');
  console.log((await dumpText()).slice(-1800));
  await p.screenshot({ path: 'audit-output/isale-edit-muc-modal.png' });
  // đóng bằng nút Close/Đóng nếu có
  const closed = await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('ion-modal ion-button, ion-alert ion-button'));
    const close = btns.find((x) => /Đóng|Close|Hủy/i.test(x.textContent || ''));
    if (close) { close.click(); return 'clicked ' + (close.textContent || '').trim(); }
    return 'no close btn';
  });
  console.log('CLOSE:', closed);
  await p.waitForTimeout(900);
} catch (e) {
  console.log('MUC MODAL FAIL:', e.message.split('\n')[0]);
}

// --- 5) "+ Nhiều mã vạch" ---
try {
  await p.locator('text=Nhiều mã vạch').first().click({ timeout: 5000 });
  await p.waitForTimeout(1500);
  console.log('== NHIEU MA VACH (text) ==');
  console.log((await dumpText()).slice(-1400));
  await p.screenshot({ path: 'audit-output/isale-edit-barcodes.png' });
  const closed = await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('ion-modal ion-button, ion-alert ion-button'));
    const close = btns.find((x) => /Đóng|Close|Hủy/i.test(x.textContent || ''));
    if (close) { close.click(); return 'clicked'; }
    return 'no close btn';
  });
  console.log('CLOSE:', closed);
  await p.waitForTimeout(900);
} catch (e) {
  console.log('BARCODES FAIL:', e.message.split('\n')[0]);
}

// --- 6) Cấu trúc DOM ---
const struct = await p.evaluate(() => {
  const contents = Array.from(document.querySelectorAll('ion-content'));
  const ic = contents[contents.length - 1];
  const outline = [];
  const dive = (el, d) => {
    if (d > 5 || outline.length > 90) return;
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
