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
  created_at?: string;
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
