import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Product } from '../models/models';

/** Một dòng lịch sử Nhập/Xuất của sản phẩm */
export interface ProductHistoryRow {
  kind: 'in' | 'out';
  date: string | null;
  code: string;
  qty: number;
  amount: number;
}

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
    filter: 'all' | 'instock' | 'notexpired' = 'all',
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
    // Isale chip "Còn Hạn SD": còn hạn sử dụng (chạy sau migration v16)
    if (filter === 'notexpired') {
      const today = new Date().toISOString().slice(0, 10);
      query = query.gte('expiry_date', today);
    }

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

  /** Phát hiện cột tùy chọn (expiry_date/barcode — v16, image — v18) */
  async detectOptionalColumns(): Promise<{ expiry: boolean; barcode: boolean; image: boolean }> {
    if (!this.sb.isConfigured || !this.shopId) return { expiry: false, barcode: false, image: false };
    const { error } = await this.sb.from('products').select('id, expiry_date, barcode, image').limit(1);
    if (!error) return { expiry: true, barcode: true, image: true };
    const msg = (error.message || '').toLowerCase();
    return {
      expiry: !msg.includes('expiry_date'),
      barcode: !msg.includes('barcode'),
      image: !msg.includes('image'),
    };
  }

  /** Tải ảnh sản phẩm lên Storage bucket "products" (v18), trả về URL public */
  async uploadImage(file: File): Promise<string> {
    if (!this.sb.isConfigured) throw new Error('Chưa cấu hình Supabase.');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const shop = this.shopId?.slice(0, 8) ?? 'shop';
    const path = `${shop}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await this.sb.client.storage
      .from('products')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = this.sb.client.storage.from('products').getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Lịch sử Nhập/Xuất của một sản phẩm (ISale: "Lịch sử Nhập/Xuất").
   * - Xuất: bảng order_items (thật) → tra orders để lấy mã + ngày.
   * - Nhập: received_notes.items là JSONB array → lọc bằng contains().
   */
  async getHistory(productId: string): Promise<ProductHistoryRow[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const rows: ProductHistoryRow[] = [];

    // XUẤT (bán)
    const { data: ois, error: e1 } = await this.sb
      .from('order_items')
      .select('order_id, qty, price, total')
      .eq('product_id', productId)
      .limit(200);
    if (e1) throw e1;
    const oiRows = (ois ?? []) as Array<{ order_id: string; qty: number; price: number; total: number | null }>;
    if (oiRows.length) {
      const ids = [...new Set(oiRows.map((r) => r.order_id).filter(Boolean))];
      const { data: ords } = await this.sb.from('orders').select('id, code, created_at').in('id', ids);
      const map = new Map(((ords ?? []) as Array<{ id: string; code: string; created_at: string }>).map((o) => [o.id, o]));
      for (const r of oiRows) {
        const o = map.get(r.order_id);
        rows.push({
          kind: 'out',
          date: o?.created_at ?? null,
          code: o?.code ?? '',
          qty: r.qty,
          amount: r.total ?? (r.qty ?? 0) * (r.price ?? 0),
        });
      }
    }

    // NHẬP (phiếu nhập kho)
    const { data: rns, error: e2 } = await this.sb
      .from('received_notes')
      .select('code, created_at, items')
      .eq('shop_id', this.shopId)
      .contains('items', { product_id: productId })
      .order('created_at', { ascending: false })
      .limit(50);
    if (!e2) {
      for (const rn of (rns ?? []) as Array<{ code: string; created_at: string; items: Array<{ product_id: string | null; qty: number; cost: number }> }>) {
        for (const it of rn.items ?? []) {
          if (it.product_id === productId) {
            rows.push({ kind: 'in', date: rn.created_at, code: rn.code, qty: it.qty, amount: (it.qty ?? 0) * (it.cost ?? 0) });
          }
        }
      }
    }

    return rows
      .filter((r) => !!r.date)
      .sort((a, b) => (a.date! < b.date! ? 1 : -1))
      .slice(0, 30);
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
