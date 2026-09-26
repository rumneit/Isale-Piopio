import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface CustomTableColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
}

export interface CustomTable {
  id: string;
  shop_id: string;
  name: string;
  columns: CustomTableColumn[];
  created_at?: string;
}

export interface CustomTableRow {
  id: string;
  shop_id: string;
  table_id: string;
  data: Record<string, any>;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomTablesService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  static slugifyKey(label: string): string {
    return label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async list(search = ''): Promise<CustomTable[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('custom_tables')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('created_at', { ascending: false });
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      columns: Array.isArray(r.columns) ? r.columns : [],
    })) as CustomTable[];
  }

  async get(id: string): Promise<CustomTable | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb
      .from('custom_tables')
      .select('*')
      .eq('id', id)
      .eq('shop_id', this.shopId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...(data as any), columns: Array.isArray((data as any).columns) ? (data as any).columns : [] } as CustomTable;
  }

  async create(name: string, columns: CustomTableColumn[]): Promise<CustomTable> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.');
    const { data, error } = await this.sb
      .from('custom_tables')
      .insert({ shop_id: shopId, name, columns })
      .select()
      .single();
    if (error) throw error;
    this.logService.log('create', 'custom_table', name);
    return data as CustomTable;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb
      .from('custom_tables')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async listRows(tableId: string): Promise<CustomTableRow[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    const { data, error } = await this.sb
      .from('custom_table_rows')
      .select('*')
      .eq('shop_id', this.shopId)
      .eq('table_id', tableId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      data: r.data && typeof r.data === 'object' ? r.data : {},
    })) as CustomTableRow[];
  }

  async addRow(tableId: string, data: Record<string, any>): Promise<CustomTableRow> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data: row, error } = await this.sb
      .from('custom_table_rows')
      .insert({ shop_id: shopId, table_id: tableId, data })
      .select()
      .single();
    if (error) throw error;
    return row as CustomTableRow;
  }

  async removeRow(id: string): Promise<void> {
    const { error } = await this.sb
      .from('custom_table_rows')
      .delete()
      .eq('id', id)
      .eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  /** Xuất CSV từ bảng tùy chỉnh (dùng cho nút Export). */
  static toCsv(table: CustomTable, rows: CustomTableRow[]): string {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = table.columns.map((c) => esc(c.label)).join(',');
    const body = rows.map((r) => table.columns.map((c) => esc(r.data?.[c.key])).join(','));
    return [head, ...body].join('\r\n');
  }
}
