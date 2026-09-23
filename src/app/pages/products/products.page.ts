import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonMenuButton,
  IonToggle,
  ActionSheetController,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  home,
  barcodeSharp,
  addCircleSharp,
  apps,
  funnelOutline,
  searchOutline,
  checkboxOutline,
  createOutline,
  downloadOutline,
  cloudUploadOutline,
  gridOutline,
  settingsOutline,
  chevronForwardOutline,
  chevronBackOutline,
  sparklesOutline,
  addOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';;
import { ProductsService } from '../../core/services/products.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Product } from '../../core/models/models';

@Component({
  selector: 'app-products',
  templateUrl: './products.page.html',
  styleUrls: ['./products.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonMenuButton,
    IonToggle,
    FabTrioComponent,
  ],
})
export class ProductsPage implements OnInit {
  private productsService = inject(ProductsService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);

  readonly items = signal<Product[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly searchVisible = signal(false);
  readonly page = signal(1);
  readonly pageSize = 20;
  search = '';
  /** Chip lọc kiểu ISale: Tất cả | Còn số lượng | Tên A→Z | Giá cao→thấp (+ Còn Hạn SD khi có cột) */
  readonly chip = signal<'all' | 'instock' | 'notexpired' | 'name' | 'price'>('all');
  /** Nhóm hàng đang lọc (null = tất cả) */
  readonly categoryId = signal<string | null>(null);
  /** Cột tùy chọn có trong schema (sau migration v16) */
  readonly hasExpiry = signal(false);
  readonly hasBarcode = signal(false);
  /** Chế độ chọn nhiều (ISale: "Chọn nhiều") */
  readonly selectMode = signal(false);
  readonly selected = signal<Set<string>>(new Set());

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  constructor() {
    addIcons({
      home,
      barcodeSharp,
      addCircleSharp,
      apps,
      funnelOutline,
      searchOutline,
      checkboxOutline,
      createOutline,
      downloadOutline,
      cloudUploadOutline,
      gridOutline,
      settingsOutline,
      chevronForwardOutline,
      chevronBackOutline,
      sparklesOutline,
      addOutline,
      checkmarkCircleOutline,
    });
  }

  ngOnInit(): void {
    this.load();
    this.detectColumns();
  }

  private async detectColumns() {
    try {
      const cols = await this.productsService.detectOptionalColumns();
      this.hasExpiry.set(cols.expiry);
      this.hasBarcode.set(cols.barcode);
    } catch {
      /* bỏ qua — giữ mặc định */
    }
  }

  async load() {
    this.loading.set(true);
    try {
      const chip = this.chip();
      const { items, total } = await this.productsService.listPaged(
        this.search,
        this.page(),
        this.pageSize,
        chip === 'name' ? 'name' : chip === 'price' ? 'price' : 'recent',
        chip === 'instock' ? 'instock' : chip === 'notexpired' ? 'notexpired' : 'all',
        this.categoryId()
      );
      this.items.set(items);
      this.total.set(total);
    } catch (e: any) {
      console.error('load products failed', e);
      this.items.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  async selectChip(chip: 'all' | 'instock' | 'notexpired' | 'name' | 'price') {
    this.chip.set(chip);
    this.page.set(1);
    await this.load();
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    this.page.set(1);
    await this.load();
  }

  toggleSearch() {
    this.searchVisible.update((v) => !v);
    if (!this.searchVisible()) {
      this.search = '';
      this.load();
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  nextPage() {
    if (this.page() < this.totalPages()) {
      this.page.update((p) => p + 1);
      this.load();
    }
  }

  prevPage() {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      this.load();
    }
  }

  openDetail(item: Product) {
    if (this.selectMode()) {
      this.toggleSelect(item.id);
      return;
    }
    this.router.navigateByUrl(`/product/detail/${item.id}`);
  }

  /** ISale: "Chọn nhiều" — bật/tắt chế độ chọn */
  toggleSelectMode() {
    this.selectMode.update((v) => !v);
    if (!this.selectMode()) this.selected.set(new Set());
  }

  toggleSelect(id: string) {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** ISale: xuất CSV các sản phẩm đang chọn */
  async bulkExport() {
    const ids = this.selected();
    try {
      const all = await this.productsService.list(this.search);
      const rows = all
        .filter((p) => ids.has(p.id))
        .map((p) => [
          p.name,
          p.sku ?? '',
          p.unit ?? '',
          this.csvExport.formatMoney(p.price),
          this.csvExport.formatMoney(p.cost),
          this.csvExport.formatMoney(p.stock),
          p.active ? 'Đang bán' : 'Ngừng bán',
          this.csvExport.formatDateTime(p.created_at),
        ]);
      this.csvExport.export('san-pham-da-chon', ['Tên', 'Mã SP', 'Đơn vị', 'Giá bán', 'Giá nhập', 'Tồn kho', 'Trạng thái', 'Ngày tạo'], rows);
      this.toast(`Đã xuất ${rows.length} sản phẩm`);
    } catch (e: any) {
      this.toast(e?.message ?? 'Xuất thất bại', 'danger');
    }
  }

  /** ISale: "Bạn sắp xóa {{count}} sản phẩm..." — xóa thật từng sản phẩm */
  async bulkDelete() {
    const count = this.selected().size;
    if (!count) {
      this.toast('Bạn chưa chọn sản phẩm nào để xóa cả', 'warning');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: `Xóa ${count} sản phẩm`,
      message:
        `Bạn sắp xóa ${count} sản phẩm. Tất cả giao dịch thuộc những sản phẩm này sẽ không bị xóa, tuy nhiên nội dung của chúng sẽ không thể khôi phục và hệ thống sẽ loại các sản phẩm này ra khỏi mọi báo cáo. Bạn có chắc muốn xóa?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: () => this.doBulkDelete(),
        },
      ],
    });
    await alert.present();
  }

  private async doBulkDelete() {
    const ids = [...this.selected()];
    let ok = 0;
    for (const id of ids) {
      try {
        await this.productsService.remove(id);
        ok++;
      } catch {
        /* bỏ qua SP lỗi, tiếp tục */
      }
    }
    this.selected.set(new Set());
    this.selectMode.set(false);
    this.toast(`Đã xóa ${ok}/${ids.length} sản phẩm`);
    await this.load();
  }

  openAdd() {
    this.router.navigateByUrl('/product/add');
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  openScan() {
    this.router.navigateByUrl('/scan');
  }

  openImport() {
    this.router.navigateByUrl('/import');
  }

  openSettings() {
    this.router.navigateByUrl('/config');
  }

  openPath(path: string) {
    this.router.navigateByUrl(path);
  }

  /** ISale: "Chọn Nhóm hàng" — chọn danh mục để lọc */
  async openCategoryMenu() {
    const categories = await this.productsService.listCategories();
    const buttons = [
      {
        text:
          'Tất cả nhóm hàng' +
          (this.categoryId() === null ? ' ✓' : ''),
        handler: () => this.applyCategory(null),
      },
      ...categories
        .filter((c) => c.id !== this.categoryId())
        .slice(0, 25)
        .map((c) => ({
          text: c.name + (this.categoryId() === c.id ? ' ✓' : ''),
          handler: () => this.applyCategory(c.id),
        })),
      { text: 'Hủy', role: 'cancel' as const },
    ];
    const sheet = await this.actionSheetCtrl.create({ header: 'Chọn Nhóm hàng', buttons });
    await sheet.present();
  }

  private async applyCategory(categoryId: string | null) {
    this.categoryId.set(categoryId);
    this.page.set(1);
    await this.load();
  }

  async toggleSerial(item: Product, ev: any) {
    const value = !!ev?.detail?.checked;
    try {
      await this.productsService.update(item.id, { serial_managed: value });
      this.items.update((list) => list.map((p) => (p.id === item.id ? { ...p, serial_managed: value } : p)));
    } catch (e: any) {
      this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
    }
  }

  async exportCsv() {
    try {
      const all = await this.productsService.list(this.search);
      const rows = all.map((p) => [
        p.name,
        p.sku ?? '',
        p.unit ?? '',
        this.csvExport.formatMoney(p.price),
        this.csvExport.formatMoney(p.cost),
        this.csvExport.formatMoney(p.stock),
        p.active ? 'Đang bán' : 'Ngừng bán',
        this.csvExport.formatDateTime(p.created_at),
      ]);
      this.csvExport.export('san-pham', ['Tên', 'Mã SP', 'Đơn vị', 'Giá bán', 'Giá nhập', 'Tồn kho', 'Trạng thái', 'Ngày tạo'], rows);
    } catch (e: any) {
      this.toast(e?.message ?? 'Xuất thất bại', 'danger');
    }
  }
  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  formatQty(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0);
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
