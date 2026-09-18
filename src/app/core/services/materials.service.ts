import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface Material {
  id: string;
  shop_id: string;
  name: string;
  unit: string | null;
  stock: number;
  cost: number;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class MaterialsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(search = ''): Promise<Material[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('materials')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.ilike('name', term);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Material[];
  }

  async create(input: Partial<Material>): Promise<Material> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from('materials')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    return data as Material;
  }

  async update(id: string, patch: Partial<Material>): Promise<void> {
    const { error } = await this.sb
      .from('materials')
      .update(patch)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('materials')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
