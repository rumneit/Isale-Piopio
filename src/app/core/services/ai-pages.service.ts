import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { AiPageConfig, computeWidget, AiWidget } from '../ai-pages';

export interface AiPage {
  id: string;
  shop_id: string;
  name: string;
  prompt: string | null;
  config: AiPageConfig;
  created_at?: string;
}

/**
 * Lưu trữ trang động do người dùng tạo từ mẫu, và CHẠY cấu hình trên dữ liệu
 * thật của shop (orders / customers / products).
 *
 * Việc sinh cấu hình từ câu chat tự nhiên cần backend giữ API key AI — ở đây
 * người dùng chọn mẫu dựng sẵn, hệ thống hiển thị số liệu thật.
 */
@Injectable({ providedIn: 'root' })
export class AiPagesService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(): Promise<AiPage[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('ai_pages')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      config: r.config && typeof r.config === 'object' ? r.config : { widgets: [] },
    })) as AiPage[];
  }

  async get(id: string): Promise<AiPage | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('ai_pages')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as any;
    return {
      ...row,
      config: row.config && typeof row.config === 'object' ? row.config : { widgets: [] },
    } as AiPage;
  }

  async create(name: string, prompt: string, config: AiPageConfig): Promise<AiPage> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('ai_pages')
      .insert({ shop_id: shopId, name, prompt, config })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'ai_page', name);
    return data as AiPage;
  }

  async update(id: string, input: Partial<AiPage>): Promise<void> {
    const { error } = await this.sb
      .from('ai_pages')
      .update(input)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('ai_pages')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Nạp dữ liệu thật cho một nguồn. */
  private async loadSource(source: AiWidget['source']): Promise<Array<Record<string, any>>> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb.from(source).select('*').eq('shop_id', this.shopId).limit(5000);
    if (error) throw error;
    return (data ?? []) as Array<Record<string, any>>;
  }

  /** Chạy toàn bộ widget của một trang trên dữ liệu thật. */
  async run(page: AiPage): Promise<Array<{ widget: AiWidget; value?: number; rows?: Array<{ key: string; count: number; total: number }> }>> {
    const widgets = page.config?.widgets ?? [];
    const sources = [...new Set(widgets.map((w) => w.source))];
    const cache: Partial<Record<AiWidget['source'], Array<Record<string, any>>>> = {};
    for (const s of sources) {
      cache[s] = await this.loadSource(s);
    }
    return widgets.map((widget) => ({
      widget,
      ...computeWidget(widget, cache[widget.source] ?? []),
    }));
  }
}
