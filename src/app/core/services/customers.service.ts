import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { Customer, CustomerAttachment, CustomerDebtEntry, CustomerGroup, CustomerInteraction } from '../models/models';
import { CustomerImportRow } from '../customer-tools';

export interface CustomerFilters {
  q?: string; debtMin?: number | null; groupId?: string | null;
  status?: string | null; createdFrom?: string | null; createdTo?: string | null;
  important?: boolean | null; sortBy?: 'created_at' | 'name' | 'debt' | 'total_spending' | 'last_activity';
  sortDirection?: 'asc' | 'desc'; page?: number; pageSize?: number;
}
export interface CustomerPageResult { items: Customer[]; total: number; page: number; pageSize: number; }
export interface CustomerImportResult { created: number; updated: number; skipped: number; failed: number; errors: Array<{ row: number; message: string }>; }

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly logService = inject(LogService);
  private get shopId(): string | null { return this.auth.shop()?.id ?? null; }

  async list(search = '', onlyDebt = false): Promise<Customer[]> {
    return (await this.listAdvanced({ q: search, debtMin: onlyDebt ? 0.000001 : null, pageSize: 500 })).items;
  }

  async listAll(filters: CustomerFilters = {}): Promise<Customer[]> {
    const output: Customer[] = [];
    let page = 1;
    while (page <= 1000) {
      const result = await this.listAdvanced({ ...filters, page, pageSize: 100 });
      output.push(...result.items);
      if (output.length >= result.total || result.items.length === 0) break;
      page++;
    }
    if (page > 1000) throw new Error('Phạm vi có trên 100.000 khách hàng. Hãy dùng bộ lọc để chia nhỏ dữ liệu xuất.');
    return output;
  }

  async importBatch(rows: CustomerImportRow[], strategy: 'skip' | 'update', idempotencyKey: string, sourceName: string): Promise<CustomerImportResult> {
    const payload = rows;
    const { data, error } = await this.sb.client.rpc('crm_import_customers', {
      p_shop: this.requireShop(), p_rows: payload, p_strategy: strategy,
      p_idempotency_key: idempotencyKey, p_source_name: sourceName,
    });
    if (error) throw error;
    return data as CustomerImportResult;
  }

  async merge(primaryId: string, duplicates: Customer[], patch: Partial<Customer>): Promise<void> {
    const expected = Object.fromEntries(duplicates.map((customer) => [customer.id, customer.updated_at ?? '']));
    const { error } = await this.sb.client.rpc('crm_merge_customers', {
      p_shop: this.requireShop(), p_primary_id: primaryId,
      p_duplicate_ids: duplicates.map((customer) => customer.id),
      p_expected_updated_at: expected, p_patch: patch,
    });
    if (error) throw error;
    void this.logService.log('update', 'customer', `Hợp nhất ${duplicates.length + 1} hồ sơ khách hàng`);
  }

  async listAdvanced(filters: CustomerFilters = {}): Promise<CustomerPageResult> {
    const shopId = this.shopId;
    const page = Math.max(1, Number(filters.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 20)));
    if (!this.sb.isConfigured || !shopId) return { items: [], total: 0, page, pageSize };
    const { data, error } = await this.sb.client.rpc('crm_list_customers', {
      p_shop: shopId, p_q: filters.q?.trim() || null, p_debt_min: filters.debtMin ?? null,
      p_group_id: filters.groupId || null, p_status: filters.status || null,
      p_created_from: filters.createdFrom || null, p_created_to: filters.createdTo || null,
      p_important: filters.important ?? null, p_sort_by: filters.sortBy ?? 'created_at',
      p_sort_direction: filters.sortDirection ?? 'desc', p_page: page, p_page_size: pageSize,
    });
    if (!error && data) {
      const payload = data as { items?: Customer[]; total?: number };
      return { items: payload.items ?? [], total: Number(payload.total ?? 0), page, pageSize };
    }
    if (!this.isMissingFunction(error)) throw error;
    let query = this.sb.from('customers').select('*', { count: 'exact' }).eq('shop_id', shopId);
    if (filters.q?.trim()) {
      const safe = filters.q.trim().replace(/[,%()]/g, ' ');
      query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,code.ilike.%${safe}%`);
    }
    if (filters.debtMin != null) query = query.gt('debt', filters.debtMin);
    if (filters.important != null) query = query.eq('important', filters.important);
    if (filters.createdFrom) query = query.gte('created_at', filters.createdFrom);
    if (filters.createdTo) query = query.lte('created_at', `${filters.createdTo}T23:59:59.999Z`);
    const sort = filters.sortBy && ['created_at', 'name', 'debt', 'last_activity'].includes(filters.sortBy) ? filters.sortBy : 'created_at';
    const from = (page - 1) * pageSize;
    const response = await query.order(sort, { ascending: filters.sortDirection === 'asc' }).range(from, from + pageSize - 1);
    if (response.error) throw response.error;
    return { items: (response.data ?? []) as Customer[], total: response.count ?? 0, page, pageSize };
  }

  async get(id: string): Promise<Customer | null> {
    if (!this.sb.isConfigured || !this.shopId) return null;
    const { data, error } = await this.sb.from('customers').select('*').eq('id', id).eq('shop_id', this.shopId).maybeSingle();
    if (error) throw error;
    return (data as Customer) ?? null;
  }

  async create(input: Partial<Customer>): Promise<Customer> {
    const shopId = this.requireShop(); this.validate(input, false);
    const { data, error } = await this.sb.client.rpc('crm_create_customer', { p_shop: shopId, p_input: input });
    if (!error && data) { const customer = data as Customer; void this.logService.log('create', 'customer', customer.name); return customer; }
    if (!this.isMissingFunction(error)) throw this.friendlyError(error);
    const fallback = await this.sb.from('customers').insert({ ...this.legacyPayload(input), shop_id: shopId }).select().single();
    if (fallback.error) throw this.friendlyError(fallback.error);
    void this.logService.log('create', 'customer', (fallback.data as Customer).name);
    return fallback.data as Customer;
  }

  async update(id: string, input: Partial<Customer>): Promise<void> {
    const shopId = this.requireShop(); this.validate(input, true);
    const { error } = await this.sb.client.rpc('crm_update_customer', { p_shop: shopId, p_customer_id: id, p_input: input });
    if (!error) return;
    if (!this.isMissingFunction(error)) throw this.friendlyError(error);
    const response = await this.sb.from('customers').update(this.legacyPayload(input)).eq('id', id).eq('shop_id', shopId);
    if (response.error) throw this.friendlyError(response.error);
  }

  async remove(id: string): Promise<void> {
    const shopId = this.requireShop();
    const { error } = await this.sb.client.rpc('crm_soft_delete_customer', { p_shop: shopId, p_customer_id: id });
    if (!error) return;
    if (!this.isMissingFunction(error)) throw error;
    const response = await this.sb.from('customers').delete().eq('id', id).eq('shop_id', shopId);
    if (response.error) throw response.error;
  }

  async groups(): Promise<CustomerGroup[]> {
    if (!this.shopId) return [];
    const { data, error } = await this.sb.from('customer_groups').select('*').eq('shop_id', this.shopId).order('name');
    if (error) return SupabaseService.isMissingTable(error) ? [] : Promise.reject(error);
    return (data ?? []) as CustomerGroup[];
  }

  async interactions(customerId: string): Promise<CustomerInteraction[]> {
    if (!this.shopId) return [];
    const { data, error } = await this.sb.from('customer_interactions').select('*').eq('shop_id', this.shopId).eq('customer_id', customerId).order('created_at', { ascending: false });
    if (error) return SupabaseService.isMissingTable(error) ? [] : Promise.reject(error);
    return (data ?? []) as CustomerInteraction[];
  }

  async addInteraction(customerId: string, content: string, type: CustomerInteraction['type'] = 'note'): Promise<CustomerInteraction> {
    const text = content.trim();
    if (!text || text.length > 5000) throw new Error('Nội dung ghi chú phải từ 1 đến 5.000 ký tự.');
    const { data, error } = await this.sb.client.rpc('crm_add_customer_interaction', {
      p_shop: this.requireShop(), p_customer_id: customerId, p_type: type, p_content: text, p_metadata: {},
    });
    if (error) throw error;
    return data as CustomerInteraction;
  }

  async debtLedger(customerId: string): Promise<CustomerDebtEntry[]> {
    if (!this.shopId) return [];
    const { data, error } = await this.sb.from('customer_debt_ledger').select('*').eq('shop_id', this.shopId).eq('customer_id', customerId).order('created_at', { ascending: false });
    if (error) return SupabaseService.isMissingTable(error) ? [] : Promise.reject(error);
    return (data ?? []) as CustomerDebtEntry[];
  }

  async adjustDebt(customerId: string, amount: number, type: CustomerDebtEntry['type'], note = ''): Promise<number> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0.');
    const { data, error } = await this.sb.client.rpc('crm_adjust_customer_debt', {
      p_shop: this.requireShop(), p_customer_id: customerId, p_type: type, p_amount: amount, p_note: note || null,
    });
    if (error) throw error;
    return Number((data as any)?.balance ?? 0);
  }

  async attachments(customerId: string): Promise<CustomerAttachment[]> {
    if (!this.shopId) return [];
    const { data, error } = await this.sb.from('customer_attachments').select('*').eq('shop_id', this.shopId).eq('customer_id', customerId).order('created_at', { ascending: false });
    if (error) return SupabaseService.isMissingTable(error) ? [] : Promise.reject(error);
    return (data ?? []) as CustomerAttachment[];
  }

  async uploadAttachment(customerId: string, file: File): Promise<CustomerAttachment> {
    const shopId = this.requireShop();
    if (file.size > 10 * 1024 * 1024) throw new Error('Tệp vượt quá 10 MB.');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const path = `${shopId}/${customerId}/${crypto.randomUUID()}-${safeName}`;
    const uploaded = await this.sb.client.storage.from('customer-files').upload(path, file, { upsert: false });
    if (uploaded.error) throw uploaded.error;
    const result = await this.sb.from('customer_attachments').insert({ shop_id: shopId, customer_id: customerId, file_name: file.name, file_path: path, mime_type: file.type || null, size_bytes: file.size }).select().single();
    if (result.error) { await this.sb.client.storage.from('customer-files').remove([path]); throw result.error; }
    return result.data as CustomerAttachment;
  }

  async signedAttachmentUrl(path: string): Promise<string> {
    const { data, error } = await this.sb.client.storage.from('customer-files').createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  }

  async addDebtPayment(customer: Customer, amount: number): Promise<void> {
    try { await this.adjustDebt(customer.id, amount, 'payment', `Thu nợ từ ${customer.name}`); }
    catch (error) {
      if (!this.isMissingFunction(error)) throw error;
      await this.update(customer.id, { debt: Math.max(0, Number(customer.debt ?? 0) - amount) });
      const response = await this.sb.from('transactions').insert({ shop_id: this.shopId, type: 'income', category: 'Thu nợ', amount, note: `Thu nợ từ ${customer.name}`, occurred_at: new Date().toISOString() });
      if (response.error) throw response.error;
    }
  }

  private requireShop(): string { if (!this.shopId) throw new Error('Không tìm thấy cửa hàng. Vui lòng đăng nhập lại.'); return this.shopId; }
  private validate(input: Partial<Customer>, partial: boolean): void {
    if (!partial && !input.name?.trim()) throw new Error('Họ tên là bắt buộc.');
    if (input.name != null && (input.name.trim().length < 2 || input.name.trim().length > 160)) throw new Error('Họ tên phải từ 2 đến 160 ký tự.');
    if (input.phone) { const phone = input.phone.replace(/\D/g, ''); if (phone.length < 8 || phone.length > 15) throw new Error('Số điện thoại không hợp lệ.'); }
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error('Email không hợp lệ.');
    if (input.debt != null && (!Number.isFinite(Number(input.debt)) || Number(input.debt) < 0)) throw new Error('Công nợ không hợp lệ.');
  }
  private legacyPayload(input: Partial<Customer>): Partial<Customer> {
    const allowed: Array<keyof Customer> = ['name', 'code', 'phone', 'email', 'address', 'debt', 'gender', 'important', 'last_activity'];
    return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key as keyof Customer)));
  }
  private isMissingFunction(error: any): boolean { return !!error && (error.code === 'PGRST202' || error.code === '42883' || /function .* does not exist|schema cache/i.test(error.message ?? '')); }
  private friendlyError(error: any): Error {
    if (error?.code === '23505' || /điện thoại.*tồn tại|phone.*exists/i.test(error?.message ?? '')) return new Error('Số điện thoại đã tồn tại trong hệ thống.');
    return error instanceof Error ? error : new Error(error?.message ?? 'Yêu cầu thất bại.');
  }
}
