import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { addOutline, businessOutline, createOutline, walletOutline, trashOutline } from 'ionicons/icons';
import { SuppliersService, Supplier, SupplierDebt } from '../../core/services/suppliers.service';

@Component({
  selector: 'app-suppliers',
  templateUrl: './suppliers.page.html',
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class SuppliersPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private suppliersService = inject(SuppliersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly suppliers = signal<Supplier[]>([]);
  readonly debts = signal<SupplierDebt[]>([]);
  readonly loading = signal(true);
  search = '';

  readonly filtered = computed(() => {
    const q = this.search.trim().toLowerCase();
    const list = this.suppliers();
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q) || (s.phone ?? '').includes(q));
  });

  readonly debtBySupplier = computed(() => this.suppliersService.debtBySupplier(this.debts()));
  readonly totalDebt = computed(() => this.debts().reduce((s, d) => s + d.remaining, 0));

  constructor() {
    addIcons({ addOutline, businessOutline, createOutline, walletOutline, trashOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [suppliers, debts] = await Promise.all([this.suppliersService.list(), this.suppliersService.debts()]);
      this.suppliers.set(suppliers);
      this.debts.set(debts);
    } catch (e: any) {
      console.error('load suppliers failed', e);
      this.toast(e?.message ?? 'Tải nhà cung cấp thất bại', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  debtOf(id: string): { total: number; count: number } {
    return this.debtBySupplier().get(id) ?? { total: 0, count: 0 };
  }

  openDebts(supplier: Supplier) {
    this.router.navigateByUrl('/supplier-debts?supplier=' + supplier.id);
  }

  async addSupplier() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm nhà cung cấp',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên NCC *' },
        { name: 'phone', type: 'text', placeholder: 'Số điện thoại' },
        { name: 'note', type: 'text', placeholder: 'Ghi chú' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            const name = String(data.name ?? '').trim();
            if (!name) return false;
            try {
              const created = await this.suppliersService.create({
                name,
                phone: String(data.phone ?? '').trim() || null,
                note: String(data.note ?? '').trim() || null,
              });
              this.suppliers.set([...this.suppliers(), created].sort((a, b) => a.name.localeCompare(b.name)));
              this.toast(`Đã thêm NCC ${created.name}`);
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm NCC thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async editSupplier(supplier: Supplier, ev?: Event) {
    ev?.stopPropagation();
    const alert = await this.alertCtrl.create({
      header: 'Sửa nhà cung cấp',
      inputs: [
        { name: 'name', type: 'text', value: supplier.name, placeholder: 'Tên NCC *' },
        { name: 'phone', type: 'text', value: supplier.phone ?? '', placeholder: 'Số điện thoại' },
        { name: 'note', type: 'text', value: supplier.note ?? '', placeholder: 'Ghi chú' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            const name = String(data.name ?? '').trim();
            if (!name) return false;
            try {
              await this.suppliersService.update(supplier.id, {
                name,
                phone: String(data.phone ?? '').trim() || null,
                note: String(data.note ?? '').trim() || null,
              });
              this.suppliers.set(this.suppliers().map((s) => (s.id === supplier.id ? { ...s, name, phone: String(data.phone ?? '').trim() || null, note: String(data.note ?? '').trim() || null } : s)));
              this.toast('Đã lưu NCC');
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Lưu thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmDelete(supplier: Supplier, ev?: Event) {
    ev?.stopPropagation();
    const debt = this.debtOf(supplier.id);
    const alert = await this.alertCtrl.create({
      header: 'Xóa nhà cung cấp',
      message: debt.count > 0 ? `${supplier.name} còn ${debt.count} khoản nợ ${this.formatMoney(debt.total)}. Cần tất toán công nợ trước khi xóa.` : `Xóa ${supplier.name}?`,
      buttons: debt.count > 0 ? ['Đóng'] : [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.suppliersService.remove(supplier.id);
              this.suppliers.set(this.suppliers().filter((s) => s.id !== supplier.id));
              this.toast('Đã xóa NCC');
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
