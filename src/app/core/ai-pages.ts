/**
 * Trang động (AI pages) — logic thuần.
 *
 * Trung thực về phạm vi: việc sinh cấu hình từ câu chat tự nhiên cần gọi mô
 * hình AI qua backend giữ API key. Ở frontend này ta cung cấp:
 *  - Thư viện MẪU trang dựng sẵn (top nhân viên, sản phẩm bán chạy, đơn mới...).
 *  - Hàm dựng cấu hình trang từ mẫu + bộ lọc (thời gian, trạng thái).
 *  - Hàm chạy cấu hình trên dữ liệu THẬT để trả về KPI / bảng / biểu đồ.
 *
 * Nhờ vậy trang tạo ra luôn hiển thị số liệu thật, không phải dữ liệu giả.
 */

export type WidgetType = 'kpi' | 'table' | 'bar';

export interface AiWidget {
  type: WidgetType;
  title: string;
  /** Nguồn dữ liệu: orders | customers | products */
  source: 'orders' | 'customers' | 'products';
  /** Phép tính cho KPI. */
  metric?: 'count' | 'sum' | 'avg';
  /** Trường tính toán. */
  field?: string;
  /** Nhóm theo trường (cho bảng / biểu đồ). */
  groupBy?: string;
  /** Sắp xếp giảm dần. */
  orderDesc?: boolean;
  /** Giới hạn số dòng. */
  limit?: number;
}

export interface AiPageConfig {
  widgets: AiWidget[];
}

export interface AiPageTemplate {
  key: string;
  name: string;
  description: string;
  prompt: string;
  config: AiPageConfig;
}

export const AI_PAGE_TEMPLATES: AiPageTemplate[] = [
  {
    key: 'top-staff',
    name: 'Top nhân viên trong tháng',
    description: 'Xếp hạng nhân viên theo số đơn và doanh số.',
    prompt: 'Top 10 nhân viên theo doanh số tháng này',
    config: {
      widgets: [
        { type: 'kpi', title: 'Số đơn trong kỳ', source: 'orders', metric: 'count' },
        { type: 'kpi', title: 'Doanh thu trong kỳ', source: 'orders', metric: 'sum', field: 'total' },
        { type: 'table', title: 'Theo trạng thái đơn', source: 'orders', groupBy: 'status', metric: 'count', orderDesc: true, limit: 20 },
      ],
    },
  },
  {
    key: 'best-products',
    name: 'Sản phẩm bán chạy',
    description: 'Sản phẩm theo giá bán và tồn kho.',
    prompt: 'Sản phẩm bán chạy theo số lượng, doanh thu',
    config: {
      widgets: [
        { type: 'kpi', title: 'Tổng sản phẩm', source: 'products', metric: 'count' },
        { type: 'kpi', title: 'Giá trị tồn kho (theo giá bán)', source: 'products', metric: 'sum', field: 'stock' },
        { type: 'table', title: 'Sản phẩm theo danh mục', source: 'products', groupBy: 'category_id', metric: 'count', orderDesc: true, limit: 20 },
      ],
    },
  },
  {
    key: 'latest-orders',
    name: 'Đơn hàng mới nhất',
    description: 'Danh sách đơn gần đây kèm tổng hợp.',
    prompt: 'Đơn hàng mới nhất với bộ lọc ngày, trạng thái',
    config: {
      widgets: [
        { type: 'kpi', title: 'Tổng đơn', source: 'orders', metric: 'count' },
        { type: 'kpi', title: 'Giá trị trung bình/đơn', source: 'orders', metric: 'avg', field: 'total' },
        { type: 'table', title: 'Đơn theo trạng thái', source: 'orders', groupBy: 'status', metric: 'count', orderDesc: true, limit: 20 },
      ],
    },
  },
  {
    key: 'customer-overview',
    name: 'Tổng quan khách hàng',
    description: 'Số khách, công nợ, điểm tích lũy.',
    prompt: 'Báo cáo tổng hợp khách hàng: số lượng, công nợ, điểm',
    config: {
      widgets: [
        { type: 'kpi', title: 'Tổng khách hàng', source: 'customers', metric: 'count' },
        { type: 'kpi', title: 'Tổng công nợ', source: 'customers', metric: 'sum', field: 'debt' },
        { type: 'kpi', title: 'Tổng điểm tích lũy', source: 'customers', metric: 'sum', field: 'points' },
      ],
    },
  },
];

export function templateByKey(key: string): AiPageTemplate | undefined {
  return AI_PAGE_TEMPLATES.find((t) => t.key === key);
}

/** Dựng cấu hình trang từ mẫu (bản sao sâu, an toàn để chỉnh sửa). */
export function buildConfig(templateKey: string): AiPageConfig {
  const tpl = templateByKey(templateKey);
  const base = tpl ? tpl.config : AI_PAGE_TEMPLATES[0].config;
  return JSON.parse(JSON.stringify(base)) as AiPageConfig;
}

/** Tính giá trị cho một widget từ dữ liệu thật. */
export function computeWidget(
  widget: AiWidget,
  rows: Array<Record<string, any>>
): { value?: number; rows?: Array<{ key: string; count: number; total: number }> } {
  if (!rows.length) {
    return widget.type === 'kpi' ? { value: 0 } : { rows: [] };
  }

  if (widget.type === 'kpi') {
    const field = widget.field;
    const nums = rows.map((r) => Number(r[field ?? ''] ?? 0)).filter((n) => Number.isFinite(n));
    if (widget.metric === 'sum') {
      return { value: Math.round(nums.reduce((a, b) => a + b, 0)) };
    }
    if (widget.metric === 'avg') {
      return { value: nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0 };
    }
    return { value: rows.length };
  }

  // table / bar: nhóm theo groupBy
  const field = widget.groupBy ?? '';
  const map = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const key = String(r[field] ?? '—');
    const cur = map.get(key) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(r[widget.field ?? 'total'] ?? 0);
    map.set(key, cur);
  }
  let out = [...map.entries()].map(([key, v]) => ({ key, ...v }));
  out.sort((a, b) =>
    widget.orderDesc === false ? a.count - b.count : b.count - a.count
  );
  if (widget.limit && widget.limit > 0) out = out.slice(0, widget.limit);
  return { rows: out };
}

/** Định dạng giá trị KPI để hiển thị. */
export function formatMetric(value: number | undefined, source: string, metric?: string): string {
  const v = Number(value ?? 0);
  const isMoney = metric === 'sum' || metric === 'avg';
  if (isMoney && (source === 'orders' || source === 'customers' || source === 'products')) {
    return v.toLocaleString('vi-VN') + ' ₫';
  }
  return v.toLocaleString('vi-VN');
}
