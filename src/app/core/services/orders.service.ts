import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Order, OrderItem } from '../models/models';
import { safeIlikeTerm } from '../utils/postgrest-search';
import { newDocumentCode } from '../utils/document-code';

/**
 * Một dòng sản phẩm gửi lên RPC tạo/sửa đơn.
 *
 * `price`/`qty` luôn là đơn vị gốc để tồn kho và báo cáo không bị lẫn đơn vị.
 * Các trường `unit_*` chỉ là metadata hiển thị (đơn vị khách đã chọn).
 */
export interface OrderLineInput {
  id?: string;
  product_id: string | null;
  name: string;
  price: number;
  qty: number;
  unit?: string | null;
  unit_qty?: number | null;
  unit_conversion?: number | null;
  unit_price?: number | null;
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  newCode(): string {
    return newDocumentCode('DH');
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

  private static isMissingLifecycleRpc(error: { code?: string; message?: string } | null): boolean {
    const msg = String(error?.message ?? '');
    return (
      error?.code === 'PGRST202' ||
      /inv_set_order_status|inv_set_order_paid|inv_delete_order|inv_delete_orders|Could not find the function|schema cache/i.test(msg)
    );
  }

  private static lifecycleMigrationError(action: string): Error {
    return new Error(
      `Không thể ${action}: cơ sở dữ liệu chưa có RPC quản lý đơn an toàn. ` +
        'Hãy chạy đầy đủ migration v43-v46 rồi thử lại.'
    );
  }

  /**
   * Đổi trạng thái đơn qua RPC v43: server đổi trạng thái trong cùng transaction
   * với bút toán kho/công nợ và bảo đảm đơn "đã thanh toán" luôn có khoản thu.
   * Fail-closed nếu DB chưa chạy migration: UPDATE trực tiếp có thể làm lệch
   * tiền, tồn kho và công nợ.
   */
  async setStatus(id: string, status: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    const { error } = await this.sb.client.rpc('inv_set_order_status', {
      p_shop: this.shopId,
      p_order_id: id,
      p_status: status,
    });
    if (!error) return;
    if (OrdersService.isMissingLifecycleRpc(error)) {
      throw OrdersService.lifecycleMigrationError('đổi trạng thái đơn');
    }
    throw error;
  }

  /**
   * Đặt cờ đã thanh toán qua RPC v43. Server ghi/đảo khoản thu tương ứng để
   * sổ quỹ và công nợ không lệch; không fallback sang UPDATE trực tiếp.
   */
  async setPaid(id: string, paid: boolean): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    const { error } = await this.sb.client.rpc('inv_set_order_paid', {
      p_shop: this.shopId,
      p_order_id: id,
      p_paid: paid,
    });
    if (!error) return;
    if (OrdersService.isMissingLifecycleRpc(error)) {
      throw OrdersService.lifecycleMigrationError('đổi trạng thái thanh toán');
    }
    throw error;
  }

