import { describe, it, expect } from 'vitest';
import {
  pickPointRule, earnPoints, redeemValue, evaluateTier, nextTier,
  DEFAULT_POINT_RULE, DEFAULT_TIERS, PointConfigRule,
} from './loyalty';

const rule = (p: Partial<PointConfigRule>): PointConfigRule => ({
  name: 'r', tier: 'all', spend_per_point: 10000, redeem_value: 1000, min_order_total: 0, active: true, ...p,
});

describe('loyalty (tích điểm & thăng hạng)', () => {
  it('tích điểm = floor(đơn / mức chi tiêu mỗi điểm)', () => {
    expect(earnPoints(25000, rule({}))).toBe(2);
  });

  it('đơn dưới mức tối thiểu không được tích điểm', () => {
    expect(earnPoints(50000, rule({ min_order_total: 100000 }))).toBe(0);
  });

  it('mức chi tiêu 0 không chia cho 0', () => {
    expect(earnPoints(100000, rule({ spend_per_point: 0 }))).toBe(0);
  });

  it('quy đổi điểm ra tiền theo redeem_value', () => {
    expect(redeemValue(3, rule({ redeem_value: 2000 }))).toBe(6000);
  });

  it('chọn quy tắc đúng theo hạng, fallback về all', () => {
    const rules = [rule({ tier: 'all', spend_per_point: 10000 }), rule({ tier: 'gold', spend_per_point: 5000 })];
    expect(pickPointRule(rules, 'gold').spend_per_point).toBe(5000);
    expect(pickPointRule(rules, 'silver').spend_per_point).toBe(10000);
  });

  it('không có cấu hình thì dùng quy tắc mặc định', () => {
    expect(pickPointRule([], 'gold')).toBe(DEFAULT_POINT_RULE);
  });

  it('thăng hạng chọn hạng cao nhất đạt cả chi tiêu lẫn điểm', () => {
    const t = evaluateTier(DEFAULT_TIERS, 25_000_000, 2500);
    expect(t?.tier).toBe('gold');
  });

  it('chưa đủ điểm thì không lên hạng dù đủ chi tiêu', () => {
    const t = evaluateTier(DEFAULT_TIERS, 25_000_000, 100);
    expect(t?.tier).toBe('bronze');
  });

  it('nextTier trả về hạng kế tiếp', () => {
    const current = evaluateTier(DEFAULT_TIERS, 6_000_000, 600);
    expect(current?.tier).toBe('silver');
    expect(nextTier(DEFAULT_TIERS, current)?.tier).toBe('gold');
  });

  it('khách cao nhất không còn hạng kế tiếp', () => {
    const top = evaluateTier(DEFAULT_TIERS, 100_000_000, 10000);
    expect(nextTier(DEFAULT_TIERS, top)).toBeNull();
  });
});
