import { describe, it, expect } from 'vitest';
import {
  AI_PAGE_TEMPLATES, buildConfig, computeWidget, formatMetric, AiWidget,
} from './ai-pages';

const rows = [
  { status: 'completed', total: 100, debt: 0, points: 10, category_id: 'a' },
  { status: 'completed', total: 300, debt: 0, points: 20, category_id: 'a' },
  { status: 'pending', total: 50, debt: 0, points: 0, category_id: 'b' },
];

describe('ai-pages (trang động)', () => {
  it('có thư viện mẫu trang dựng sẵn', () => {
    expect(AI_PAGE_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(AI_PAGE_TEMPLATES.every((t) => t.config.widgets.length > 0)).toBe(true);
  });

  it('buildConfig trả bản sao độc lập (không sửa mẫu gốc)', () => {
    const a = buildConfig('top-staff');
    a.widgets[0].title = 'ĐÃ SỬA';
    expect(buildConfig('top-staff').widgets[0].title).not.toBe('ĐÃ SỬA');
  });

  it('KPI count đếm số dòng', () => {
    const w: AiWidget = { type: 'kpi', title: 't', source: 'orders', metric: 'count' };
    expect(computeWidget(w, rows).value).toBe(3);
  });

  it('KPI sum cộng đúng trường', () => {
    const w: AiWidget = { type: 'kpi', title: 't', source: 'orders', metric: 'sum', field: 'total' };
    expect(computeWidget(w, rows).value).toBe(450);
  });

  it('KPI avg tính trung bình', () => {
    const w: AiWidget = { type: 'kpi', title: 't', source: 'orders', metric: 'avg', field: 'total' };
    expect(computeWidget(w, rows).value).toBe(150);
  });

  it('bảng nhóm theo trường và sắp xếp giảm dần', () => {
    const w: AiWidget = { type: 'table', title: 't', source: 'orders', groupBy: 'status', metric: 'count', orderDesc: true, limit: 10 };
    const r = computeWidget(w, rows).rows!;
    expect(r[0].key).toBe('completed');
    expect(r[0].count).toBe(2);
  });

  it('giới hạn số dòng hoạt động', () => {
    const w: AiWidget = { type: 'table', title: 't', source: 'orders', groupBy: 'status', metric: 'count', limit: 1 };
    expect(computeWidget(w, rows).rows!).toHaveLength(1);
  });

  it('dữ liệu rỗng trả 0 / mảng rỗng (không lỗi)', () => {
    expect(computeWidget({ type: 'kpi', title: 't', source: 'orders', metric: 'count' }, []).value).toBe(0);
    expect(computeWidget({ type: 'table', title: 't', source: 'orders', groupBy: 'status', metric: 'count' }, []).rows).toEqual([]);
  });

  it('formatMetric hiển thị tiền Việt Nam', () => {
    expect(formatMetric(1000000, 'orders', 'sum')).toContain('₫');
    expect(formatMetric(5, 'orders', 'count')).toBe('5');
  });
});
