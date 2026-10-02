import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { SupabaseService } from './supabase.service';

export interface ProductCategory {
  id: string;
  shop_id: string;
  name: string;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(): Promise<ProductCategory[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('categories')
      .select('id, shop_id, name, created_at')
      .eq('shop_id', this.shopId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProductCategory[];
  }

  async create(name: string): Promise<ProductCategory> {
    const shopId = this.shopId;
    const cleanName = this.normalizeName(name);
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    await this.assertUnique(cleanName);
    const { data, error } = await this.sb
      .from('categories')
      .insert({ shop_id: shopId, name: cleanName })
      .select('id, shop_id, name, created_at')
      .single();
    if (error) throw error;
    this.logService.log('create', 'category', cleanName);
    return data as ProductCategory;
  }

  async update(id: string, name: string): Promise<void> {
    const cleanName = this.normalizeName(name);
    await this.assertUnique(cleanName, id);
    const { error } = await this.sb
      .from('categories')
      .update({ name: cleanName })
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
    this.logService.log('update', 'category', cleanName);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async removeMany(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await this.sb
      .from('categories')
      .delete()
      .in('id', ids)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  private normalizeName(name: string): string {
    const clean = name.replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error('Danh mục không được để trống.');
    if (clean.length > 120) throw new Error('Tên danh mục tối đa 120 ký tự.');
    return clean;
  }

  private async assertUnique(name: string, exceptId?: string): Promise<void> {
    if (!this.sb.isConfigured || !this.shopId) return;
    let query = this.sb
      .from('categories')
      .select('id')
      .eq('shop_id', this.shopId)
      .ilike('name', name);
    if (exceptId) query = query.neq('id', exceptId);
    const { data, error } = await query.limit(1);
    if (error) throw error;
    if (data?.length) throw new Error('Danh mục này đã tồn tại.');
  }
}
