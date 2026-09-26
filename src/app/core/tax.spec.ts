import { describe, it, expect } from 'vitest';
import { computeTax, periodRange, periodLabel, recentPeriods, htkkRows } from './tax';

describe('tax (kê khai thuế)', () => {
  it('phương pháp trực tiếp: GTGT = doanh thu × tỉ lệ', () => {
    const r = computeTax({ revenue: 100_000_000, method: 'direct', directRate: 1 });
    expect(r.payableVat).toBe(1_000_000);
    expect(r.rate).toBe(1);
  });

  it('phương pháp khấu trừ: trừ thuế đầu vào', () => {
    const r = computeTax({ revenue: 110_000_000, method: 'deduction', inputVat: 2_000_000 });
    expect(r.outputVat).toBe(10_000_000);
    expect(r.payableVat).toBe(8_000_000);
  });

  it('khấu trừ không cho phép thuế âm', () => {
    const r = computeTax({ revenue: 11_000_000, method: 'deduction', inputVat: 50_000_000 });
    expect(r.payableVat).toBe(0);
  });

  it('doanh thu 0 => thuế 0', () => {
    expect(computeTax({ revenue: 0, method: 'direct', directRate: 5 }).payableVat).toBe(0);
  });

  it('periodLabel định dạng tháng/năm', () => {
    expect(periodLabel('2026-09')).toBe('Tháng 09/2026');
  });

  it('periodRange trả về khoảng UTC đúng 1 tháng', () => {
    const { from, to } = periodRange('2026-09');
    expect(from).toBe('2026-09-01T00:00:00.000Z');
    expect(to).toBe('2026-10-01T00:00:00.000Z');
  });

  it('recentPeriods trả về 12 kỳ mới nhất, giảm dần', () => {
    const p = recentPeriods(12);
    expect(p).toHaveLength(12);
    expect(p[0] > p[1]).toBe(true);
  });

  it('htkkRows có mã chỉ tiêu chuẩn', () => {
    const rows = htkkRows(computeTax({ revenue: 100_000_000, method: 'direct', directRate: 1 }));
    expect(rows.some((r) => r[1] === '[40]')).toBe(true);
  });
});
