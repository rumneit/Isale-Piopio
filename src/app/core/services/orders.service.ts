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

  /**
   * Đổi trạng thái đơn qua RPC v43: server đổi trạng thái trong cùng transaction
   * với bút toán kho/công nợ và bảo đảm đơn "đã thanh toán" luôn có khoản thu.
   * Fallback UPDATE trực tiếp chỉ khi DB chưa chạy v43.
   */
  async setStatus(id: string, status: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    const { error } = await this.sb.client.rpc('inv_set_order_status', {
      p_shop: this.shopId,
      p_order_id: id,
      p_status: status,
    });
    if (!error) return;
    if (!OrdersService.isMissingLifecycleRpc(error)) throw error;
    const fallback = await this.sb
      .from('orders')
      .update({ status })
      .eq('id', id)
      .eq('shop_id', this.shopId);
    if (fallback.error) throw fallback.error;
  }

  /**
   * Đặt cờ đã thanh toán qua RPC v43. Server ghi/đảo khoản thu tương ứng để
   * sổ quỹ và công nợ không lệch; fallback UPDATE khi DB chưa chạy v43.
   */
  async setPaid(id: string, paid: boolean): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    const { error } = await this.sb.client.rpc('inv_set_order_paid', {
      p_shop: this.shopId,
      p_order_id: id,
      p_paid: paid,
    });
    if (!error) return;
    if (!OrdersService.isMissingLifecycleRpc(error)) throw error;
    const fallback = await this.sb
      .from('orders')
      .update({ paid })
      .eq('id', id)
      .eq('shop_id', this.shopId);
    if (fallback.error) throw fallback.error;
  }

  /** Đổi hình thức thanh toán qua RPC v43 (fallback UPDATE khi chưa migrate). */
  async setPaymentMethod(id: string, method: string | null): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    const { error } = await this.sb.client.rpc('inv_set_order_payment', {
      p_shop: this.shopId,
      p_order_id: id,
      p_method: method,
    });
    if (!error) return;
    if (!OrdersService.isMissingLifecycleRpc(error)) throw error;
    const fallback = await this.sb
      .from('orders')
      .update({ payment_method: method })
      .eq('id', id)
      .eq('shop_id', this.shopId);
    if (fallback.error) throw fallback.error;
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
    const created = order as Order;
    // Lưu đơn vị khách đã chọn (Thùng/Lốc/...) để chi tiết đơn và hoá đơn
    // hiển thị đúng. Đây là metadata phụ; lỗi ở bước này không được làm hỏng
    // đơn vừa tạo (tồn kho/doanh thu đã được RPC xử lý xong).
    await this.syncItemUnits(created.id, items);
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
    const { data, error } = await this.sb.client.rpc('inv_update_order_full', {
      p_shop: shopId,
      p_order_id: orderId,
      p_order: order,
      p_items: items,
      p_adjust_income: true,
    });
    if (error) {
      if (error.code === 'PGRST202' || /inv_update_order_full|schema cache/i.test(error.message)) {
        throw new Error(
          'Cơ sở dữ liệu chưa có hàm sửa đơn đầy đủ (migration v40). Hãy chạy file supabase-migration-v40-sale-order-edit.sql trong Supabase SQL Editor, đợi vài giây để schema cache nạp lại rồi thử lại.'
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
    await this.syncItemUnits(orderId, items);
    this.logService.log('update', 'order', updated?.code ?? orderId);
    return updated;
  }

  /**
   * Gắn metadata đơn vị (Thùng/Lốc/...) vào các dòng order_items vừa tạo/sửa.
   *
   * `order_items.qty` vẫn là số lượng quy về đơn vị gốc — nhờ vậy trigger tồn
   * kho, báo cáo và các RPC cũ không phải thay đổi. Hàm này chỉ cập nhật
   * unit/unit_qty/unit_conversion/unit_price để giao diện hiển thị đúng đơn vị.
   */
  async syncItemUnits(orderId: string, items: OrderLineInput[]): Promise<void> {
    try {
      await this.syncItemUnitsUnsafe(orderId, items);
    } catch (e: any) {
      console.warn('Không lưu được đơn vị bán:', e?.message ?? e);
    }
  }

  private async syncItemUnitsUnsafe(orderId: string, items: OrderLineInput[]): Promise<void> {
    const tagged = items.filter(
      (i) =>
        !!i.unit &&
        Number(i.unit_conversion) > 0 &&
        i.unit_qty != null &&
        i.unit_price != null
    );
    const shopId = this.shopId;
    if (!tagged.length || !shopId) return;

    const { data, error } = await this.sb
      .from('order_items')
      .select('id, product_id, name, price, qty')
      .eq('order_id', orderId);
    if (error) {
      console.warn('Không đọc được dòng đơn để lưu đơn vị:', error.message);
      return;
    }

    // Ghép theo id trước; dòng mới (hoặc dòng bị RPC xoá/tạo lại) thì ghép theo
    // sản phẩm + tên + giá/số lượng gốc. Mỗi dòng DB chỉ được ghép một lần.
    const pool = [...(data ?? [])] as Array<{
      id: string;
      product_id: string | null;
      name: string;
      price: number;
      qty: number;
    }>;
    const payload: Array<{
      id: string;
      unit: string;
      unit_conversion: number;
      unit_qty: number;
      unit_price: number;
    }> = [];

    for (const item of tagged) {
      let row: (typeof pool)[number] | undefined;
      if (item.id) {
        const byId = pool.findIndex((r) => r.id === item.id);
        if (byId >= 0) row = pool.splice(byId, 1)[0];
      }
      if (!row) {
        const byValues = pool.findIndex(
          (r) =>
            (r.product_id ?? null) === (item.product_id ?? null) &&
            r.name === item.name &&
            Math.abs(Number(r.qty) - Number(item.qty)) < 0.0001 &&
            Math.abs(Number(r.price) - Number(item.price)) < 0.005
        );
        if (byValues >= 0) row = pool.splice(byValues, 1)[0];
      }
      if (!row) continue;
      payload.push({
        id: row.id,
        unit: String(item.unit),
        unit_conversion: Number(item.unit_conversion),
        unit_qty: Number(item.unit_qty),
        unit_price: Number(item.unit_price),
      });
    }
    if (!payload.length) return;

    const { error: rpcError } = await this.sb.client.rpc('inv_set_order_item_units', {
      p_shop: shopId,
      p_order_id: orderId,
      p_items: payload,
    });
    if (
      rpcError &&
      !/inv_set_order_item_units|schema cache|function|does not exist/i.test(rpcError.message)
    ) {
      console.warn('Không lưu được đơn vị bán:', rpcError.message);
    }
  }

  async update(id: string, patch: Partial<Order>): Promise<void> {
    const { error } = await this.sb.from('orders').update(patch).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    let { error } = await this.sb.client.rpc('inv_delete_order', {
      p_shop: this.shopId,
      p_order_id: id,
    });
    if (!error) return;
    // v43 cố ý chặn xóa đơn từng có khoản thu. Với các đơn nháp được tạo ở
    // phiên bản cũ, khoản thu "Bán hàng" lại được sinh tự động. Đảo đúng khoản
    // thu tự động qua RPC rồi thử xóa lại; khoản Thu nợ thủ công vẫn được giữ và
    // backend tiếp tục chặn để tránh mất tiền thật.
    if (/đã ghi nhận thanh toán|recorded payment/i.test(String(error.message ?? ''))) {
      const paidResult = await this.sb.client.rpc('inv_set_order_paid', {
        p_shop: this.shopId,
        p_order_id: id,
        p_paid: false,
      });
      if (paidResult.error && !OrdersService.isMissingLifecycleRpc(paidResult.error)) {
        throw paidResult.error;
      }
      const retried = await this.sb.client.rpc('inv_delete_order', {
        p_shop: this.shopId,
        p_order_id: id,
      });
      error = retried.error;
      if (!error) return;
    }
    if (!OrdersService.isMissingLifecycleRpc(error)) throw error;
    const fallback = await this.sb.from('orders').delete().eq('id', id).eq('shop_id', this.shopId);
    if (fallback.error) throw fallback.error;
  }
}
