import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Order, OrderItem } from '../models/models';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  newCode(): string {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `DH-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async list(search = '', status = 'all', statusField: 'all' | string = 'all'): Promise<Order[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('orders')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`code.ilike.${term},customer_name.ilike.${term}`);
    }
    if (status === 'paid') query = query.eq('paid', true);
    if (status === 'unpaid') query = query.eq('paid', false);
    if (statusField !== 'all') query = query.eq('status', statusField);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Order[];
  }

  /** Đơn hàng của một khách hàng (ISale contact-detail) */
  async listByCustomer(customerId: string, limit = 10): Promise<Order[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('orders')
      .select('*')
      .eq('shop_id', this.shopId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as Order[];
  }

  /** Cột payment_method có sau migration v17 (additive) */
  async detectPaymentMethod(): Promise<boolean> {
    if (!this.sb.isConfigured || !this.shopId) return false;
    const { error } = await this.sb.from('orders').select('id, payment_method').limit(1);
    return !error;
  }

  /** Cột mới của migration v22 (additive): dò từng cột, trả về tập hợp cột tồn tại */
  async detectOrderExtras(): Promise<Set<string>> {
    const cols = [
      'ship_fee',
      'ship_fee_by_customer',
      'customer_phone',
      'customer_address',
      'shipping_code',
      'shipping_partner',
      'shipper_name',
      'shipper_phone',
      'shipping_address',
    ];
    const found = new Set<string>();
    if (!this.sb.isConfigured || !this.shopId) return found;
    // Dò gộp trước (1 request): nếu OK thì có hết
    const { error } = await this.sb.from('orders').select('id, ' + cols.join(', ')).limit(1);
    if (!error) {
      cols.forEach((c) => found.add(c));
      return found;
    }
    // Lỗi → dò từng cột (migration cũ hơn/chưa chạy đủ)
    await Promise.all(
      cols.map(async (c) => {
        const { error: e1 } = await this.sb.from('orders').select('id, ' + c).limit(1);
        if (!e1) found.add(c);
      })
    );
    return found;
  }

  static readonly orderStatuses = [
    { value: 'draft', label: 'Nháp' },
    { value: 'pending', label: 'Chờ xử lý' },
    { value: 'processing', label: 'Đang xử lý' },
    { value: 'shipping', label: 'Đang giao' },
    { value: 'delivered', label: 'Đã giao' },
    { value: 'completed', label: 'Hoàn tất' },
    { value: 'quote', label: 'Báo giá' },
    { value: 'debt', label: 'Công nợ' },
    { value: 'ship_debt', label: 'Ship, có nợ' },
    { value: 'consignment', label: 'Ký gửi' },
    { value: 'cancelled', label: 'Đã hủy' },
  ];

  /** Phương thức thanh toán — đồng bộ ISale (value code máy đọc được) */
  static readonly paymentMethods = [
    { value: 'CASH', label: 'Tiền mặt' },
    { value: 'BANK-TRANSFER', label: 'Chuyển khoản' },
    { value: 'CREDIT-CARD', label: 'Thẻ tín dụng' },
    { value: 'APPLE-PAY', label: 'Apple Pay' },
    { value: 'BANK-CARD', label: 'Thẻ ngân hàng' },
    { value: 'DEBIT-CARD', label: 'Thẻ ghi nợ' },
    { value: 'MOBILE-MONEY', label: 'Mobile Money' },
    { value: 'CHEQUE', label: 'Séc' },
    { value: 'BITCOIN', label: 'Bitcoin' },
    { value: 'OTHER', label: 'Khác' },
  ];

  static statusLabel(status: string | null | undefined): string {
    return OrdersService.orderStatuses.find((s) => s.value === status)?.label ?? (status ?? '—');
  }

  async getWithItems(id: string): Promise<{ order: Order | null; items: OrderItem[] }> {
    if (!this.sb.isConfigured || !this.shopId) return { order: null, items: [] };
    const [{ data: order, error }, { data: items, error: itemsError }] = await Promise.all([
      this.sb.from('orders').select('*').eq('id', id).eq('shop_id', this.shopId).maybeSingle(),
      this.sb.from('order_items').select('*').eq('order_id', id).order('id'),
    ]);
    if (error) throw error;
    if (itemsError) throw itemsError;
    return { order: (order as Order) ?? null, items: (items ?? []) as OrderItem[] };
  }

  async create(
    input: Partial<Order>,
    items: Array<{ product_id: string | null; name: string; price: number; qty: number }>
  ): Promise<Order> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');

    const total =
      input.total ??
      items.reduce((s, i) => s + i.price * i.qty, 0) - (input.discount ?? 0);
    const { data: order, error } = await this.sb
      .from('orders')
      .insert({ ...input, shop_id: shopId, code: input.code ?? this.newCode(), total })
      .select()
      .single();
    if (error) throw error;

    if (items.length) {
      const rows = items.map((i) => ({
        order_id: order.id,
        product_id: i.product_id,
        name: i.name,
        price: i.price,
        qty: i.qty,
        total: i.price * i.qty,
      }));
      const { error: itemsError } = await this.sb.from('order_items').insert(rows);
      if (itemsError) throw itemsError;
    }
    this.logService.log('create', 'order', order.code);
    return order as Order;
  }

  async update(id: string, patch: Partial<Order>): Promise<void> {
    const { error } = await this.sb.from('orders').update(patch).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('orders').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
