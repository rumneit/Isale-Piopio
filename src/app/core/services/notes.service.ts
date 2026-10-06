import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { LogService } from './log.service';
import { SupabaseService } from './supabase.service';

export interface PhotoNoteImage {
  id: string; note_id: string; file_name: string; file_path: string; mime_type: string;
  size_bytes: number; sort_order: number; created_at: string;
}
export interface PhotoNote {
  id: string; shop_id: string; title: string; content: string | null; pinned: boolean;
  important: boolean; recurring: boolean; customer_id: string | null; created_at: string;
  updated_at: string; images?: PhotoNoteImage[];
}

@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly sb = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly log = inject(LogService);
  private get shopId(): string { const id = this.auth.shop()?.id; if (!id) throw new Error('Không tìm thấy cửa hàng.'); return id; }

  async list(search = ''): Promise<PhotoNote[]> {
    let query = this.sb.from('notes').select('*, note_images(*)').eq('shop_id', this.shopId).order('created_at', { ascending: false });
    const safeSearch = search.trim().replace(/[,%()]/g, ' ');
    if (safeSearch) query = query.or(`title.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ ...row, images: [...(row.note_images ?? [])].sort((a, b) => a.sort_order - b.sort_order) }));
  }

  async save(input: { id?: string; content: string; customerId: string | null; important: boolean; recurring: boolean; keepImages: PhotoNoteImage[]; files: File[] }): Promise<PhotoNote> {
    const content = input.content.trim();
    if (!content && !input.keepImages.length && !input.files.length) throw new Error('Hãy nhập nội dung hoặc thêm ít nhất một ảnh.');
    const title = content.split(/\r?\n/)[0]?.slice(0, 120) || 'Ghi chú ảnh';
    const notePayload = { title, content: content || null, customer_id: input.customerId, important: input.important, recurring: input.recurring, updated_at: new Date().toISOString() };
    const previous = input.id
      ? await this.sb.from('notes').select('*').eq('id', input.id).eq('shop_id', this.shopId).single()
      : null;
    if (previous?.error) throw previous.error;
    const result = input.id
      ? await this.sb.from('notes').update(notePayload).eq('id', input.id).eq('shop_id', this.shopId).select().single()
      : await this.sb.from('notes').insert({ ...notePayload, shop_id: this.shopId, created_by: this.auth.profile()?.id ?? null }).select().single();
    if (result.error) throw result.error;
    const note = result.data as PhotoNote;
    const uploadedPaths: string[] = [];
    const insertedImageIds: string[] = [];
    try {
      const existingImages = input.id ? await this.images(note.id) : [];
      const removed = existingImages.filter((image) => !input.keepImages.some((kept) => kept.id === image.id));
      for (let index = 0; index < input.files.length; index++) {
        const file = input.files[index];
        this.validateImage(file);
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${this.shopId}/${note.id}/${crypto.randomUUID()}.${extension}`;
        const upload = await this.sb.client.storage.from('note-images').upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        uploadedPaths.push(path);
        const inserted = await this.sb.from('note_images').insert({
          shop_id: this.shopId, note_id: note.id, file_name: file.name, file_path: path,
          mime_type: file.type, size_bytes: file.size, sort_order: input.keepImages.length + index,
        }).select('id').single();
        if (inserted.error) throw inserted.error;
        insertedImageIds.push(inserted.data.id);
      }
      for (const image of removed) await this.removeImage(image);
    } catch (error) {
      if (insertedImageIds.length) await this.sb.from('note_images').delete().in('id', insertedImageIds).eq('shop_id', this.shopId);
      if (uploadedPaths.length) await this.sb.client.storage.from('note-images').remove(uploadedPaths);
      if (!input.id) {
        await this.sb.from('notes').delete().eq('id', note.id).eq('shop_id', this.shopId);
      } else if (previous?.data) {
        const old = previous.data as PhotoNote;
        await this.sb.from('notes').update({
          title: old.title, content: old.content, customer_id: old.customer_id,
          important: old.important, recurring: old.recurring, updated_at: old.updated_at,
        }).eq('id', note.id).eq('shop_id', this.shopId);
      }
      throw error;
    }
    void this.log.log(input.id ? 'update' : 'create', 'note', title);
    return { ...note, images: await this.images(note.id) };
  }

  async images(noteId: string): Promise<PhotoNoteImage[]> {
    const { data, error } = await this.sb.from('note_images').select('*').eq('shop_id', this.shopId).eq('note_id', noteId).order('sort_order');
    if (error) throw error;
    return (data ?? []) as PhotoNoteImage[];
  }

  async signedUrl(path: string): Promise<string> {
    const { data, error } = await this.sb.client.storage.from('note-images').createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  }

  async remove(note: PhotoNote): Promise<void> {
    const paths = (note.images ?? await this.images(note.id)).map((image) => image.file_path);
    const { error } = await this.sb.from('notes').delete().eq('id', note.id).eq('shop_id', this.shopId);
    if (error) throw error;
    if (paths.length) await this.sb.client.storage.from('note-images').remove(paths);
    void this.log.log('delete', 'note', note.title);
  }

  private async removeImage(image: PhotoNoteImage): Promise<void> {
    const deleted = await this.sb.from('note_images').delete().eq('id', image.id).eq('shop_id', this.shopId);
    if (deleted.error) throw deleted.error;
    await this.sb.client.storage.from('note-images').remove([image.file_path]);
  }
  private validateImage(file: File): void {
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error(`“${file.name}” không phải ảnh JPG, PNG, WebP hoặc GIF.`);
    if (file.size > 8 * 1024 * 1024) throw new Error(`“${file.name}” vượt quá 8 MB.`);
  }
}
