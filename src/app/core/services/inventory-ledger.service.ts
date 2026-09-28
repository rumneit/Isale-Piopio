import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

/**
 * Cầu nối tới Sổ cái Tồn kho (migration v27 — inventory_ledger).
 *
 * Nguyên tắc: client KHÔNG cộng/trừ products.stock nữa — mọi biến động tồn
 * được ghi qua RPC server-side (một transaction, khoá dòng SP, idempotent,
 * chống âm kho cho xuất nội bộ). Fallback: nếu migration v27 chưa chạy
 * (RPC chưa tồn tại — lỗi PGRST202/schema cache) trả về `false` để caller
 * chạy đường cũ (cộng/trừ client-side), hệ thống vẫn hoạt động.
 */
export type LedgerRefType = 'received_note' | 'return_note' | 'transfer_out';

export interface LedgerItemInput {
  product_id: string | null;
  name: string;
  qty: number;
  cost?: number;
}

export interface StockCountRebaseResult {
  fallback: boolean;
  already: boolean;
  items: Array<{ product_id: string; name: string; system_qty: number; counted_qty: number; diff: number }> | null;
  total_diff: number | null;
}

export interface InventoryAuditRow {
  action: string;
  actor_id: string | null;
  before: any;
  after: any;
  created_at: string;
}

/** Dòng còn thiếu hàng của 1 phiếu gốc (v29 — "Chờ nhập thêm"). */
export interface OpenReceiveItem {
  product_id: string;
  name: string;
  qty_ordered: number;
  qty: number;
  outstanding: number;
  cost: number;
}

export interface OpenReceiveNote {
  root_id: string;
  root_code: string;
  supplier_name: string | null;
  supplier_id: string | null;
  created_at: string;
  outstanding_items: OpenReceiveItem[];
}

export interface ApproveNoteResult {
  status: 'partial' | 'completed';
  total: number;
  paid: number;
  remaining: number;
}

@Injectable({ providedIn: 'root' })
export class InventoryLedgerService {
  private sb = inject(SupabaseService);
  private auth = inject(AuthService);

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  /** Lỗi "RPC chưa tồn tại" (migration v27 chưa chạy) → fallback. */
  private isMissingRpc(e: any): boolean {
    const msg = String(e?.message ?? e ?? '');
    const code = String(e?.code ?? '');
    return code === 'PGRST202' || /Could not find the function|inv_apply_note|inv_reverse_note|inv_complete_stockcount|inv_history|inv_approve_note|inv_reject_note|inv_open_receive_notes|schema cache/i.test(msg);
  }

