import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportPath = resolve('coverage/app/coverage-summary.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const floors = {
  total: { lines: 6.8, branches: 9.4, functions: 5.4, statements: 6.8 },
  'src/app/core/permissions.ts': { lines: 100 },
  'src/app/core/services/customers.service.ts': { lines: 39 },
  'src/app/core/services/inventory-ledger.service.ts': { lines: 89 },
  'src/app/core/services/orders.service.ts': { lines: 55 },
  'src/app/core/services/transactions.service.ts': { lines: 48 },
};

let failed = false;
for (const [file, metrics] of Object.entries(floors)) {
  const key = file === 'total'
    ? 'total'
    : Object.keys(report).find((candidate) => candidate.endsWith(file));
  if (!key || !report[key]) {
    console.error(`FAIL coverage: không tìm thấy ${file}`);
    failed = true;
    continue;
  }
  for (const [metric, minimum] of Object.entries(metrics)) {
    const actual = Number(report[key][metric]?.pct ?? 0);
    const ok = actual >= minimum;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${file} ${metric}: ${actual}% (floor ${minimum}%)`);
    if (!ok) failed = true;
  }
}

if (failed) process.exit(1);
