// isale-audit.mjs — PHẦN 1: Deep-audit trang Sản phẩm Isale qua CDP (Edge debug 9222)
// Xuất: links, URL, text đầy đủ, palette màu/font/radius/shadow, cấu trúc DOM, ảnh màn hình.
import { chromium } from 'playwright';

const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b.contexts()[0].pages().find((x) => x.url().includes('isale.online'));
if (!p) { console.log('NO ISALE TAB'); process.exit(1); }

// --- 0) Liệt kê link/route trên trang hiện tại (xel shadow DOM) ---
const links = await p.evaluate(() => {
  const found = new Set();
  const walk = (root) => {
    for (const el of root.querySelectorAll('a[href]')) { const h = el.getAttribute('href'); if (h && h !== '#') found.add(h); }
    for (const el of root.querySelectorAll('ion-router-link')) { const h = el.getAttribute('href'); if (h) found.add(h); }
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(document);
  return [...found].slice(0, 60);
});
console.log('== LINKS TRANG HIEN TAI ==');
console.log(links.join('\n') || '(khong co a[href])');

// --- 1) Về trang Sản phẩm: click tile "Sản phẩm" (khớp chính xác) ---
try {
  await p.getByText('Sản phẩm', { exact: true }).first().click({ timeout: 6000 });
} catch (e) {
  console.log('CLICK TILE FAIL:', e.message.split('\n')[0]);
}
await p.waitForTimeout(4500);
console.log('URL SAU CLICK:', p.url());

// Fallback: thử các hash phổ biến nếu vẫn ở home
if (p.url().includes('#/home')) {
  for (const h of ['/product', '/product/list', '/products']) {
    await p.evaluate((hh) => { location.hash = hh; }, h);
    await p.waitForTimeout(3000);
    if (!p.url().includes('#/home')) break;
  }
  console.log('URL SAU FALLBACK:', p.url());
}

await p.waitForTimeout(3500);
console.log('TITLE:', await p.title());
console.log('URL CUOI CUNG:', p.url());

// --- 2) Text đầy đủ trang (xel shadow DOM, bỏ script/style, gộp dòng liền trùng) ---
const text = await p.evaluate(() => {
  const out = [];
  const walk = (root, depth) => {
    if (depth > 15 || !root) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const pa = n.parentElement;
      if (pa && /^(SCRIPT|STYLE)$/.test(pa.tagName)) continue;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    for (const el of root.querySelectorAll ? root.querySelectorAll('*') : []) if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
  };
  walk(document, 0);
  return out.filter((t, i) => t !== out[i - 1]).join(' | ');
});
console.log('== TEXT FULL ==');
console.log(text.slice(0, 12000));

// --- 3) Design system: màu / font / cỡ / radius / shadow (aggregate toàn DOM + shadow) ---
const styles = await p.evaluate(() => {
  const colors = {}, bgs = {}, fonts = {}, sizes = {}, radii = {}, shadows = {};
  const add = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
  const walk = (root, depth) => {
    if (depth > 15 || !root) return;
    for (const el of root.querySelectorAll ? root.querySelectorAll('*') : []) {
      let cs;
      try { cs = getComputedStyle(el); } catch { continue; }
      add(colors, cs.color);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') add(bgs, cs.backgroundColor);
      add(fonts, (cs.fontFamily || '').split(',')[0]);
      add(sizes, cs.fontSize + ' / w' + cs.fontWeight);
      if (cs.borderRadius && cs.borderRadius !== '0px') add(radii, cs.borderRadius);
      if (cs.boxShadow && cs.boxShadow !== 'none') add(shadows, cs.boxShadow.slice(0, 80));
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
    }
  };
  walk(document, 0);
  const top = (m, n) => Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, n);
  const bcs = getComputedStyle(document.body);
  return {
    bodyFont: bcs.fontFamily, bodyColor: bcs.color, bodyBg: bcs.backgroundColor,
    colors: top(colors, 14), bgs: top(bgs, 14), fonts: top(fonts, 5),
    sizes: top(sizes, 12), radii: top(radii, 10), shadows: top(shadows, 8),
  };
});
console.log('== DESIGN SYSTEM ==');
console.log(JSON.stringify(styles, null, 1));

// --- 4) Cấu trúc DOM: census tag ion-* + outline con của ion-content ---
const struct = await p.evaluate(() => {
  const tags = {};
  const census = (root) => {
    for (const el of root.querySelectorAll('*')) tags[el.tagName.toLowerCase()] = (tags[el.tagName.toLowerCase()] || 0) + 1;
  };
  const walkAll = (root) => { census(root); for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walkAll(el.shadowRoot); };
  walkAll(document);
  const outline = [];
  const dive = (el, d) => {
    if (d > 5 || outline.length > 70) return;
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    outline.push('  '.repeat(d) + el.tagName.toLowerCase() + cls);
    for (const c of el.children) if (!/^(SCRIPT|STYLE|ION-ICON|SVG)$/.test(c.tagName)) dive(c, d + 1);
  };
  const ic = document.querySelector('ion-content');
  if (ic) for (const c of ic.children) dive(c, 0);
  return {
    tags: Object.entries(tags).filter(([t]) => t.startsWith('ion-')).sort((a, b2) => b2[1] - a[1]).slice(0, 32),
    outline,
  };
});
console.log('== STRUCT ==');
console.log(JSON.stringify(struct, null, 1));

// --- 5) Ảnh: đầu trang + cuộn xuống cuối (bắt lazy load) ---
await p.screenshot({ path: 'audit-output/isale-products-1.png' });
await p.evaluate(() => document.querySelector('ion-content')?.scrollToBottom?.(400));
await p.waitForTimeout(2500);
await p.screenshot({ path: 'audit-output/isale-products-2.png' });
console.log('DONE — anh: audit-output/isale-products-1.png, isale-products-2.png');

await b.close();
process.exit(0);
