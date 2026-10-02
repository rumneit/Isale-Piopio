import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonMenuButton,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  checkboxOutline,
  closeOutline,
  cloudUploadOutline,
  createOutline,
  downloadOutline,
  folderOpenOutline,
  funnelOutline,
  gridOutline,
  home,
  listOutline,
  saveOutline,
  searchOutline,
  settingsOutline,
  trashOutline,
} from 'ionicons/icons';
import { CategoriesService, ProductCategory } from '../../core/services/categories.service';
import { CsvExportService } from '../../core/services/csv-export.service';

type FilterOperator = 'contains' | 'equals' | 'not-equals' | 'starts' | 'ends' | 'empty' | 'not-empty';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.page.html',
  styleUrls: ['./categories.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonFab,
    IonFabButton,
    IonModal,
    IonInput,
    IonCheckbox,
  ],
})
export class CategoriesPage implements OnInit {
  private readonly categoriesService = inject(CategoriesService);
  private readonly csvExport = inject(CsvExportService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly items = signal<ProductCategory[]>([]);
  readonly loading = signal(true);
  readonly searchVisible = signal(false);
  readonly search = signal('');
  readonly filterOpen = signal(false);
  readonly filterOperator = signal<FilterOperator>('contains');
  readonly filterValue = signal('');
  readonly sortDirection = signal<SortDirection>('asc');
  readonly viewMode = signal<'card' | 'table'>('card');
  readonly selectMode = signal(false);
  readonly selected = signal<Set<string>>(new Set());
  readonly editMode = signal(false);
  readonly editDrafts = signal<Record<string, string>>({});
  readonly settingsOpen = signal(false);
  readonly showCreatedAt = signal(false);
  readonly formOpen = signal(false);
  readonly editing = signal<ProductCategory | null>(null);
  readonly draftName = signal('');
  readonly saving = signal(false);
  readonly importing = signal(false);

  readonly filteredItems = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('vi');
    const filter = this.filterValue().trim().toLocaleLowerCase('vi');
    const operator = this.filterOperator();
    const rows = this.items().filter((item) => {
      const name = item.name.toLocaleLowerCase('vi');
      if (query && !name.includes(query)) return false;
      if (!filter && operator !== 'empty' && operator !== 'not-empty') return true;
      switch (operator) {
        case 'equals': return name === filter;
        case 'not-equals': return name !== filter;
        case 'starts': return name.startsWith(filter);
        case 'ends': return name.endsWith(filter);
        case 'empty': return name.length === 0;
        case 'not-empty': return name.length > 0;
        default: return name.includes(filter);
      }
    });
    return rows.sort((a, b) => {
      const result = a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
      return this.sortDirection() === 'asc' ? result : -result;
    });
  });

  readonly hasActiveFilter = computed(() => {
    return this.filterValue().trim().length > 0 || ['empty', 'not-empty'].includes(this.filterOperator());
  });

  constructor() {
    addIcons({
      add,
      checkboxOutline,
      closeOutline,
      cloudUploadOutline,
      createOutline,
      downloadOutline,
      folderOpenOutline,
      funnelOutline,
      gridOutline,
      home,
      listOutline,
      saveOutline,
      searchOutline,
      settingsOutline,
      trashOutline,
    });
  }

  ngOnInit(): void {
    this.restorePreferences();
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.categoriesService.list());
    } catch (error: any) {
      this.items.set([]);
      await this.toast(error?.message ?? 'Không thể tải danh mục.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  refresh(event: CustomEvent): void {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openHome(): void {
    this.router.navigateByUrl('/home');
  }

  toggleSearch(): void {
    this.searchVisible.update((value) => !value);
    if (!this.searchVisible()) this.search.set('');
  }

  onSearch(event: CustomEvent): void {
    this.search.set(String((event.detail as { value?: string }).value ?? ''));
  }

  clearFilter(): void {
    this.filterValue.set('');
    this.filterOperator.set('contains');
    this.filterOpen.set(false);
    this.persistPreferences();
  }

  applyFilter(): void {
    this.filterOpen.set(false);
    this.persistPreferences();
  }

  toggleView(): void {
    this.viewMode.update((mode) => mode === 'card' ? 'table' : 'card');
    this.persistPreferences();
  }

  toggleSelectMode(): void {
    this.selectMode.update((value) => !value);
    if (!this.selectMode()) this.selected.set(new Set());
  }

  toggleSelected(id: string): void {
    if (!this.selectMode()) return;
    this.selected.update((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  toggleAll(checked: boolean): void {
    this.selected.set(checked ? new Set(this.filteredItems().map((item) => item.id)) : new Set());
  }

  startBulkEdit(): void {
    this.editDrafts.set(Object.fromEntries(this.filteredItems().map((item) => [item.id, item.name])));
    this.editMode.set(true);
  }

  setEditDraft(id: string, value: string): void {
    this.editDrafts.update((drafts) => ({ ...drafts, [id]: value }));
  }

  cancelBulkEdit(): void {
    this.editDrafts.set({});
    this.editMode.set(false);
  }

  async saveBulkEdit(): Promise<void> {
    const drafts = this.editDrafts();
    const changed = this.items().filter((item) => drafts[item.id] !== undefined && drafts[item.id].trim() !== item.name);
    if (!changed.length) {
      this.cancelBulkEdit();
      return;
    }
    this.saving.set(true);
    try {
      for (const item of changed) await this.categoriesService.update(item.id, drafts[item.id]);
      await this.load();
      this.cancelBulkEdit();
      await this.toast(`Đã cập nhật ${changed.length} danh mục.`);
    } catch (error: any) {
      await this.toast(error?.message ?? 'Cập nhật thất bại.', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.draftName.set('');
    this.formOpen.set(true);
  }

  openEdit(item: ProductCategory): void {
    if (this.selectMode()) {
      this.toggleSelected(item.id);
      return;
    }
    this.editing.set(item);
    this.draftName.set(item.name);
    this.formOpen.set(true);
  }

  closeForm(): void {
    if (!this.saving()) this.formOpen.set(false);
  }

  async saveForm(): Promise<void> {
    if (!this.draftName().trim()) {
      await this.toast('Danh mục là trường bắt buộc.', 'warning');
      return;
    }
    this.saving.set(true);
    try {
      const current = this.editing();
      if (current) await this.categoriesService.update(current.id, this.draftName());
      else await this.categoriesService.create(this.draftName());
      this.formOpen.set(false);
      await this.load();
      await this.toast(current ? 'Đã cập nhật danh mục.' : 'Đã thêm danh mục.');
    } catch (error: any) {
      await this.toast(error?.message ?? 'Không thể lưu danh mục.', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteSelected(): Promise<void> {
    const ids = [...this.selected()];
    if (!ids.length) return;
    const alert = await this.alertCtrl.create({
      header: `Xóa ${ids.length} danh mục?`,
      message: 'Sản phẩm thuộc các danh mục này sẽ được chuyển về trạng thái không có danh mục. Thao tác không thể hoàn tác.',
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Xóa', role: 'destructive', handler: () => this.confirmDelete(ids) },
      ],
    });
    await alert.present();
  }

  private async confirmDelete(ids: string[]): Promise<void> {
    try {
      await this.categoriesService.removeMany(ids);
      this.selected.set(new Set());
      this.selectMode.set(false);
      await this.load();
      await this.toast(`Đã xóa ${ids.length} danh mục.`);
    } catch (error: any) {
      await this.toast(error?.message ?? 'Xóa thất bại.', 'danger');
    }
  }

  exportCsv(): void {
    const rows = this.filteredItems().map((item) => [item.name, this.csvExport.formatDateTime(item.created_at)]);
    this.csvExport.export('danh-muc-san-pham', ['Danh mục', 'Ngày tạo'], rows);
    this.toast(`Đã xuất ${rows.length} danh mục.`);
  }

  async importCsv(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      await this.toast('Hiện module nhận file CSV UTF-8. Hãy lưu Excel thành CSV trước khi nhập.', 'warning');
      return;
    }
    this.importing.set(true);
    try {
      const text = await file.text();
      const names = this.parseCsvFirstColumn(text);
      let created = 0;
      let skipped = 0;
      for (const name of names) {
        try {
          await this.categoriesService.create(name);
          created++;
        } catch {
          skipped++;
        }
      }
      await this.load();
      await this.toast(`Đã nhập ${created} danh mục${skipped ? `, bỏ qua ${skipped} dòng trùng/lỗi` : ''}.`);
    } catch (error: any) {
      await this.toast(error?.message ?? 'Không thể đọc file nhập.', 'danger');
    } finally {
      this.importing.set(false);
    }
  }

  downloadTemplate(): void {
    this.csvExport.export('mau-danh-muc-san-pham', ['Danh mục'], [['Đồ uống'], ['Thực phẩm']]);
  }

  private parseCsvFirstColumn(text: string): string[] {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const valueOf = (line: string) => {
      if (!line.startsWith('"')) return line.split(/[,;\t]/)[0].trim();
      const match = line.match(/^"((?:[^"]|"")*)"/);
      return (match?.[1] ?? '').replace(/""/g, '"').trim();
    };
    const first = valueOf(lines[0]).toLocaleLowerCase('vi');
    const start = first.includes('danh mục') || first.includes('category') ? 1 : 0;
    return [...new Set(lines.slice(start).map(valueOf).filter(Boolean))];
  }

  formatDate(value?: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(value));
  }

  private restorePreferences(): void {
    try {
      const raw = localStorage.getItem('piopio.category.preferences');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.viewMode === 'card' || saved.viewMode === 'table') this.viewMode.set(saved.viewMode);
      if (saved.sortDirection === 'asc' || saved.sortDirection === 'desc') this.sortDirection.set(saved.sortDirection);
      if (typeof saved.showCreatedAt === 'boolean') this.showCreatedAt.set(saved.showCreatedAt);
    } catch {
      // Bỏ qua cấu hình cũ không hợp lệ.
    }
  }

  persistPreferences(): void {
    localStorage.setItem('piopio.category.preferences', JSON.stringify({
      viewMode: this.viewMode(),
      sortDirection: this.sortDirection(),
      showCreatedAt: this.showCreatedAt(),
    }));
  }

  private async toast(message: string, color: string = 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, color, duration: 2200, position: 'bottom' });
    await toast.present();
  }
}
