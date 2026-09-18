import { Component, OnInit, inject, signal } from '@angular/core';
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
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonNote,
  IonBackButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, searchOutline, pricetagsOutline, closeCircleOutline, downloadOutline } from 'ionicons/icons';
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
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
    IonBackButton,
  ],
})
export class ProductsPage implements OnInit {
  private productsService = inject(ProductsService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);

  readonly items = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly searching = signal(false);
  search = '';

  constructor() {
    addIcons({ addOutline, searchOutline, pricetagsOutline, closeCircleOutline, downloadOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.productsService.list(this.search));
    } catch (e: any) {
      console.error('load products failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    this.searching.set(true);
    try {
      this.items.set(await this.productsService.list(this.search));
    } finally {
      this.searching.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openDetail(item: Product) {
    this.router.navigateByUrl(`/product/${item.id}`);
  }

  openAdd() {
    this.router.navigateByUrl('/product/add');
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
    this.csvExport.export('san-pham', ['Tên', 'Mã SP', 'Đơn vị', 'Giá bán', 'Giá vốn', 'Tồn kho', 'Trạng thái', 'Ngày tạo'], rows);
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}
