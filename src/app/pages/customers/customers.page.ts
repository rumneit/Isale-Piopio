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
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  home,
  personAdd,
  apps,
  people,
  star,
  time,
  funnelOutline,
  searchOutline,
  callOutline,
  chatboxOutline,
  downloadOutline,
  cloudUploadOutline,
  gridOutline,
  settingsOutline,
  chevronForwardOutline,
  chevronBackOutline,
  sparklesOutline,
  addOutline,
  giftOutline,
} from 'ionicons/icons';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';
import { CustomersService } from '../../core/services/customers.service';
import { CsvExportService } from '../../core/services/csv-export.service';
import { Customer } from '../../core/models/models';

@Component({
  selector: 'app-customers',
  templateUrl: './customers.page.html',
  styleUrls: ['./customers.page.scss'],
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
export class CustomersPage implements OnInit {
  private customersService = inject(CustomersService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Customer[]>([]);
  readonly loading = signal(true);
  readonly searchVisible = signal(false);
  readonly tab = signal<'all' | 'important' | 'recent'>('recent');
  readonly page = signal(1);
  readonly pageSize = 20;
  search = '';

  readonly filtered = computed(() => {
    let list = this.items();
    if (this.tab() === 'important') list = list.filter((c) => !!c.important);
    if (this.tab() === 'recent') {
      list = [...list].sort((a, b) =>
        String(b.last_activity ?? b.created_at ?? '').localeCompare(String(a.last_activity ?? a.created_at ?? ''))
      );
    }
    return list;
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pagedItems = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  constructor() {
    addIcons({
      home,
      personAdd,
      apps,
      people,
      star,
      time,
      funnelOutline,
      searchOutline,
      callOutline,
      chatboxOutline,
      downloadOutline,
      cloudUploadOutline,
      gridOutline,
      settingsOutline,
      chevronForwardOutline,
      chevronBackOutline,
      sparklesOutline,
      addOutline,
      giftOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.customersService.list(this.search));
    } catch (e: any) {
      console.error('load customers failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
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

  selectTab(tab: 'all' | 'important' | 'recent') {
    this.tab.set(tab);
    this.page.set(1);
  }

  nextPage() {
    if (this.page() < this.totalPages()) this.page.update((p) => p + 1);
  }

  prevPage() {
    if (this.page() > 1) this.page.update((p) => p - 1);
  }

  openDetail(item: Customer) {
    this.router.navigateByUrl(`/contact/detail/${item.id}`);
  }

  openAdd() {
    this.router.navigateByUrl('/contact/add');
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  openImport() {
    this.router.navigateByUrl('/import');
  }

  openSettings() {
    this.router.navigateByUrl('/config');
  }

  callCustomer(ev: Event, item: Customer) {
    ev.stopPropagation();
    if (item.phone) {
      window.open(`tel:${item.phone}`, '_self');
    }
  }

  chatCustomer(ev: Event, item: Customer) {
    ev.stopPropagation();
    if (item.phone) {
      window.open(`https://zalo.me/${item.phone.replace(/\D/g, '')}`, '_blank');
    }
  }

  async toggleImportant(item: Customer, ev: any) {
    const value = !!ev?.detail?.checked;
    try {
      await this.customersService.update(item.id, { important: value });
      this.items.update((list) => list.map((c) => (c.id === item.id ? { ...c, important: value } : c)));
      this.toast(value ? 'Đã đánh dấu quan trọng' : 'Đã bỏ đánh dấu quan trọng');
    } catch (e: any) {
      this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
    }
  }

  exportCsv() {
    const rows = this.filtered().map((c) => [
      c.name,
      c.phone ?? '',
      c.gender ?? '',
      c.address ?? '',
      this.csvExport.formatMoney(c.debt),
      this.csvExport.formatDateTime(c.last_activity ?? c.created_at),
    ]);
    this.csvExport.export('khach-hang', ['Tên', 'SĐT', 'Giới tính', 'Địa chỉ', 'Công nợ', 'Hoạt động cuối'], rows);
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
