export interface Profile {
  id: string;
  shop_id: string | null;
  full_name: string | null;
  role: string | null;
  permissions?: Record<string, boolean>;
  created_at?: string;
}

export interface Shop {
  id: string;
  name: string;
  owner_id: string | null;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  logo_url?: string | null;
  bank_name?: string | null;
  bank_owner?: string | null;
  bank_account?: string | null;
  /** Migration v22 — mã ngân hàng VietQR (vd: 'mb', 'vietcombank') */
  bank_code?: string | null;
  created_at?: string;
}

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  price: number;
  cost: number | null;
  stock: number;
  category_id: string | null;
  active: boolean;
  serial_managed?: boolean;
  /** Migration v16 (additive) */
  expiry_date?: string | null;
  barcode?: string | null;
  /** Migration v18 (additive) — ảnh đại diện (URL) */
  image?: string | null;
  /** Migration v19 (additive) — các tab mở rộng kiểu ISale */
  units?: ProductUnit[] | null;
  images?: string[] | null;
  price_wholesale?: number | null;
  price_ctv?: number | null;
  discounts?: ProductDiscount[] | null;
  options?: ProductOption[] | null;
  tags?: string[] | null;
  /** Migration v20 (additive) — đồng bộ UI ISale live 09/2026 */
  /** Cờ hiển thị/trạng thái trên chi tiết sản phẩm */
  dich_vu?: boolean;
  ngoai_te?: boolean;
  gia_nhap_nt?: number | null;
  hien_tren_web?: boolean;
  ban_chay?: boolean;
  moi?: boolean;
  hien_gia_web?: boolean;
  khuyen_mai?: boolean;
  mo_ta?: string | null;
  /** Danh sách giá theo khách/CTV: [{ type, name, price }] */
  price_settings?: PriceSetting[] | null;
  /** Nhiều mã vạch: string[] */
  barcodes?: string[] | null;
  /** Trường tùy chỉnh: [{ key, value }] */
  custom_fields?: CustomField[] | null;
  /** Migration v21 (additive) — form Sửa sản phẩm kiểu ISale */
  la_combo?: boolean;
  tu_tru_nvl?: boolean;
  /** Mã tiền tệ khi bật Ngoại tệ (VD: USD, EUR) */
  ngoai_te_tien_te?: string | null;
  created_at?: string;
}

/** Thiết lập giá theo khách/CTV (ISale: tab "Giá khách & CTV") — migration v20 */
export interface PriceSetting {
  /** 'Khách sỉ' | 'CTV' */
  type: string;
  name?: string | null;
  price: number;
}

/** Trường tùy chỉnh tự định nghĩa (ISale: chip "Trường tùy chỉnh") — migration v20 */
export interface CustomField {
  key: string;
  value?: string | null;
}

/** Đơn vị quy đổi (ISale: "Đơn vị khác") — migration v19 */
export interface ProductUnit {
  name: string;
  /** 1 đơn vị này = conversion sản phẩm gốc */
  conversion: number;
  price?: number | null;
  cost?: number | null;
  /** Đơn vị bán mặc định (checkbox "Mặc định" ở Sửa sản phẩm) — migration v21 */
  is_default?: boolean;
}

/** Bậc chiết khấu (ISale: "Chiết khấu") — migration v19, bổ sung tên khách ở v20 */
export interface ProductDiscount {
  min_qty: number;
  /** phần trăm giảm (0–100) */
  percent: number;
  /** tên khách hàng áp dụng (tùy chọn) — migration v20 */
  name?: string | null;
}

/** Tùy chọn sản phẩm (ISale: "Options") — migration v19 */
export interface ProductOption {
  name: string;
  values: string[];
}

export interface Customer {
  id: string;
  shop_id: string;
  name: string;
  code?: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  debt: number;
  points?: number;
  gender?: string | null;
  important?: boolean;
  last_activity?: string | null;
  route_id?: string | null;
  dob?: string | null;
  avatar_url?: string | null;
  customer_group_id?: string | null;
  customer_group_name?: string | null;
  status?: 'lead' | 'active' | 'inactive';
  total_spending?: number;
  tier?: 'bronze' | 'silver' | 'gold';
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  created_by?: string | null;
  tags?: string[];
  updated_at?: string;
  deleted_at?: string | null;
  created_at?: string;
}

export interface CustomerGroup {
  id: string;
  shop_id: string;
  name: string;
  color: string;
  description?: string | null;
  created_at?: string;
}

