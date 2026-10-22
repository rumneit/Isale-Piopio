import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Order, OrderItem } from '../models/models';
import { safeIlikeTerm } from '../utils/postgrest-search';

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
      const term = `%${safeIlikeTerm(search)}%`;
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

  /** Màu badge theo trạng thái (đồng bộ cảm giác màu ISale) */
  static statusColor(status: string | null | undefined): string {
    const map: Record<string, string> = {
      draft: 'medium',
      pending: 'warning',
      processing: 'primary',
      shipping: 'tertiary',
      delivered: 'success',
      completed: 'success',
      quote: 'medium',
      debt: 'danger',
      ship_debt: 'danger',
      consignment: 'secondary',
      cancelled: 'danger',
    };
    return map[status ?? ''] ?? 'medium';
  }

  /** Nhãn hình thức thanh toán từ mã (CASH -> Tiền mặt) */
  static paymentLabel(code: string | null | undefined): string {
    if (!code) return '—';
    return OrdersService.paymentMethods.find((m) => m.value === code)?.label ?? code;
  }

  /** Đổi trạng thái nhiều đơn (ISale: bulk status) */
  async bulkUpdateStatus(ids: string[], status: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId || !ids.length) return;
    const { error } = await this.sb
      .from('orders')
      .update({ status })
      .in('id', ids)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Xóa nhiều đơn (ISale: multi-delete) */
  async bulkRemove(ids: string[]): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId || !ids.length) return;
    const { error } = await this.sb
      .from('orders')
      .delete()
      .in('id', ids)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
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
    items: Array<{ product_id: string | null; name: string; price: number; qty: number }>,
    options: { recordIncome?: boolean; idempotencyKey?: string } = {}
  ): Promise<Order> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');

    const total =
      input.total ??
      items.reduce((s, i) => s + i.price * i.qty, 0) - (input.discount ?? 0);
    const nonce = options.idempotencyKey ?? crypto.randomUUID();
    const { data: order, error } = await this.sb.client.rpc('inv_create_order', {
      p_shop: shopId,
      p_order: { ...input, code: input.code ?? this.newCode(), total },
      p_items: items,
      p_nonce: nonce,
      p_record_income: !!options.recordIncome,
    });
    if (error) {
      if (error.code === '42703' && /channel_id/i.test(error.message)) {
        throw new Error('Cơ sở dữ liệu thiếu cột orders.channel_id. Hãy chạy supabase-migration-v38-sale-order-channel-fix.sql trước khi tạo đơn.');
      }
      if (error.code === 'PGRST202' || /inv_create_order|schema cache/i.test(error.message)) {
        throw new Error('Cơ sở dữ liệu chưa có migration v34. Hãy chạy supabase-migration-v34-release-hardening.sql trước khi tạo đơn.');
      }
      throw error;
    }
    this.logService.log('create', 'order', order.code);
    return order as Order;
  }

  async update(id: string, patch: Partial<Order>): Promise<void> {
    const { error } = await this.sb.from('orders').update(patch).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /**
   * Lưu phần sản phẩm của đơn đã tạo (giá bán / xóa dòng) qua RPC v39.
   * Từ v36, authenticated không còn quyền ghi trực tiếp order_items nên phải
   * đi qua hàm security definer để trigger kho vẫn hoạt động đúng.
   */
  async saveOrderEdit(
    orderId: string,
    items: Array<{ id: string; price: number }>,
    discount: number,
    total: number,
    adjustIncome: boolean
  ): Promise<Order> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb.client.rpc('inv_update_order', {
      p_shop: shopId,
      p_order_id: orderId,
      p_items: items,
      p_discount: Math.max(0, Math.round(Number(discount) || 0)),
      p_total: Math.max(0, Math.round(Number(total) || 0)),
      p_adjust_income: !!adjustIncome,
    });
    if (error) {
      if (error.code === 'PGRST202' || /inv_update_order|schema cache/i.test(error.message)) {
        throw new Error(
          'Cơ sở dữ liệu chưa có hàm cập nhật đơn (migration v39). Hãy chạy file supabase-migration-v39-order-edit.sql trong Supabase SQL Editor rồi thử lại.'
        );
      }
      if (/thuộc về đơn hàng|không thể sửa\/xóa thủ công/i.test(error.message)) {
        throw new Error(
          'Database đang dùng bản migration v39 cũ. Hãy chạy lại file supabase-migration-v39-order-edit.sql (bản mới) trong Supabase SQL Editor rồi thử lại.'
        );
      }
      throw error;
    }
    const order = data as Order;
    this.logService.log('update', 'order', order?.code ?? orderId);
    return order;
  }

  /** Sửa 1 dòng sản phẩm của đơn đã tạo (giá/số lượng/thành tiền) */
  async updateItem(itemId: string, patch: { price?: number; qty?: number; total?: number }): Promise<void> {
    if (!this.sb.isConfigured) return;
    const { error } = await this.sb.from('order_items').update(patch).eq('id', itemId);
    if (error) throw error;
  }

  /** Xóa 1 dòng sản phẩm khỏi đơn (trigger kho tự hoàn tồn) */
  async removeItem(itemId: string): Promise<void> {
    if (!this.sb.isConfigured) return;
    const { error } = await this.sb.from('order_items').delete().eq('id', itemId);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('orders').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
