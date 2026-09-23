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
  created_at?: string;
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
