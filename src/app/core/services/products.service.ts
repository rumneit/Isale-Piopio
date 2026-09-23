import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Product } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  async list(search = ''): Promise<Product[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('products')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},sku.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Product[];
  }

  /**
   * Danh sách phân trang phía máy chủ (chống tải hàng nghìn SKU một lúc).
   * Trả về cả tổng số dòng để hiển thị đúng số trang.
   */
  async listPaged(
    search = '',
    page = 1,
    pageSize = 30,
    sort: 'recent' | 'name' | 'price' = 'recent',
    filter: 'all' | 'instock' = 'all',
    categoryId?: string | null
  ): Promise<{ items: Product[]; total: number }> {
    if (!this.sb.isConfigured || !this.shopId) return { items: [], total: 0 };

    const from = Math.max(0, (page - 1) * pageSize);
    const to = from + pageSize - 1;

    let query = this.sb
      .from('products')
      .select('*', { count: 'exact' })
      .eq('shop_id', this.shopId)
      .range(from, to);

    // Isale chip "Còn số lượng": chỉ sản phẩm còn tồn kho
    if (filter === 'instock') query = query.gt('stock', 0);

    // Isale "Chọn Nhóm hàng": lọc theo danh mục
    if (categoryId) query = query.eq('category_id', categoryId);

    switch (sort) {
      case 'name':
        query = query.order('name', { ascending: true });
        break;
      case 'price':
        query = query.order('price', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},sku.ilike.${term}`);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { items: (data ?? []) as Product[], total: count ?? (data ?? []).length };
  }

  async get(id: string): Promise<Product | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    return (data as Product) ?? null;
  }

  /** Danh mục nhóm hàng (ISale: "Chọn Nhóm hàng") */
  async listCategories(): Promise<{ id: string; name: string }[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('categories')
      .select('id, name')
      .eq('shop_id', this.shopId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as { id: string; name: string }[];
  }

  /** Tìm sản phẩm theo mã (SKU) — dùng cho quét barcode */
  async getBySku(sku: string): Promise<Product | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('products')
      .select('*')
      .eq('shop_id', this.shopId)
      .eq('sku', sku.trim())
      .maybeSingle();
    if (error) throw error;
    return (data as Product) ?? null;
  }

  async create(input: Partial<Product>): Promise<Product> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('products')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'product', (data as Product).name);
    return data as Product;
  }

  async update(id: string, input: Partial<Product>): Promise<void> {
    const { error } = await this.sb
      .from('products')
      .update(input)
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
    if (input.name) this.logService.log('update', 'product', input.name);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('products')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
