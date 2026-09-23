import { describe, it, expect } from 'vitest';
import {
  calcShippingFee, zoneByKey, feeTable, SHIPPING_ZONES,
} from './shipping';

describe('shipping (tính phí vận chuyển)', () => {
  it('nội thành 1kg = phí cơ bản (không phụ phí cân)', () => {
    expect(calcShippingFee(1, 'inner')).toBe(22000);
  });

  it('cân nặng vượt mức miễn phí được làm tròn lên theo kg', () => {
    // nội thành: 22000 + ceil(1.5)*5000 = 32000
    expect(calcShippingFee(2.5, 'inner')).toBe(32000);
  });

  it('liên tỉnh đắt hơn nội thành cùng cân nặng', () => {
    expect(calcShippingFee(3, 'province')).toBeGreaterThan(calcShippingFee(3, 'inner'));
  });

  it('áp chiết khấu phần trăm của đối tác', () => {
    // 30000 * (1 - 10%) = 27000
    expect(calcShippingFee(1, 'outer', 10)).toBe(27000);
  });

  it('phí COD tính theo tỉ lệ', () => {
    // 22000 + 1_000_000 * 0.5% = 27000
    expect(calcShippingFee(1, 'inner', 0, 1_000_000, 0.5)).toBe(27000);
  });

  it('zoneByKey trả về mặc định khi khoá sai', () => {
    expect(zoneByKey('khong-ton-tai').key).toBe(SHIPPING_ZONES[0].key);
  });

  it('bảng giá có đủ 3 vùng', () => {
    const t = feeTable();
    expect(t).toHaveLength(3);
    expect(t.every((r) => r.fee > 0)).toBe(true);
  });

  it('cân nặng âm/không hợp lệ không tạo phí âm', () => {
    expect(calcShippingFee(-5, 'inner')).toBe(22000);
    expect(calcShippingFee(NaN as any, 'inner')).toBe(22000);
  });
});
