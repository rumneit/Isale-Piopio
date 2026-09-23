import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export type CustomFieldEntity = 'customer' | 'product' | 'order';

export interface CustomField {
  id: string;
  shop_id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options: string[];
  required: boolean;
  sort_order: number;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomFieldsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  readonly entities = [
    { value: 'customer', label: 'Khách hàng' },
    { value: 'product', label: 'Sản phẩm' },
    { value: 'order', label: 'Đơn hàng' },
  ] as const;

  readonly fieldTypes = [
    { value: 'text', label: 'Văn bản' },
    { value: 'number', label: 'Số' },
    { value: 'date', label: 'Ngày' },
    { value: 'select', label: 'Danh sách chọn' },
    { value: 'boolean', label: 'Đúng/Sai' },
  ] as const;

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(entity?: CustomFieldEntity): Promise<CustomField[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('custom_fields')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('entity', { ascending: true })
      .order('sort_order', { ascending: true });
    if (entity) query = query.eq('entity', entity);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      options: Array.isArray(r.options) ? r.options : [],
    })) as CustomField[];
  }

  /** Sinh key hợp lệ từ nhãn (không dấu, snake_case). */
  static slugifyKey(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async create(input: Partial<CustomField>): Promise<CustomField> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('custom_fields')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    return data as CustomField;
  }

  async update(id: string, patch: Partial<CustomField>): Promise<void> {
    const { error } = await this.sb
      .from('custom_fields')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('custom_fields')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
