export interface Profile {
  id: string;
  shop_id: string | null;
  full_name: string | null;
  role: string | null;
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
  created_at?: string;
}

export interface Customer {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  debt: number;
  points?: number;
  gender?: string | null;
  important?: boolean;
  last_activity?: string | null;
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
