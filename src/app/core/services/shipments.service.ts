import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Shipment, ShipmentStatus, ShipmentTrackingLog } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ShipmentsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  /** True khi bảng chưa tồn tại (chưa chạy migration v25). */
  readonly migrationNeeded = signal(false);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  // ================= Trạng thái (đồng bộ ISale shipping.status) =================

  static readonly statuses: { value: ShipmentStatus; label: string; color: string }[] = [
    { value: 'draft', label: 'Nháp', color: 'medium' },
    { value: 'submitted', label: 'Đã tạo', color: 'primary' },
    { value: 'picking', label: 'Đang lấy hàng', color: 'tertiary' },
    { value: 'in_transit', label: 'Đang vận chuyển', color: 'secondary' },
    { value: 'out_for_delivery', label: 'Đang phát', color: 'primary' },
    { value: 'delivered', label: 'Đã giao', color: 'success' },
    { value: 'failed', label: 'Giao thất bại', color: 'danger' },
    { value: 'returning', label: 'Đang hoàn', color: 'warning' },
    { value: 'returned', label: 'Đã hoàn', color: 'warning' },
    { value: 'cancelled', label: 'Đã hủy', color: 'medium' },
    { value: 'exception', label: 'Lỗi', color: 'danger' },
  ];

  static statusLabel(status: string | null | undefined): string {
    return ShipmentsService.statuses.find((s) => s.value === status)?.label ?? (status ?? '—');
  }

  static statusColor(status: string | null | undefined): string {
    return ShipmentsService.statuses.find((s) => s.value === status)?.color ?? 'medium';
  }

  /** Hủy được: trước khi hãng phát giao (đồng bộ canCancel ISale) */
  static canCancel(status: string | null | undefined): boolean {
    return ['draft', 'submitted', 'picking'].includes(status ?? '');
  }

  statusLabel(status: string | null | undefined): string {
    return ShipmentsService.statusLabel(status);
  }

  statusColor(status: string | null | undefined): string {
    return ShipmentsService.statusColor(status);
  }

  canCancel(status: string | null | undefined): boolean {
    return ShipmentsService.canCancel(status);
  }

  // ================= CRUD =================

  async list(search = '', partnerId = 'all', status = 'all'): Promise<Shipment[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('shipments')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (search.trim()) query = query.ilike('tracking_code', `%${search.trim()}%`);
    if (partnerId !== 'all') query = query.eq('partner_id', partnerId);
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) {
      if (SupabaseService.isMissingTable(error)) {
        this.migrationNeeded.set(true);
        return [];
      }
      throw error;
    }
    this.migrationNeeded.set(false);
    return (data ?? []) as Shipment[];
  }

  /** Vận đơn của một đơn hàng (hiển thị trong order-detail) */
  async listByOrder(orderId: string): Promise<Shipment[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('shipments')
      .select('*')
      .eq('shop_id', this.shopId)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) {
      if (SupabaseService.isMissingTable(error)) {
        this.migrationNeeded.set(true);
        return [];
      }
      throw error;
    }
    return (data ?? []) as Shipment[];
  }

  async get(id: string): Promise<Shipment | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('shipments')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    return (data as Shipment) ?? null;
  }

  async listLogs(shipmentId: string): Promise<ShipmentTrackingLog[]> {
    if (!this.sb.isConfigured) return [];
    const { data, error } = await this.sb
      .from('shipment_tracking_logs')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('event_time', { ascending: true });
    if (error) {
      if (SupabaseService.isMissingTable(error)) return [];
      throw error;
    }
    return (data ?? []) as ShipmentTrackingLog[];
  }

  async create(input: Partial<Shipment>): Promise<Shipment> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const tracking = (input.tracking_code ?? '').trim();
    if (!tracking) throw new Error('Vui lòng nhập mã vận đơn.');
    const status = (input.status ?? 'draft') as ShipmentStatus;
    const payload = {
      shop_id: shopId,
      order_id: input.order_id ?? null,
      order_code: input.order_code ?? null,
      partner_id: input.partner_id ?? null,
      partner_name: input.partner_name ?? null,
      provider: input.provider ?? 'manual',
      tracking_code: tracking,
      status,
      shipping_fee: Number(input.shipping_fee ?? 0),
      cod_amount: Number(input.cod_amount ?? 0),
      weight_g: input.weight_g ? Math.round(Number(input.weight_g)) : null,
      length_cm: input.length_cm ? Math.round(Number(input.length_cm)) : null,
      width_cm: input.width_cm ? Math.round(Number(input.width_cm)) : null,
      height_cm: input.height_cm ? Math.round(Number(input.height_cm)) : null,
      from_address: input.from_address?.trim() || null,
      to_address: input.to_address?.trim() || null,
      label_url: input.label_url?.trim() || null,
      expected_delivered_at: input.expected_delivered_at ?? null,
      note: input.note?.trim() || null,
      created_by: this.auth.session()?.user?.id ?? null,
    };
    const { data, error } = await this.sb.from('shipments').insert(payload).select().single();
    if (error) throw error;
    const shipment = data as Shipment;
    this.logService.log('create', 'shipment', tracking);
    // Sự kiện đầu tiên trên timeline
    await this.insertLog(shipment.id, shopId, status, 'Vận đơn được tạo', null).catch(() => undefined);
    return shipment;
  }

  /** Đổi trạng thái + ghi log (kèm mô tả/vị trí tuỳ chọn) */
  async updateStatus(
    id: string,
    status: ShipmentStatus,
    description?: string,
    location?: string | null,
    failReason?: string | null
  ): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (failReason !== undefined) patch['fail_reason'] = failReason;
    const { error } = await this.sb
      .from('shipments')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', shopId);
    if (error) throw error;
    await this.insertLog(id, shopId, status, description ?? null, location ?? null).catch(() => undefined);
  }

  async cancel(id: string): Promise<void> {
    await this.updateStatus(id, 'cancelled', 'Vận đơn bị hủy');
  }

  /** Chỉ xóa vận đơn thủ công (provider=manual); vận đơn hãng giữ dữ liệu */
  async remove(id: string): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const shipment = await this.get(id);
    if (shipment && shipment.provider !== 'manual') {
      throw new Error('Vận đơn tạo từ hãng vận chuyển không thể xóa. Hãy dùng Hủy vận đơn.');
    }
    const { error } = await this.sb.from('shipments').delete().eq('id', id).eq('shop_id', shopId);
    if (error) throw error;
    this.logService.log('delete', 'shipment', shipment?.tracking_code ?? id);
  }

  private async insertLog(
    shipmentId: string,
    shopId: string,
    status: string,
    description: string | null,
    location: string | null
  ): Promise<void> {
    await this.sb.from('shipment_tracking_logs').insert({
      shipment_id: shipmentId,
      shop_id: shopId,
      status,
      description,
      location,
    });
  }

  // ================= Realtime (badge tự cập nhật khi P2 webhook ghi DB) =================

  /**
   * Subscribe thay đổi shipments của shop. Trả về hàm cleanup.
   * Lỗi (chưa bật realtime/chưa chạy migration) → im lặng, trang vẫn hoạt độngpull.
   */
  subscribeChanges(onChange: () => void): () => void {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return () => undefined;
    try {
      const channel = this.sb.client
        .channel(`shipments-${shopId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shipments', filter: `shop_id=eq.${shopId}` },
          () => onChange()
        )
        .subscribe();
      return () => {
        try {
          this.sb.client.removeChannel(channel);
        } catch {
          /* ignore */
        }
      };
    } catch {
      return () => undefined;
    }
  }

  // ================= Hiển thị =================

  /** Định dạng khối lượng như ISale: >= 1000g → kg */
  formatWeight(gram: number | null | undefined): string {
    if (!gram) return '—';
    return gram >= 1000 ? `${gram / 1000} kg` : `${gram} gram`;
  }

  providerLabel(provider: string | null | undefined): string {
    switch (provider) {
      case 'ghn':
        return 'GHN';
      case 'ghtk':
        return 'GHTK';
      case 'viettelpost':
        return 'Viettel Post';
      case 'manual':
        return 'Thủ công';
      default:
        return provider ?? '—';
    }
  }
}