  /** Đổi hình thức thanh toán qua RPC v43; fail-closed khi chưa migrate. */
  async setPaymentMethod(id: string, method: string | null): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    const { error } = await this.sb.client.rpc('inv_set_order_payment', {
      p_shop: this.shopId,
      p_order_id: id,
      p_method: method,
    });
    if (!error) return;
    if (OrdersService.isMissingLifecycleRpc(error)) {
      throw OrdersService.lifecycleMigrationError('đổi hình thức thanh toán');
    }
    throw error;
  }

  /** Đổi trạng thái nhiều đơn (ISale: bulk status) — từng đơn qua RPC v43. */
  async bulkUpdateStatus(ids: string[], status: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId || !ids.length) return;
    for (const id of ids) await this.setStatus(id, status);
  }

  /** Xóa nhiều đơn (ISale: multi-delete) — RPC v43 kiểm tra sổ sách trước khi xóa. */
  async bulkRemove(ids: string[]): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId || !ids.length) return;
    // Xóa từng đơn để có thể đảo khoản thu tự động của các đơn nháp/cũ.
    // RPC bulk cũ dừng cả lô ngay ở đơn đầu tiên từng ghi nhận thanh toán.
    for (const id of ids) await this.remove(id);
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
    items: OrderLineInput[],
    options: { recordIncome?: boolean; idempotencyKey?: string } = {}
  ): Promise<Order> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');

    const merchandise = items.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = input.discount_percent != null
      ? Math.round((merchandise * Number(input.discount_percent)) / 100)
      : (input.discount ?? 0);
    const tax = input.tax_percent != null
      ? Math.round((merchandise * Number(input.tax_percent)) / 100)
      : 0;
    const ship = input.ship_fee_by_customer === false ? 0 : (input.ship_fee ?? 0);
    const total = input.total ?? merchandise - discount + tax + ship;
    const nonce = options.idempotencyKey ?? crypto.randomUUID();
    const { data: order, error } = await this.sb.client.rpc('inv_create_order_v48', {
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
      if (error.code === 'PGRST202' || /inv_create_order_v48|schema cache/i.test(error.message)) {
        throw new Error('Cơ sở dữ liệu chưa có migration v48 để lưu đơn vị bán nguyên tử. Hãy chạy supabase-migration-v48-atomic-order-units.sql.');
      }
      throw error;
    }
    const created = order as Order;
    this.logService.log('create', 'order', created.code);
    return created;
  }

  /**
   * Sửa TOÀN BỘ đơn đã tạo từ màn hình Bán hàng (migration v40):
   * sản phẩm/số lượng/giá, khách hàng, chiết khấu, VAT, ship, trạng thái,
   * thanh toán, ghi chú, vận chuyển. Hàm SQL tự đồng bộ tồn kho và khoản thu.
   */
  async updateFullOrder(
    orderId: string,
    order: {
      code: string;
      customer_id: string | null;
      customer_name: string;
      status: string;
      payment_method?: string | null;
      account_id?: string | null;
      discount_percent: number;
      tax_percent: number;
      ship_fee: number;
      ship_fee_by_customer: boolean;
      note: string | null;
      customer_phone?: string | null;
      customer_address?: string | null;
      shipping_code?: string | null;
      shipping_partner?: string | null;
      shipper_name?: string | null;
      shipper_phone?: string | null;
      shipping_address?: string | null;
      created_at?: string | null;
    },
    items: OrderLineInput[]
  ): Promise<Order> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb.client.rpc('inv_update_order_full_v48', {
      p_shop: shopId,
      p_order_id: orderId,
      p_order: order,
      p_items: items,
      p_adjust_income: true,
    });
    if (error) {
      if (error.code === 'PGRST202' || /inv_update_order_full_v48|schema cache/i.test(error.message)) {
        throw new Error(
          'Cơ sở dữ liệu chưa có hàm sửa đơn nguyên tử (migration v48). Hãy chạy file supabase-migration-v48-atomic-order-units.sql trong Supabase SQL Editor.'
        );
      }
      if (error.code === '42883' || /_inv_lock_products|_inv_stock_status|_inv_order_item/i.test(error.message)) {
        throw new Error(
          'Cơ sở dữ liệu thiếu hàm nền tảng tồn kho. Hãy chạy supabase-migration-v27.sql (và v36) rồi chạy lại supabase-migration-v40-sale-order-edit.sql.'
        );
      }
      if (/thuộc về đơn hàng|không thể sửa\/xóa thủ công/i.test(error.message)) {
        throw new Error(
          'Database đang dùng bản transactions_guard cũ. Hãy chạy lại file supabase-migration-v40-sale-order-edit.sql (bản mới) trong Supabase SQL Editor rồi thử lại.'
        );
      }
      throw error;
    }
    const updated = data as Order;
    // v41: lưu ví nhận tiền để các lần thu sau và báo cáo sổ tiền dùng đúng.
    // Bỏ qua khi migration chưa chạy để không chặn việc sửa đơn.
    if (order.account_id !== undefined) {
      // Dùng RPC security-definer để nhân viên bán hàng cũng đổi được ví;
      // fallback UPDATE trực tiếp cho DB chưa chạy v41.
      const rpc = await this.sb.client.rpc('inv_set_order_account', {
        p_shop: shopId,
        p_order_id: orderId,
        p_account: order.account_id,
      });
      if (rpc.error && !/inv_set_order_account|schema cache|function/i.test(rpc.error.message)) {
        // Không chặn việc sửa đơn nếu chỉ lỗi lưu ví.
        console.warn('Không lưu được ví nhận tiền:', rpc.error.message);
      }
    }
    this.logService.log('update', 'order', updated?.code ?? orderId);
    return updated;
  }

  async update(id: string, patch: Partial<Order>): Promise<void> {
    const { error } = await this.sb.from('orders').update(patch).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    const { error } = await this.sb.client.rpc('inv_delete_order', {
      p_shop: this.shopId,
      p_order_id: id,
    });
    if (!error) return;
    // Xóa phải là một transaction duy nhất ở backend. Chuỗi RPC
    // setPaid(false) -> delete hoặc DELETE trực tiếp có thể để lại đơn đã bị
    // đổi tiền/công nợ nhưng chưa xóa nếu bước sau thất bại.
    if (OrdersService.isMissingLifecycleRpc(error)) {
      throw OrdersService.lifecycleMigrationError('xóa đơn');
    }
    throw error;
  }
}
