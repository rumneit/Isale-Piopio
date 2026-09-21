import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { LogService } from './log.service';

export interface Loan {
  id: string;
  shop_id: string;
  type: 'loan' | 'debt';
  party_name: string;
  amount: number;
  paid: boolean;
  note: string | null;
  occurred_at: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class LoansService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);
  private logService = inject(LogService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  typeLabel(type: string): string {
    return type === 'loan' ? 'Vay (mình nợ)' : 'Cho nợ (khách nợ)';
  }

  async list(search = ''): Promise<Loan[]> {
    if (!this.sb.isConfigured || !this.shopId) return [];
    let query = this.sb
      .from('loans')
      .select('*')
      .eq('shop_id', this.shopId)
      .order('occurred_at', { ascending: false });

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`party_name.ilike.${term},note.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Loan[];
  }

  async create(input: Partial<Loan>): Promise<Loan> {
    const shopId = this.shopId;
    if (!shopId) throw new Error('Không tìm thấy cửa hàng.');
    const { data, error } = await this.sb
      .from('loans')
      .insert({ ...input, shop_id: shopId })
      .select()
      .single();
    if (error) throw error;
    const loan = data as Loan;
    this.logService.log('create', 'loan', `${this.typeLabel(loan.type)} — ${loan.party_name}`);
    return loan;
  }

  async setPaid(id: string, paid: boolean): Promise<void> {
    const { error } = await this.sb.from('loans').update({ paid }).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async update(id: string, patch: Partial<Loan>): Promise<void> {
    const { error } = await this.sb.from('loans').update(patch).eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from('loans').delete().eq('id', id).eq('shop_id', this.shopId!);
    if (error) throw error;
  }
}
