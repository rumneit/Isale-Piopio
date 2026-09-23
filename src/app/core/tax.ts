/**
 * Kê khai thuế — logic thuần để dễ kiểm thử.
 *
 * Hỗ trợ hai phương pháp tính thuế GTGT phổ biến:
 *  - Trực tiếp (direct): GTGT = doanh thu × tỉ lệ % theo ngành.
 *  - Khấu trừ (deduction): GTGT = thuế đầu ra − thuế đầu vào.
 *
 * Số liệu lấy từ đơn hàng đã hoàn tất trong kỳ. Đây là phần TÍNH TOÁN + XUẤT
 * tờ khai; việc nộp lên cơ quan thuế qua CyberLotus cần tài khoản đối tác.
 */

export type VatMethod = 'direct' | 'deduction';

/** Tỉ lệ GTGT theo phương pháp trực tiếp (Thông tư 40/2021). */
export const DIRECT_VAT_RATES = [
  { key: 'distribution', label: 'Phân phối, cung cấp hàng hóa', rate: 1 },
  { key: 'service', label: 'Dịch vụ, xây dựng không bao thầu NVL', rate: 5 },
  { key: 'manufacture', label: 'Sản xuất, vận tải, dịch vụ có gắn hàng hóa', rate: 3 },
  { key: 'other', label: 'Hoạt động kinh doanh khác', rate: 2 },
];

export interface TaxSummaryInput {
  revenue: number;
  method: VatMethod;
  /** Phương pháp trực tiếp: tỉ lệ % theo ngành. */
  directRate?: number;
  /** Phương pháp khấu trừ: thuế GTGT đầu vào đã trả. */
  inputVat?: number;
}

export interface TaxSummary {
  revenue: number;
  method: VatMethod;
  outputVat: number;
  inputVat: number;
  payableVat: number;
  rate: number;
}

/** Tính tổng hợp thuế GTGT cho một kỳ. */
export function computeTax(input: TaxSummaryInput): TaxSummary {
  const revenue = Math.max(0, Number(input.revenue) || 0);
  if (input.method === 'deduction') {
    // Giả định doanh thu đã bao gồm thuế; tách thuế đầu ra theo thuế suất 10%.
    const net = revenue / 1.1;
    const outputVat = Math.round(revenue - net);
    const inputVat = Math.max(0, Number(input.inputVat) || 0);
    return {
      revenue,
      method: 'deduction',
      outputVat,
      inputVat,
      payableVat: Math.max(0, outputVat - inputVat),
      rate: 10,
    };
  }
  const rate = Math.max(0, Number(input.directRate) || 0);
  const payableVat = Math.round(revenue * (rate / 100));
  return {
    revenue,
    method: 'direct',
    outputVat: payableVat,
    inputVat: 0,
    payableVat,
    rate,
  };
}

/** Kỳ kê khai dạng 'YYYY-MM'. */
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? '');
  if (!m) return period ?? '';
  return `Tháng ${m[2]}/${m[1]}`;
}

/** Khoảng thời gian ISO [đầu kỳ, đầu kỳ kế tiếp) để lọc đơn hàng. */
export function periodRange(period: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(period ?? '');
  const now = new Date();
  const year = m ? Number(m[1]) : now.getFullYear();
  const month = m ? Number(m[2]) : now.getMonth() + 1;
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Danh sách kỳ gần đây (mới nhất trước). */
export function recentPeriods(count = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

/** Sinh bảng tờ khai HTKK 01/GTGT dạng CSV. */
export function htkkRows(summary: TaxSummary): (string | number)[][] {
  return [
    ['Chỉ tiêu', 'Mã', 'Giá trị'],
    ['Tổng doanh thu hàng hóa, dịch vụ bán ra', '[21]', summary.revenue],
    ['Thuế GTGT đầu ra', '[22]', summary.outputVat],
    ['Thuế GTGT đầu vào được khấu trừ', '[23]', summary.inputVat],
    ['Thuế GTGT phải nộp trong kỳ', '[40]', summary.payableVat],
  ];
}
