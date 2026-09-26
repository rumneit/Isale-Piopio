import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface CrmDeal {
  id: string;
  shop_id: string;
  title: string;
  customer_id: string | null;
  lead_id: string | null;
  amount: number;
  stage: 'new' | 'contacting' | 'quoted' | 'won' | 'lost';
  probability: number;
  expected_close_date: string | null;
  owner_name: string | null;
  note: string | null;
  created_at?: string;
}

export interface CrmQuota {
  id: string;
  shop_id: string;
  period: string;
  target_amount: number;
  note: string | null;
  created_at?: string;
}

export interface CrmApproval {
  id: string;
  shop_id: string;
  type: string;
  title: string;
  amount: number;
  requested_by: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class CrmDealsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  static readonly stages = [
    { value: 'new', label: 'Mới' },
    { value: 'contacting', label: 'Đang tư vấn' },
    { value: 'quoted', label: 'Đã báo giá' },
    { value: 'won', label: 'Thành công' },
    { value: 'lost', label: 'Thất bại' },
  ] as const;

  stageLabel(stage: string): string {
    return CrmDealsService.stages.find((s) => s.value === stage)?.label ?? stage;
  }

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(stage: 'all' | CrmDeal['stage'] = 'all', search = ''): Promise<CrmDeal[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('crm_deals')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (stage !== 'all') query = query.eq('stage', stage);
    if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CrmDeal[];
  }

  async get(id: string): Promise<CrmDeal | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('crm_deals')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    return (data as CrmDeal) ?? null;
  }

  async create(input: Partial<CrmDeal>): Promise<CrmDeal> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('crm_deals')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'crm_deal', (data as CrmDeal).title);
    return data as CrmDeal;
  }

  async update(id: string, patch: Partial<CrmDeal>): Promise<void> {
    const { error } = await this.sb
      .from('crm_deals')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('crm_deals')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Giá trị kỳ vọng có trọng số theo xác suất — dùng cho dự báo doanh thu. */
  static weightedForecast(deals: CrmDeal[]): number {
    return deals
      .filter((d) => d.stage !== 'lost')
      .reduce((s, d) => s + (Number(d.amount) || 0) * ((Number(d.probability) || 0) / 100), 0);
  }

  /** Tổng hợp pipeline theo giai đoạn. */
  static pipelineByStage(deals: CrmDeal[]): Array<{ stage: string; count: number; amount: number }> {
    const map = new Map<string, { stage: string; count: number; amount: number }>();
    for (const s of CrmDealsService.stages) map.set(s.value, { stage: s.value, count: 0, amount: 0 });
    for (const d of deals) {
      const row = map.get(d.stage) ?? { stage: d.stage, count: 0, amount: 0 };
      row.count += 1;
      row.amount += Number(d.amount) || 0;
      map.set(d.stage, row);
    }
    return [...map.values()];
  }

  // ---------- Chỉ tiêu (quota) ----------

  async listQuotas(): Promise<CrmQuota[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('crm_quotas')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('period', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmQuota[];
  }

  async setQuota(period: string, targetAmount: number, note: string | null): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { error } = await this.sb
      .from('crm_quotas')
      .upsert(
        { shop_id: shopId, period, target_amount: targetAmount, note },
        { onConflict: 'shop_id,period' }
      );
    if (error) throw error;
    this.logService.log('update', 'crm_quota', period);
  }

  async removeQuota(id: string): Promise<void> {
    const { error } = await this.sb
      .from('crm_quotas')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  // ---------- Phê duyệt (approvals) ----------

  async listApprovals(status: 'all' | CrmApproval['status'] = 'all'): Promise<CrmApproval[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('crm_approvals')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CrmApproval[];
  }

  async createApproval(input: Partial<CrmApproval>): Promise<CrmApproval> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from('crm_approvals')
      .insert({ ...input, shop_id: shopId, status: 'pending' })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'crm_approval', (data as CrmApproval).title);
    return data as CrmApproval;
  }

  async decideApproval(id: string, approved: boolean, reason: string | null): Promise<void> {
    const { error } = await this.sb
      .from('crm_approvals')
      .update({
        status: approved ? 'approved' : 'rejected',
        reason,
        decided_by: this.auth.displayName(),
        decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async removeApproval(id: string): Promise<void> {
    const { error } = await this.sb
      .from('crm_approvals')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
