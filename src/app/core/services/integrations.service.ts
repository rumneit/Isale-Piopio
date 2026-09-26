import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export type IntegrationProvider = 'fbpage' | 'sms' | 'zbs' | 'sepay' | 'ai';

export interface IntegrationSetting {
  id: string;
  shop_id: string;
  provider: IntegrationProvider;
  enabled: boolean;
  config: Record<string, any>;
  updated_at?: string;
}

export interface ProviderMeta {
  provider: IntegrationProvider;
  name: string;
  description: string;
  /** Các trường cấu hình cần nhập. */
  fields: Array<{ key: string; label: string; type?: 'text' | 'password'; placeholder?: string }>;
  /** Ghi chú về yêu cầu backend/API bên thứ ba. */
  requirement: string;
}

/**
 * Lưu cấu hình tích hợp (Fanpage / SMS / ZBS / SePay / AI) theo từng shop.
 *
 * LƯU Ý TRUNG THỰC: module này quản lý CẤU HÌNH. Việc gửi tin thật / nhận webhook
 * cần một backend worker và API key của nhà cung cấp — ngoài phạm vi repo frontend này.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  readonly providers: ProviderMeta[] = [
    {
      provider: 'fbpage',
      name: 'Quản lý Fanpage',
      description: 'Kết nối Fanpage Facebook để đồng bộ hội thoại và đơn từ Messenger.',
      fields: [
        { key: 'page_id', label: 'Page ID', placeholder: '1234567890' },
        { key: 'access_token', label: 'Page Access Token', type: 'password' },
      ],
      requirement: 'Cần Facebook App + webhook backend để nhận tin nhắn.',
    },
    {
      provider: 'sms',
      name: 'SMS Marketing',
      description: 'Gửi tin nhắn chăm sóc khách hàng hàng loạt.',
      fields: [
        { key: 'brand_name', label: 'Brandname', placeholder: 'PIOPIO' },
        { key: 'api_key', label: 'API Key', type: 'password' },
      ],
      requirement: 'Cần tài khoản nhà cung cấp SMS (Brandname đã đăng ký).',
    },
    {
      provider: 'zbs',
      name: 'Zalo ZBS Marketing',
      description: 'Gửi tin Zalo ZNS/ZBS tới khách hàng.',
      fields: [
        { key: 'oa_id', label: 'OA ID', placeholder: 'OA của shop' },
        { key: 'access_token', label: 'Access Token', type: 'password' },
      ],
      requirement: 'Cần Zalo OA đã xác thực và template ZNS được duyệt.',
    },
    {
      provider: 'sepay',
      name: 'Loa thông báo SePay',
      description: 'Nhận thông báo biến động số dư ngân hàng, tự tạo giao dịch thu.',
      fields: [
        { key: 'bank_account', label: 'Số tài khoản nhận' },
        { key: 'webhook_token', label: 'Webhook Token', type: 'password' },
      ],
      requirement: 'Cần webhook backend công khai để SePay gọi vào.',
    },
    {
      provider: 'ai',
      name: 'Dịch vụ AI (ViLao)',
      description: 'Tạo nội dung, gợi ý giá và mô tả sản phẩm bằng ViLao AI.',
      fields: [
        { key: 'base_url', label: 'API Base URL', placeholder: 'https://api.vilao.ai/v1' },
        { key: 'model', label: 'Model', placeholder: 'DeepSeek V4.1 Flash / GLM 5.3' },
        { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
      ],
      requirement: 'Cần API key của ViLao AI (lưu ở Supabase theo từng shop).',
    },
  ];

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  providerMeta(provider: string): ProviderMeta | undefined {
    return this.providers.find((p) => p.provider === provider);
  }

  async list(): Promise<IntegrationSetting[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('integration_settings')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('provider', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      config: r.config && typeof r.config === 'object' ? r.config : {},
    })) as IntegrationSetting[];
  }

  async save(provider: IntegrationProvider, enabled: boolean, config: Record<string, any>): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { error } = await this.sb
      .from('integration_settings')
      .upsert(
        { shop_id: shopId, provider, enabled, config, updated_at: new Date().toISOString() },
        { onConflict: 'shop_id,provider' }
      );
    if (error) throw error;
    this.logService.log('update', 'integration', provider);
  }
}
