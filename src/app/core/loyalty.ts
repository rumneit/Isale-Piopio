/**
 * Tích điểm & thăng hạng khách hàng — logic thuần để dễ kiểm thử.
 *
 * - Điểm tích lũy: floor(tổng đơn / spendPerPoint), chỉ khi đơn đạt mức tối thiểu.
 * - Đổi điểm: điểm × redeemValue (₫).
 * - Thăng hạng: chọn hạng cao nhất mà khách đạt đồng thời cả mức chi tiêu VÀ điểm.
 */

export type LoyaltyTierKey = 'all' | 'bronze' | 'silver' | 'gold' | 'platinum';

export interface PointConfigRule {
  id?: string;
  name: string;
  tier: LoyaltyTierKey;
  spend_per_point: number;
  redeem_value: number;
  min_order_total: number;
  active?: boolean;
}

export interface LoyaltyTierRule {
  id?: string;
  name: string;
  tier: string;
  min_spend: number;
  min_points: number;
  discount_percent: number;
  active?: boolean;
  sort_order?: number;
}

/** Quy tắc mặc định khi shop chưa cấu hình gì. */
export const DEFAULT_POINT_RULE: PointConfigRule = {
  name: 'Mặc định',
  tier: 'all',
  spend_per_point: 10000,
  redeem_value: 1000,
  min_order_total: 0,
  active: true,
};

/** Chọn quy tắc tích điểm phù hợp nhất cho một hạng khách. */
export function pickPointRule(rules: PointConfigRule[], tier: string | null | undefined): PointConfigRule {
  const active = rules.filter((r) => r.active !== false);
  if (!active.length) return DEFAULT_POINT_RULE;
  const exact = active.find((r) => r.tier === tier);
  return exact ?? active.find((r) => r.tier === 'all') ?? active[0];
}

/** Số điểm được tích cho một đơn hàng. Trả 0 nếu đơn dưới mức tối thiểu. */
export function earnPoints(orderTotal: number, rule: PointConfigRule): number {
  const total = Number(orderTotal) || 0;
  const rate = Number(rule.spend_per_point) || 0;
  if (rate <= 0) return 0;
  if (total < (Number(rule.min_order_total) || 0)) return 0;
  return Math.floor(total / rate);
}

/** Giá trị quy đổi (₫) của số điểm khi đổi thưởng. */
export function redeemValue(points: number, rule: PointConfigRule): number {
  return Math.round(Math.max(0, Number(points) || 0) * (Number(rule.redeem_value) || 0));
}

/**
 * Xác định hạng của khách dựa trên tổng chi tiêu và điểm hiện có.
 * Trả về hạng có ngưỡng cao nhất mà khách đạt cả hai điều kiện.
 */
export function evaluateTier(
  tiers: LoyaltyTierRule[],
  totalSpend: number,
  points: number
): LoyaltyTierRule | null {
  const eligible = tiers
    .filter((t) => t.active !== false)
    .filter((t) => totalSpend >= (Number(t.min_spend) || 0) && points >= (Number(t.min_points) || 0))
    .sort((a, b) => (Number(a.min_spend) || 0) - (Number(b.min_spend) || 0));
  return eligible.length ? eligible[eligible.length - 1] : null;
}

/** Hạng kế tiếp mà khách chưa đạt (để hiển thị "còn thiếu bao nhiêu"). */
export function nextTier(tiers: LoyaltyTierRule[], current: LoyaltyTierRule | null): LoyaltyTierRule | null {
  const sorted = tiers
    .filter((t) => t.active !== false)
    .sort((a, b) => (Number(a.min_spend) || 0) - (Number(b.min_spend) || 0));
  if (!sorted.length) return null;
  if (!current) return sorted[0];
  const idx = sorted.findIndex((t) => t.tier === current.tier);
  return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
}

/** Cấu hình thăng hạng mặc định (4 hạng) cho shop mới. */
export const DEFAULT_TIERS: LoyaltyTierRule[] = [
  { name: 'Đồng', tier: 'bronze', min_spend: 0, min_points: 0, discount_percent: 0, active: true, sort_order: 1 },
  { name: 'Bạc', tier: 'silver', min_spend: 5_000_000, min_points: 500, discount_percent: 2, active: true, sort_order: 2 },
  { name: 'Vàng', tier: 'gold', min_spend: 20_000_000, min_points: 2000, discount_percent: 5, active: true, sort_order: 3 },
  { name: 'Kim cương', tier: 'platinum', min_spend: 50_000_000, min_points: 5000, discount_percent: 8, active: true, sort_order: 4 },
];
