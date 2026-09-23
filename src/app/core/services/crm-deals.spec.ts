import { describe, it, expect } from 'vitest';
import { CrmDealsService, CrmDeal } from './crm-deals.service';

function deal(partial: Partial<CrmDeal>): CrmDeal {
  return {
    id: 'x',
    shop_id: 's',
    title: 't',
    customer_id: null,
    lead_id: null,
    amount: 0,
    stage: 'new',
    probability: 0,
    expected_close_date: null,
    owner_name: null,
    note: null,
    ...partial,
  };
}

describe('CrmDealsService (tính toán thuần)', () => {
  it('dự báo có trọng số = Σ giá trị × xác suất', () => {
    const deals = [
      deal({ amount: 1_000_000, probability: 50 }),
      deal({ amount: 2_000_000, probability: 25 }),
    ];
    expect(CrmDealsService.weightedForecast(deals)).toBe(1_000_000);
  });

  it('bỏ qua cơ hội đã thất bại khi dự báo', () => {
    const deals = [
      deal({ amount: 1_000_000, probability: 100, stage: 'won' }),
      deal({ amount: 5_000_000, probability: 100, stage: 'lost' }),
    ];
    expect(CrmDealsService.weightedForecast(deals)).toBe(1_000_000);
  });

  it('tổng hợp pipeline đủ 5 giai đoạn kể cả khi rỗng', () => {
    const pipeline = CrmDealsService.pipelineByStage([deal({ amount: 500, stage: 'quoted' })]);
    expect(pipeline).toHaveLength(5);
    const quoted = pipeline.find((p) => p.stage === 'quoted')!;
    expect(quoted.count).toBe(1);
    expect(quoted.amount).toBe(500);
    expect(pipeline.find((p) => p.stage === 'won')!.count).toBe(0);
  });

  it('dự báo bằng 0 khi không có cơ hội', () => {
    expect(CrmDealsService.weightedForecast([])).toBe(0);
  });
});
