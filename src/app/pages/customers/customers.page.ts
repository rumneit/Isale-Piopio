import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
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
  IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, peopleOutline, callOutline, downloadOutline } from 'ionicons/icons';
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
    IonBackButton,
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
    IonButton,
  ],
})
export class CustomersPage implements OnInit {
  private customersService = inject(CustomersService);
  private csvExport = inject(CsvExportService);
  private router = inject(Router);

  readonly items = signal<Customer[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, peopleOutline, callOutline, downloadOutline });
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
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openDetail(item: Customer) {
    this.router.navigateByUrl(`/contact/${item.id}`);
  }

  openAdd() {
    this.router.navigateByUrl('/contact/add');
  }

  exportCsv() {
    const rows = this.items().map((c) => [
      c.name,
      c.phone ?? '',
      c.email ?? '',
      c.address ?? '',
      this.csvExport.formatMoney(c.debt),
      this.csvExport.formatDateTime(c.created_at),
    ]);
    this.csvExport.export('khach-hang', ['Tên', 'SĐT', 'Email', 'Địa chỉ', 'Công nợ', 'Ngày tạo'], rows);
  }

  initial(name: string): string {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}
