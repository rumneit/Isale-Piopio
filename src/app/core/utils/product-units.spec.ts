import { describe, expect, it } from 'vitest';
import {
  basePriceFor,
  baseQtyFor,
  defaultSaleUnit,
  findSaleUnit,
  productSaleUnits,
} from './product-units';

const product = {
  unit: 'Cái',
  price: 20_000,
  units: [
    { name: 'Thùng', conversion: 40, price: 720_000, cost: 600_000, is_default: true },
    { name: 'Lốc', conversion: 6, price: 110_000, cost: 90_000 },
  ],
};

describe('product-units', () => {
  it('always exposes the base unit first and keeps alternate-unit prices', () => {
    const units = productSaleUnits(product);
    expect(units.map((u) => u.name)).toEqual(['Cái', 'Thùng', 'Lốc']);
    expect(units[0]).toMatchObject({ conversion: 1, price: 20_000, isBase: true, isDefault: false });
    expect(units[1]).toMatchObject({ conversion: 40, price: 720_000, isDefault: true });
    expect(units[2]).toMatchObject({ conversion: 6, price: 110_000, isDefault: false });
  });

  it('uses the first alternate as default only when no unit is marked default', () => {
    expect(defaultSaleUnit(product)?.name).toBe('Thùng');
    expect(defaultSaleUnit({ unit: 'Cái', price: 5_000, units: [] })?.name).toBe('Cái');
    expect(defaultSaleUnit({ unit: 'Cái', price: 5_000 })?.name).toBe('Cái');
  });

  it('falls back to base price × conversion when an alternate has no price', () => {
    const units = productSaleUnits({
      unit: 'Cái',
      price: 10_000,
      units: [{ name: 'Hộp', conversion: 12, price: null }],
    });
    expect(units[1].price).toBe(120_000);
  });

  it('ignores duplicate or blank alternate units and normalizes bad conversions', () => {
    const units = productSaleUnits({
      unit: 'Cái',
      price: 10_000,
      units: [
        { name: 'Cái', conversion: 1, price: 10_000 },
        { name: '  ', conversion: 10, price: 100_000 },
        { name: 'Hộp', conversion: 0, price: 100_000 },
      ],
    });
    expect(units.map((u) => u.name)).toEqual(['Cái', 'Hộp']);
    expect(units[1].conversion).toBe(1);
  });

  it('quy đổi số lượng và giá về đơn vị gốc', () => {
    expect(baseQtyFor(2, 40)).toBe(80);
    expect(baseQtyFor(1.5, 6)).toBe(9);
    expect(baseQtyFor(-2, 40)).toBe(0);
    expect(basePriceFor(720_000, 40)).toBe(18_000);
    expect(basePriceFor(100_000, 6)).toBe(16_666.67);
  });

  it('findSaleUnit returns null when the unit was removed', () => {
    expect(findSaleUnit(product, 'Thùng')?.conversion).toBe(40);
    expect(findSaleUnit(product, 'Bao')).toBeNull();
  });
});