export interface CustomerInteraction {
  id: string;
  shop_id: string;
  customer_id: string;
  type: 'note' | 'call' | 'email' | 'system' | 'visit';
  content: string;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface CustomerDebtEntry {
  id: string;
  customer_id: string;
  type: 'charge' | 'payment' | 'adjustment';
  amount: number;
  balance_after: number;
  note?: string | null;
  created_at: string;
}

export interface CustomerAttachment {
  id: string;
  customer_id: string;
  file_name: string;
  file_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
}

export interface Order {
  id: string;
  shop_id: string;
  code: string;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  total: number;
  discount: number;
  paid: boolean;
  note: string | null;
  channel_id?: string | null;
  /** Migration v17 (additive) */
  payment_method?: string | null;
  /** Migration v22 (additive) — thanh toán & vận chuyển đồng bộ ISale */
  ship_fee?: number | null;
  ship_fee_by_customer?: boolean | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  shipping_code?: string | null;
  shipping_partner?: string | null;
  shipper_name?: string | null;
  shipper_phone?: string | null;
  shipping_address?: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  price: number;
  qty: number;
  total: number;
}

/** Đơn vận chuyển (migration v25 — đồng bộ ISale /shipping, 11 trạng thái chuẩn 3PL) */
export type ShipmentStatus =
  | 'draft'
  | 'submitted'
  | 'picking'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returning'
  | 'returned'
  | 'cancelled'
  | 'exception';

export interface Shipment {
  id: string;
  shop_id: string;
  order_id: string | null;
  order_code: string | null;
  partner_id: string | null;
  partner_name: string | null;
  /** manual | ghn | ghtk | viettelpost | other */
  provider: string;
  tracking_code: string;
  status: ShipmentStatus;
  shipping_fee: number;
  cod_amount: number;
  /** gram — đúng ISale */
  weight_g: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  from_address: string | null;
  to_address: string | null;
  /** PDF hãng cấp; trống = in template A6 tự render */
  label_url: string | null;
  expected_delivered_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  /** lost | damaged | wrong_address | other */
  fail_reason: string | null;
  note: string | null;
  external_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Một sự kiện trên timeline vận đơn (append-only) */
export interface ShipmentTrackingLog {
  id: string;
  shipment_id: string;
  shop_id: string;
  status: string | null;
  description: string | null;
  location: string | null;
  event_time: string;
  created_at?: string;
}

export interface MoneyAccount {
  id: string;
  shop_id: string;
  name: string;
  type: string;
  balance: number;
  created_at?: string;
}

export interface Transaction {
  id: string;
  shop_id: string;
  type: 'income' | 'expense';
  category: string | null;
  amount: number;
  account_id: string | null;
  note: string | null;
  occurred_at: string;
  created_at?: string;
  /** Liên kết nguồn gốc (P1): khóa sửa/xóa tay khi khác null */
  contact_id?: string | null;
  order_id?: string | null;
  debt_id?: string | null;
  /** CASH | BANK | CARD | E-WALLET | INTERNAL | OTHER */
  payment_type?: string | null;
  /** Ảnh biên lai (URL Storage) */
  image_urls?: string[] | null;
  /** manual | order | debt | transfer | recurring */
  source?: string | null;
}

export interface TradeCategory {
  id: string;
  shop_id: string;
  title: string;
  type: 'income' | 'expense';
  order_index: number;
  created_at?: string;
}

export interface RecurringTransaction {
  id: string;
  shop_id: string;
  title: string;
  type: 'income' | 'expense';
  amount: number;
  category: string | null;
  account_id: string | null;
  payment_type: string | null;
  day_of_month: number;
  active: boolean;
  last_run_month: string | null;
  created_at?: string;
}

export interface HomeStats {
  revenueToday: number;
  revenueMonth: number;
  expenseMonth: number;
  ordersToday: number;
  debtTotal: number;
  productCount: number;
  customerCount: number;
}

/** Phiếu kiểm kê kho (cycle count). */
export interface StockCountItem {
  product_id: string | null;
  name: string;
  sku: string | null;
  system_qty: number;
  counted_qty: number;
  diff: number;
}

export interface StockCount {
  id: string;
  shop_id: string;
  code: string;
  status: 'draft' | 'completed' | 'cancelled';
  items: StockCountItem[];
  total_diff: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============ Báo cáo & Biểu đồ v26 (server-side RPC) ============

/** Tổng hợp 1 cửa sổ thời gian (report_kpis → current/prev/yoy). */
export interface ReportWindowTotals {
  from: string;
  to: string;
  revenue: number;
  orders: number;
  discount: number;
  paid_total: number;
  unpaid_orders: number;
  cogs: number;
  profit: number;
  income: number;
  expense: number;
  returns_total: number;
  returns_count: number;
}

export interface ReportKpis {
  current: ReportWindowTotals;
  prev: ReportWindowTotals;
  yoy: ReportWindowTotals;
}

/** 1 bucket của biểu đồ cột (report_timeseries). */
export interface ReportPoint {
  bucket: string;
  revenue: number;
  orders: number;
  cogs: number;
  profit: number;
  income: number;
  expense: number;
}

/** Hóa đơn drill-down trong 1 ngày (report_orders_day). */
export interface ReportOrderRow {
  id: string;
  code: string;
  customer_name: string | null;
  status: string | null;
  paid: boolean;
  total: number;
  discount: number;
  created_at: string;
  total_count: number;
}

export interface ReportTopProductRow {
  product_id: string | null;
  name: string | null;
  unit: string | null;
  qty: number;
  revenue: number;
  cogs: number;
  profit: number;
  orders: number;
}

export interface ReportTopCustomerRow {
  customer_id: string | null;
  name: string | null;
  orders: number;
  revenue: number;
  last_order_at: string | null;
}

export interface ReportCohortRow {
  cohort_month: string;
  month_n: number;
  buyers: number;
  revenue: number;
}

export interface ReportInventoryRow {
  product_id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_now: number;
  sold: number;
  returned: number;
  received: number;
  transferred: number;
  est_start: number;
}

export interface ReportExportLog {
  id: string;
  kind: string;
  params: Record<string, unknown>;
  rows: number;
  user_id: string;
  created_at: string;
}
