import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface CrmLead {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: 'new' | 'contacting' | 'quoted' | 'won' | 'lost';
  value: number;
  note: string | null;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class CrmService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  readonly stages = [
    { value: 'new', label: 'Mới' },
    { value: 'contacting', label: 'Đang tư vấn' },
    { value: 'quoted', label: 'Đã báo giá' },
    { value: 'won', label: 'Thành công' },
    { value: 'lost', label: 'Thất bại' },
  ] as const;

  readonly sources = ['Facebook', 'Zalo', 'Điện thoại', 'Ghé cửa hàng', 'Giới thiệu', 'Khác'];

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  stageLabel(stage: string): string {
    return this.stages.find((s) => s.value === stage)?.label ?? stage;
  }

  async list(stage: 'all' | CrmLead['stage'] = 'all', search = ''): Promise<CrmLead[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('crm_leads')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });

    if (stage !== 'all') query = query.eq('stage', stage);
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},phone.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CrmLead[];
  }

  async get(id: string): Promise<CrmLead | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('crm_leads')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    return (data as CrmLead) ?? null;
  }

  async create(input: Partial<CrmLead>): Promise<CrmLead> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from('crm_leads')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    return data as CrmLead;
  }

  async update(id: string, patch: Partial<CrmLead>): Promise<void> {
    const { error } = await this.sb
      .from('crm_leads')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('crm_leads')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
