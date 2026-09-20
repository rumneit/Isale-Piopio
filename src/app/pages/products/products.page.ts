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
  ToastController,
  ActionSheetController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  barcodeOutline,
  addCircleOutline,
  appsOutline,
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
  giftOutline,
} from 'ionicons/icons';
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
  ],
})
export class ProductsPage implements OnInit {
  private productsService = inject(ProductsService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);

  readonly items = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly searchVisible = signal(false);
  readonly page = signal(1);
  readonly pageSize = 20;
  search = '';
  sortBy = signal<'recent' | 'name' | 'price'>('recent');

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.items().length / this.pageSize)));
  readonly pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.items().slice(start, start + this.pageSize);
  });

  readonly freePlanLimits = [
    'Tạo dưới 10 đơn/ngày.',
    'Không thể nhập thêm sản phẩm nếu đã có trên 30 sản phẩm.',
    'Không thể quản lý nhiều shop/kho.',
    'Không thể quản lý fanpage Facebook/Zalo và một số tính năng khác.',
    'Quảng cáo (chỉ một banner nhỏ dưới app).',
  ];

  constructor() {
    addIcons({
      homeOutline,
      barcodeOutline,
      addCircleOutline,
      appsOutline,
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
      giftOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.productsService.list(this.search);
      this.items.set(this.applySort(list));
    } catch (e: any) {
      console.error('load products failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private applySort(list: Product[]): Product[] {
    const arr = [...list];
    switch (this.sortBy()) {
      case 'name':
        return arr.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      case 'price':
        return arr.sort((a, b) => Number(b.price) - Number(a.price));
      default:
        return arr.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    }
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
    if (this.page() < this.totalPages()) this.page.update((p) => p + 1);
  }

  prevPage() {
    if (this.page() > 1) this.page.update((p) => p - 1);
  }

  openDetail(item: Product) {
    this.router.navigateByUrl(`/product/${item.id}`);
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

  async openSortMenu() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Lọc theo',
      buttons: [
        {
          text: 'Gần đây' + (this.sortBy() === 'recent' ? ' ✓' : ''),
          handler: () => {
            this.sortBy.set('recent');
            this.load();
          },
        },
        {
          text: 'Tên A → Z' + (this.sortBy() === 'name' ? ' ✓' : ''),
          handler: () => {
            this.sortBy.set('name');
            this.load();
          },
        },
        {
          text: 'Giá cao → thấp' + (this.sortBy() === 'price' ? ' ✓' : ''),
          handler: () => {
            this.sortBy.set('price');
            this.load();
          },
        },
        { text: 'Hủy', role: 'cancel' },
      ],
    });
    await sheet.present();
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

  exportCsv() {
    const rows = this.items().map((p) => [
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
