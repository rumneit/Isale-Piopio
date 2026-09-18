import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Customer } from '../models/models';

export interface PointTransaction {
  id: string;
  shop_id: string;
  customer_id: string;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  note: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class PointsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  /** 1 điểm tích lũy / 10.000₫ */
  readonly earnRate = 10000;

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  pointsForOrder(total: number): number {
    return Math.floor(Number(total ?? 0) / this.earnRate);
  }

  /** Cộng điểm tự động sau khi tạo đơn đã thanh toán */
  async earnForOrder(customer: Customer, orderTotal: number, orderCode: string): Promise<number> {
    const earned = this.pointsForOrder(orderTotal);
    if (earned <= 0) return 0;
    await this.changePoints(customer.id, earned, 'earn', `Tích điểm đơn ${orderCode}`);
    return earned;
  }

  /** Điều chỉnh thủ công (cộng/trừ) */
  async adjust(customerId: string, delta: number, note: string): Promise<void> {
    if (!delta) return;
    await this.changePoints(customerId, delta, delta > 0 ? 'earn' : 'redeem', note || 'Điều chỉnh điểm');
  }

  private async changePoints(customerId: string, delta: number, type: PointTransaction['type'], note: string) {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');

    // Đọc điểm hiện tại rồi cập nhật
    const { data: current, error: readError } = await this.sb
      .from('customers')
      .select('points')
      .eq('id', customerId)
      .eq('shop_id', shopId)
      .maybeSingle();
    if (readError) throw readError;

    const newPoints = Math.max(0, Number(current?.points ?? 0) + delta);
    const { error: updateError } = await this.sb
      .from('customers')
      .update({ points: newPoints })
      .eq('id', customerId)
      .eq('shop_id', shopId);
    if (updateError) throw updateError;

    const { error: insertError } = await this.sb.from('point_transactions').insert({
      shop_id: shopId,
      customer_id: customerId,
      type,
      points: delta,
      note,
    });
    if (insertError) throw insertError;
  }

  async history(customerId: string, limit = 20): Promise<PointTransaction[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('point_transactions')
      .select('*')
      .eq('shop_id', this.shopId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as PointTransaction[];
  }

  async redeem(customer: Customer, pointsToRedeem: number): Promise<void> {
    if (pointsToRedeem <= 0) throw new Error('Số điểm không hợp lệ.');
    if (pointsToRedeem > Number(customer.points ?? 0)) throw new Error('Khách không đủ điểm.');
    await this.changePoints(customer.id, -pointsToRedeem, 'redeem', 'Đổi điểm thưởng');
  }
}
