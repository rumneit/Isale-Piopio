// Kiem tra toan bo icon name dung cho <ion-icon> trong template (.html) va
// khai bao `icon: '...'` trong .ts, doi chieu voi ionicons de phat hien ten sai
// (vd: camelCase 'barChartOutline' thay vi kebab-case 'bar-chart-outline').
//
// Luu y: <ion-spinner name="..."> dung bo ten KHAC (crescent, dots, lines...)
// nen khong duoc kiem tra o day.
import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SRC = join(process.cwd(), 'src');

// Tap hop ten icon hop le tu ionicons (kebab-case: 'bar-chart-outline')
const iconsPkg = require('ionicons/icons');
const validNames = new Set(
  Object.keys(iconsPkg).map((k) =>
    k
      .replace(/^logo/, 'logo-')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
  )
);

const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(html|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const used = new Map(); // name -> Set(file)
function record(name, rel) {
  if (!name) return;
  if (used.has(name)) used.get(name).add(rel);
  else used.set(name, new Set([rel]));
}

for (const f of await walk(SRC)) {
  const text = await readFile(f, 'utf8');
  const rel = relative(process.cwd(), f);

  // <ion-icon ... name="X"> (attribute co the nam tren dong khac)
  for (const tag of text.matchAll(/<ion-icon\b[^>]*>/gs)) {
    const m = tag[0].match(/\bname="([^"]+)"/);
    if (m) record(m[1], rel);
  }
  // Khai bao trong TS: { icon: 'X', ... } hoac icon: 'X'
  for (const m of text.matchAll(/\bicon:\s*'([^']+)'/g)) record(m[1], rel);
}

const findings = [];
for (const [name, files] of used) {
  const where = [...files].join(', ');
  if (!kebab.test(name)) {
    findings.push({ name, where, reason: 'SAI DINH DANG (khong phai kebab-case)' });
  } else if (!validNames.has(name)) {
    findings.push({ name, where, reason: 'KHONG TON TAI trong ionicons' });
  }
}

console.log(`Da quet toan bo src/, ${used.size} ten icon duy nhat.`);
if (!findings.length) {
  console.log('Khong co icon loi.');
} else {
  console.log(`\n=== ${findings.length} ICON LOI ===`);
  for (const f of findings) console.log(`- "${f.name}"  [${f.reason}]\n    ${f.where}`);
}
process.exit(findings.length ? 1 : 0);
