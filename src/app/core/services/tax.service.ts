import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { computeTax, periodRange, TaxSummary, VatMethod } from '../tax';

export interface TaxProfile {
  id: string;
  shop_id: string;
  tax_code: string;
  company_name: string;
  address: string | null;
  legal_rep: string | null;
  phone: string | null;
  email: string | null;
  accounting_period: string | null;
  invoice_form: string | null;
  declaration_type: string | null;
  status: 'draft' | 'ready' | 'submitted';
  created_at?: string;
}

export interface TaxDeclaration {
  id: string;
  shop_id: string;
  profile_id: string | null;
  period: string;
  declaration_type: string;
  revenue: number;
  vat_amount: number;
  status: 'draft' | 'ready' | 'submitted';
  note: string | null;
  created_at?: string;
}

/**
 * Hồ sơ thuế + tổng hợp tờ khai từ đơn hàng thật trong kỳ.
 *
 * Trung thực về phạm vi: module LƯU hồ sơ và TÍNH số liệu tờ khai. Việc nộp
 * lên cơ quan thuế qua API CyberLotus cần tài khoản đối tác + backend giữ khoá.
 */
@Injectable({ providedIn: 'root' })
export class TaxService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  // ---------- Hồ sơ thuế ----------
  async listProfiles(): Promise<TaxProfile[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('tax_profiles')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TaxProfile[];
  }

  async saveProfile(input: Partial<TaxProfile> & { id?: string }): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const payload = {
      shop_id: shopId,
      tax_code: input.tax_code,
      company_name: input.company_name,
      address: input.address ?? null,
      legal_rep: input.legal_rep ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      accounting_period: input.accounting_period ?? null,
      invoice_form: input.invoice_form ?? null,
      declaration_type: input.declaration_type ?? null,
      status: input.status ?? 'draft',
    };
    if (input.id) {
      const { error } = await this.sb.from('tax_profiles').update(payload).eq('id', input.id).eq('shop_id', shopId);
      if (error) throw error;
    } else {
      const { error } = await this.sb.from('tax_profiles').insert(payload);
      if (error) throw error;
    }
    this.logService.log('update', 'tax_profile', input.company_name ?? '');
  }

  async removeProfile(id: string): Promise<void> {
    const { error } = await this.sb.from('tax_profiles').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  // ---------- Tờ khai ----------
  async listDeclarations(): Promise<TaxDeclaration[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('tax_declarations')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('period', { ascending: false });
    if (error) throw error;
    return (data ?? []) as TaxDeclaration[];
  }

  async saveDeclaration(input: Partial<TaxDeclaration> & { id?: string }): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const payload = {
      shop_id: shopId,
      profile_id: input.profile_id ?? null,
      period: input.period,
      declaration_type: input.declaration_type ?? '01/GTGT',
      revenue: input.revenue ?? 0,
      vat_amount: input.vat_amount ?? 0,
      status: input.status ?? 'draft',
      note: input.note ?? null,
    };
    if (input.id) {
      const { error } = await this.sb.from('tax_declarations').update(payload).eq('id', input.id).eq('shop_id', shopId);
      if (error) throw error;
    } else {
      const { error } = await this.sb.from('tax_declarations').insert(payload);
      if (error) throw error;
    }
  }

  async removeDeclaration(id: string): Promise<void> {
    const { error } = await this.sb.from('tax_declarations').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Tổng doanh thu đơn hàng trong một kỳ (chỉ tính đơn không hủy). */
  async revenueForPeriod(period: string): Promise<number> {
    if (!this.sb.isConfigured || !this.shopId) return 0;
    const { from, to } = periodRange(period);
    const { data, error } = await this.sb
      .from('orders')
      .select('total,status')
      .eq('shop_id', this.shopId)
      .gte('created_at', from)
      .lt('created_at', to);
    if (error) throw error;
    return (data ?? [])
      .filter((o: any) => o.status !== 'cancelled')
      .reduce((sum: number, o: any) => sum + Number(o.total ?? 0), 0);
  }

  /** Tính tổng hợp thuế cho một kỳ từ doanh thu thật. */
  async summaryForPeriod(period: string, method: VatMethod, directRate = 1, inputVat = 0): Promise<TaxSummary> {
    const revenue = await this.revenueForPeriod(period);
    return computeTax({ revenue, method, directRate, inputVat });
  }
}

export type { TaxSummary, VatMethod } from '../tax';