  /**
   * Áp phiếu vào ledger. Trả true nếu đã ghi qua RPC, false nếu cần fallback
   * (migration chưa chạy hoặc chưa cấu hình Supabase).
   */
  async applyNote(refType: LedgerRefType, refId: string, items: LedgerItemInput[]): Promise<boolean> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return false;
    const rows = items
      .filter((i) => i.product_id)
      .map((i) => ({ product_id: i.product_id, name: i.name, qty: Number(i.qty) || 0, cost: i.cost ?? null }));
    if (!rows.length) return true; // không có dòng gắn SP — coi như xong
    try {
      const { data, error } = await this.sb.client.rpc('inv_apply_note', {
        p_shop: shopId,
        p_ref_type: refType,
        p_ref_id: refId,
        p_items: rows,
      });
      if (error) throw error;
      return data !== false;
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v27 chưa chạy — fallback cộng/trừ stock client-side', e);
        return false;
      }
      throw e; // lỗi nghiệp vụ thật (âm kho, sai shop…) — dừng để user thấy
    }
  }

  /** Đảo phiếu khi xoá. Trả true nếu đã đảo qua RPC, false nếu cần fallback. */
  async reverseNote(refType: LedgerRefType, refId: string): Promise<boolean> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return false;
    try {
      const { data, error } = await this.sb.client.rpc('inv_reverse_note', {
        p_shop: shopId,
        p_ref_type: refType,
        p_ref_id: refId,
      });
      if (error) throw error;
      return data !== false;
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v27 chưa chạy — fallback hoàn stock client-side', e);
        return false;
      }
      throw e;
    }
  }

  /**
   * Chốt kiểm kê theo re-base: diff = số đếm − tồn HIỆN TẠI (server khoá dòng
   * SP). Trả items đã tính lại để lưu vào phiếu; `fallback=true` khi v27 chưa chạy.
   */
  async completeStockCount(countId: string, items: Array<{ product_id: string | null; name: string; counted_qty: number }>): Promise<StockCountRebaseResult> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return { fallback: true, already: false, items: null, total_diff: null };
    const rows = items
      .filter((i) => i.product_id)
      .map((i) => ({ product_id: i.product_id, name: i.name, counted_qty: Number(i.counted_qty) || 0 }));
    try {
      const { data, error } = await this.sb.client.rpc('inv_complete_stockcount', {
        p_shop: shopId,
        p_count_id: countId,
        p_items: rows,
      });
      if (error) throw error;
      const res = (Array.isArray(data) ? data[0] : data) ?? {};
      return {
        fallback: false,
        already: !!res.already,
        items: (res.items as any[]) ?? null,
        total_diff: res.total_diff ?? null,
      };
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v27 chưa chạy — fallback chốt kiểm kê client-side', e);
        return { fallback: true, already: false, items: null, total_diff: null };
      }
      throw e;
    }
  }

  /** Lịch sử thay đổi 1 bản ghi (audit trail — migration v27/v28). */
  async history(
    table: 'received_notes' | 'transfers' | 'stock_counts' | 'products' | 'suppliers' | 'supplier_debts' | 'transfer_losses',
    recordId: string,
    limit = 100
  ): Promise<InventoryAuditRow[]> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return [];
    try {
      const { data, error } = await this.sb.client.rpc('inv_history', {
        p_shop: shopId,
        p_table: table,
        p_record_id: recordId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as InventoryAuditRow[];
    } catch (e) {
      if (this.isMissingRpc(e)) return [];
      throw e;
    }
  }

  /**
   * Tạo phiếu chuyển in-transit: 1 transaction vừa insert phiếu vừa trừ tồn
   * nguồn qua ledger (v28). Chặn âm kho. Trả id phiếu, hoặc null nếu cần
   * fallback legacy (v27/v28 chưa chạy).
   */
  async createTransfer(input: {
    code: string;
    destination: string | null;
    note: string | null;
    items: Array<{ product_id: string; name: string; qty: number }>;
  }): Promise<string | null> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return null;
    try {
      const { data, error } = await this.sb.client.rpc('inv_create_transfer', {
        p_shop: shopId,
        p_code: input.code,
        p_destination: input.destination,
        p_note: input.note,
        p_items: input.items,
      });
      if (error) throw error;
      return data as string;
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v28 chưa chạy — fallback tạo phiếu chuyển legacy', e);
        return null;
      }
      throw e;
    }
  }

  /**
   * Nhận hàng phiếu chuyển in-transit (v28): đối soát qty_sent/qty_received,
   * hao hụt ghi transfer_losses + (tùy) hoàn tồn nguồn. Trả kết quả, hoặc
   * {fallback: true} khi v28 chưa chạy.
   */
  async receiveTransfer(input: {
    transferId: string;
    items: Array<{ product_id: string; name: string; qty_sent: number; qty_received: number }>;
    resolution: 'write_off' | 'return_to_source';
    reason: 'damaged' | 'lost' | 'wrong_item' | 'other';
    reasonNote: string | null;
  }): Promise<{ fallback: boolean; already: boolean; items: any[] | null }> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return { fallback: true, already: false, items: null };
    try {
      const { data, error } = await this.sb.client.rpc('inv_receive_transfer', {
        p_shop: shopId,
        p_transfer_id: input.transferId,
        p_items: input.items.map((i) => ({
          product_id: i.product_id, name: i.name,
          qty_sent: i.qty_sent, qty_received: i.qty_received,
        })),
        p_resolution: input.resolution,
        p_reason: input.reason,
        p_reason_note: input.reasonNote,
      });
      if (error) throw error;
      const res = (Array.isArray(data) ? data[0] : data) ?? {};
      return { fallback: false, already: !!res.already, items: (res.items as any[]) ?? null };
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v28 chưa chạy — không thể nhận hàng in-transit', e);
        return { fallback: true, already: false, items: null };
      }
      throw e;
    }
  }

  /**
   * Duyệt phiếu nhập đang chờ (v29 — maker-checker): 1 transaction ghi tồn
   * qua sổ cái + chi tiền đã trả (idempotent theo nonce) + công nợ NCC phần
   * còn lại, rồi chốt trạng thái partial/completed. Trả null khi v29 chưa chạy.
   */
  async approveNote(noteId: string, nonce: string | null): Promise<ApproveNoteResult | null> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return null;
    try {
      const { data, error } = await this.sb.client.rpc('inv_approve_note', {
        p_shop: shopId,
        p_note_id: noteId,
        p_nonce: nonce,
      });
      if (error) throw error;
      const res = (Array.isArray(data) ? data[0] : data) ?? {};
      return {
        status: (res.status as 'partial' | 'completed') ?? 'completed',
        total: Number(res.total ?? 0),
        paid: Number(res.paid ?? 0),
        remaining: Number(res.remaining ?? 0),
      };
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v29 chưa chạy — không thể duyệt phiếu nhập', e);
        return null;
      }
      throw e; // lỗi nghiệp vụ thật (không có quyền, phiếu đã xử lý…) — hiện cho user
    }
  }

  /** Từ chối phiếu nhập đang chờ → cancelled + lý do. Trả null khi v29 chưa chạy. */
  async rejectNote(noteId: string, reason: string | null): Promise<boolean | null> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return null;
    try {
      const { data, error } = await this.sb.client.rpc('inv_reject_note', {
        p_shop: shopId,
        p_note_id: noteId,
        p_reason: reason,
      });
      if (error) throw error;
      return !!data;
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v29 chưa chạy — không thể từ chối phiếu nhập', e);
        return null;
      }
      throw e;
    }
  }

  /**
   * Danh sách phiếu còn THIẾU hàng (v29 — "Chờ nhập thêm"), tính NET theo
   * chuỗi phiếu nhập tiếp. Trả null khi v29 chưa chạy (caller ẩn mục này).
   */
  async openReceiveNotes(): Promise<OpenReceiveNote[] | null> {
    const shopId = this.shopId;
    if (!this.sb.isConfigured || !shopId) return null;
    try {
      const { data, error } = await this.sb.client.rpc('inv_open_receive_notes', {
        p_shop: shopId,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        root_id: row.root_id as string,
        root_code: row.root_code as string,
        supplier_name: (row.supplier_name as string | null) ?? null,
        supplier_id: (row.supplier_id as string | null) ?? null,
        created_at: row.created_at as string,
        outstanding_items: (Array.isArray(row.outstanding_items) ? row.outstanding_items : []) as OpenReceiveItem[],
      }));
    } catch (e) {
      if (this.isMissingRpc(e)) {
        console.warn('[ledger] v29 chưa chạy — ẩn danh sách chờ nhập thêm', e);
        return null;
      }
      throw e;
    }
  }
}
