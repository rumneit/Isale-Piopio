import { Product } from '../models/models';

/**
 * Một đơn vị có thể chọn khi bán.
 *
 * `conversion` là số đơn vị cơ bản trong 1 đơn vị này (VD: 1 Thùng = 40 Cái
 * thì conversion = 40). Giá bán luôn là giá của chính đơn vị đang chọn.
 */
export interface SaleUnit {
  name: string;
  conversion: number;
  price: number;
  cost: number | null;
  /** Đơn vị gốc của sản phẩm (products.unit) */
  isBase: boolean;
  /** Đơn vị được đánh dấu "Mặc định" trong trang sửa sản phẩm */
  isDefault: boolean;
}

type UnitProduct = Pick<Product, 'unit' | 'price' | 'units'>;

/**
 * Danh sách đơn vị bán của một sản phẩm, luôn có đơn vị gốc ở đầu.
 * Dữ liệu cũ/chưa chạy migration v19 sẽ trả về đúng 1 đơn vị gốc.
 */
export function productSaleUnits(product: UnitProduct | null | undefined): SaleUnit[] {
  if (!product) return [];
  const baseName = (product.unit || 'Cái').trim() || 'Cái';
  const basePrice = finiteNumber(product.price);
  const base: SaleUnit = {
    name: baseName,
    conversion: 1,
    price: basePrice,
    cost: null,
    isBase: true,
    isDefault: false,
  };

  const seen = new Set<string>([baseName]);
  const alternates: SaleUnit[] = [];
  for (const raw of product.units ?? []) {
    const name = (raw?.name ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const conversion = positiveNumber(raw.conversion, 1);
    alternates.push({
      name,
      conversion,
      price: raw.price != null ? finiteNumber(raw.price) : basePrice * conversion,
      cost: raw.cost != null ? finiteNumber(raw.cost) : null,
      isBase: false,
      isDefault: !!raw.is_default,
    });
  }

  const hasDefaultAlternate = alternates.some((u) => u.isDefault);
  base.isDefault = !hasDefaultAlternate;
  return [base, ...alternates];
}

/** Đơn vị mặc định để thêm nhanh (nút +, quét mã vạch). */
export function defaultSaleUnit(product: UnitProduct | null | undefined): SaleUnit | null {
  const units = productSaleUnits(product);
  return units.find((u) => u.isDefault) ?? units[0] ?? null;
}

/** Tìm đơn vị theo tên; trả null nếu sản phẩm không còn đơn vị đó. */
export function findSaleUnit(product: UnitProduct | null | undefined, name: string | null | undefined): SaleUnit | null {
  if (!name) return null;
  return productSaleUnits(product).find((u) => u.name === name) ?? null;
}

/** Quy đổi số lượng đang chọn về đơn vị gốc để kiểm tra/trừ tồn kho. */
export function baseQtyFor(unitQty: number, conversion: number): number {
  const qty = Number.isFinite(Number(unitQty)) ? Math.max(0, Number(unitQty)) : 0;
  return qty * positiveNumber(conversion, 1);
}

/** Giá bán quy về 1 đơn vị gốc, làm tròn 2 chữ số như cột order_items.price. */
export function basePriceFor(unitPrice: number, conversion: number): number {
  const price = Number.isFinite(Number(unitPrice)) ? Math.max(0, Number(unitPrice)) : 0;
  return Math.round((price / positiveNumber(conversion, 1)) * 100) / 100;
}

function finiteNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
