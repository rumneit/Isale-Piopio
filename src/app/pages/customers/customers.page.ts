import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonRefresher, IonRefresherContent, IonSearchbar, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { apps, callOutline, chevronBackOutline, chevronForwardOutline, closeOutline, cloudUploadOutline, downloadOutline, filterOutline, home, people, personAdd, searchOutline, star, time } from 'ionicons/icons';
import { Customer, CustomerGroup } from '../../core/models/models';
import { CsvExportService } from '../../core/services/csv-export.service';
import { CustomerFilters, CustomersService } from '../../core/services/customers.service';
import { FabTrioComponent } from '../../shared/fab-trio/fab-trio.component';

@Component({
  selector: 'app-customers', templateUrl: './customers.page.html', styleUrls: ['./customers.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSearchbar, IonRefresher, IonRefresherContent, IonMenuButton, FabTrioComponent],
})
export class CustomersPage implements OnInit {
  private readonly customers = inject(CustomersService);
  private readonly csv = inject(CsvExportService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  readonly items = signal<Customer[]>([]);
  readonly groups = signal<CustomerGroup[]>([]);
  readonly loading = signal(true);
  readonly filterOpen = signal(false);
  readonly tab = signal<'all' | 'important' | 'recent'>('recent');
  readonly selected = signal<Set<string>>(new Set());
  readonly page = signal(1);
  readonly pageSize = 20;
  readonly total = signal(0);
  search = '';
  debtMin: number | null = null;
  groupId = '';
  status = '';
  tier = '';
  createdFrom = '';
  createdTo = '';
  sortBy: CustomerFilters['sortBy'] = 'created_at';
  sortDirection: CustomerFilters['sortDirection'] = 'desc';
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  readonly allSelected = computed(() => !!this.items().length && this.items().every((item) => this.selected().has(item.id)));
  readonly hasFilters = computed(() => this.debtMin != null || !!this.groupId || !!this.status || !!this.tier || !!this.createdFrom || !!this.createdTo);

  constructor() { addIcons({ home, personAdd, apps, people, star, time, filterOutline, searchOutline, callOutline, downloadOutline, cloudUploadOutline, chevronBackOutline, chevronForwardOutline, closeOutline }); }
  ngOnInit(): void { void Promise.all([this.load(), this.customers.groups().then((v) => this.groups.set(v)).catch(() => undefined)]); }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.customers.listAdvanced({
        q: this.search, debtMin: this.debtMin, groupId: this.groupId || null, status: this.status || null,
        tier: this.tier || null, createdFrom: this.createdFrom || null, createdTo: this.createdTo || null,
        important: this.tab() === 'important' ? true : null,
        sortBy: this.tab() === 'recent' ? 'last_activity' : this.sortBy,
        sortDirection: this.tab() === 'recent' ? 'desc' : this.sortDirection,
        page: this.page(), pageSize: this.pageSize,
      });
      this.items.set(result.items); this.total.set(result.total); this.selected.set(new Set());
    } catch (error: any) { this.items.set([]); this.total.set(0); await this.toast(error?.message ?? 'Không tải được khách hàng.', 'danger'); }
    finally { this.loading.set(false); }
  }
  async onSearch(event: CustomEvent): Promise<void> { this.search = String((event.detail as any).value ?? ''); this.page.set(1); await this.load(); }
  selectTab(value: 'all' | 'important' | 'recent'): void { this.tab.set(value); this.page.set(1); void this.load(); }
  applyFilters(): void { this.page.set(1); this.filterOpen.set(false); void this.load(); }
  clearFilters(): void { this.debtMin = null; this.groupId = ''; this.status = ''; this.tier = ''; this.createdFrom = ''; this.createdTo = ''; this.sortBy = 'created_at'; this.sortDirection = 'desc'; this.applyFilters(); }
  doRefresh(event: CustomEvent): void { this.load().finally(() => (event.target as HTMLIonRefresherElement).complete()); }
  nextPage(): void { if (this.page() < this.totalPages()) { this.page.update((v) => v + 1); void this.load(); } }
  prevPage(): void { if (this.page() > 1) { this.page.update((v) => v - 1); void this.load(); } }
  toggleOne(id: string, checked: boolean): void { this.selected.update((old) => { const next = new Set(old); checked ? next.add(id) : next.delete(id); return next; }); }
  toggleAll(checked: boolean): void { this.selected.set(checked ? new Set(this.items().map((item) => item.id)) : new Set()); }
  openDetail(item: Customer): void { void this.router.navigateByUrl(`/contact/detail/${item.id}`); }
  openAdd(): void { void this.router.navigateByUrl('/contact/add'); }
  openHome(): void { void this.router.navigateByUrl('/home'); }
  openImport(): void { void this.router.navigateByUrl('/import'); }
  openSettings(): void { void this.router.navigateByUrl('/custom-field'); }
  call(event: Event, customer: Customer): void { event.stopPropagation(); if (customer.phone) window.open(`tel:${customer.phone}`, '_self'); }
  formatMoney(value: number | null | undefined): string { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value ?? 0)); }
  groupName(customer: Customer): string { return customer.customer_group_name || this.groups().find((group) => group.id === customer.customer_group_id)?.name || 'Chưa phân nhóm'; }
  statusLabel(status: Customer['status']): string { return ({ lead: 'Tiềm năng', active: 'Hoạt động', inactive: 'Ngừng hoạt động' } as any)[status ?? 'active'] ?? 'Hoạt động'; }
  tierLabel(tier: Customer['tier']): string { return ({ bronze: 'Đồng', silver: 'Bạc', gold: 'Vàng' } as any)[tier ?? 'bronze'] ?? 'Đồng'; }
  initial(name: string): string { return name.trim().charAt(0).toUpperCase() || '?'; }
  exportCsv(): void {
    const rows = this.items().map((c) => [c.code ?? '', c.name, c.phone ?? '', c.email ?? '', this.groupName(c), c.debt ?? 0, c.total_spending ?? 0, c.points ?? 0, this.statusLabel(c.status), this.tierLabel(c.tier), c.created_at ?? '']);
    this.csv.export('khach-hang', ['Mã KH', 'Họ tên', 'SĐT', 'Email', 'Nhóm', 'Công nợ', 'Tổng chi tiêu', 'Điểm', 'Trạng thái', 'Hạng', 'Ngày tạo'], rows);
  }
  private async toast(message: string, color = 'success'): Promise<void> { const toast = await this.toastCtrl.create({ message, color, duration: 2200, position: 'bottom' }); await toast.present(); }
}
