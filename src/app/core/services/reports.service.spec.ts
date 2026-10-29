import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { CsvExportService } from './csv-export.service';

describe('ReportsService authoritative KPI source', () => {
  let service: ReportsService;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn(async (name: string) => {
      if (name === 'report_kpis') return { data: { current: { revenue: '1000', orders: 2, income: 800, expense: 100, profit: 600 } }, error: null };
      if (name === 'report_timeseries') return { data: [{ bucket: '2026-10-29', revenue: 1000, income: 800, expense: 100 }], error: null };
      if (name === 'report_top_products') return { data: [{ name: 'Hộp', qty: 2, revenue: 1000 }], error: null };
      return { data: null, error: null };
    });
    TestBed.configureTestingModule({ providers: [
      ReportsService,
      { provide: SupabaseService, useValue: { isConfigured: true, client: { rpc }, from: vi.fn() } },
      { provide: AuthService, useValue: { shop: () => ({ id: 'shop-1' }) } },
      { provide: CsvExportService, useValue: {} },
    ] });
    service = TestBed.inject(ReportsService);
  });

  it('uses server-side KPIs so cancelled/draft orders cannot inflate totals', async () => {
    await expect(service.getReport('month')).resolves.toEqual({
      revenue: 1000, ordersCount: 2, income: 800, expense: 100, profit: 600,
      topProducts: [{ name: 'Hộp', qty: 2, total: 1000 }],
      daily: [{ date: '2026-10-29', revenue: 1000, income: 800, expense: 100 }],
    });
    expect(rpc).toHaveBeenCalledWith('report_kpis', expect.objectContaining({ p_shop: 'shop-1' }));
  });

  it('keeps range labels and local dates deterministic', () => {
    expect(service.rangeLabel('today')).toBe('Hôm nay');
    expect(service.rangeLabel('week')).toBe('Tuần này');
    expect(service.rangeLabel('month')).toBe('Tháng này');
    expect(service.rangeLabel('year')).toBe('Năm nay');
    expect(service.dateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(service.rangeStart('today')).toBeInstanceOf(Date);
    expect(service.rangeStart('week')).toBeInstanceOf(Date);
    expect(service.rangeStart('year').getMonth()).toBe(0);
  });
});
