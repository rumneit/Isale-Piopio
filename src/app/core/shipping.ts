/**
 * Đối tác vận chuyển — logic thuần (không phụ thuộc Supabase) để dễ kiểm thử.
 *
 * Quy tắc phí:
 *  - Phí cơ bản theo vùng (nội thành / ngoại thành / liên tỉnh).
 *  - Cộng phụ phí cân nặng vượt mức miễn phí.
 *  - Áp chiết khấu phần trăm của đối tác (fee_percent) nếu có.
 */

export interface ShippingZone {
  key: 'inner' | 'outer' | 'province';
  label: string;
  baseFee: number;
  freeWeightKg: number;
  perKgFee: number;
}

export const SHIPPING_ZONES: ShippingZone[] = [
  { key: 'inner', label: 'Nội thành', baseFee: 22000, freeWeightKg: 1, perKgFee: 5000 },
  { key: 'outer', label: 'Ngoại thành', baseFee: 30000, freeWeightKg: 1, perKgFee: 7000 },
  { key: 'province', label: 'Liên tỉnh', baseFee: 40000, freeWeightKg: 1, perKgFee: 10000 },
];

/** Các đối tác phổ biến tại Việt Nam (dùng làm gợi ý, không bắt buộc). */
export const SHIPPING_CARRIERS = [
  { code: 'ghn', name: 'Giao Hàng Nhanh (GHN)' },
  { code: 'ghtk', name: 'Giao Hàng Tiết Kiệm (GHTK)' },
  { code: 'viettelpost', name: 'Viettel Post' },
  { code: 'jtexpress', name: 'J&T Express' },
  { code: 'best', name: 'BEST Express' },
  { code: 'vnpost', name: 'Vietnam Post' },
  { code: 'ahamove', name: 'AhaMove' },
  { code: 'grabexpress', name: 'GrabExpress' },
];

export function zoneByKey(key: string | null | undefined): ShippingZone {
  return SHIPPING_ZONES.find((z) => z.key === key) ?? SHIPPING_ZONES[0];
}

/**
 * Tính phí vận chuyển.
 * @param weightKg cân nặng kiện hàng
 * @param zoneKey  vùng giao
 * @param feePercent chiết khấu % của đối tác (0–100)
 * @param cod tiền thu hộ (COD) — có thể tính phí thu hộ 0.5% (mặc định tắt)
 * @param codFeePercent tỉ lệ phí COD (mặc định 0)
 */
export function calcShippingFee(
  weightKg: number,
  zoneKey: string | null | undefined,
  feePercent = 0,
  cod = 0,
  codFeePercent = 0
): number {
  const zone = zoneByKey(zoneKey);
  const weight = Math.max(0, Number(weightKg) || 0);
  const extra = Math.max(0, weight - zone.freeWeightKg);
  const weightFee = Math.ceil(extra) * zone.perKgFee;
  const codFee = Math.max(0, Number(cod) || 0) * (Math.max(0, codFeePercent) / 100);
  const raw = zone.baseFee + weightFee + codFee;
  const discount = raw * (Math.max(0, Math.min(100, feePercent)) / 100);
  return Math.round(raw - discount);
}

/** Bảng giá tham khảo của một đối tác theo 3 vùng. */
export function feeTable(feePercent = 0): Array<{ zone: string; label: string; fee: number }> {
  return SHIPPING_ZONES.map((z) => ({
    zone: z.key,
    label: z.label,
    fee: calcShippingFee(z.freeWeightKg, z.key, feePercent),
  }));
}
