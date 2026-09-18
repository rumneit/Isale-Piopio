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
  IonRefresher,
  IonRefresherContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonButton,
  IonNote,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  documentTextOutline,
  personOutline,
  cashOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { DataService } from '../../core/services/data.service';
import { Customer } from '../../core/models/models';

@Component({
  selector: 'app-debt',
  templateUrl: './debt.page.html',
  styleUrls: ['./debt.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonButton,
    IonNote,
  ],
})
export class DebtPage implements OnInit {
  private customersService = inject(CustomersService);
  private dataService = inject(DataService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Customer[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ documentTextOutline, personOutline, cashOutline, chevronForwardOutline });
  }

  get totalDebt(): number {
    return this.items().reduce((s, c) => s + Number(c.debt ?? 0), 0);
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.customersService.list('', true));
    } catch (e: any) {
      console.error('load debts failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  openCustomer(item: Customer) {
    this.router.navigateByUrl(`/contact/${item.id}`);
  }

  async collectDebt(customer: Customer) {
    const alert = await this.alertCtrl.create({
      header: `Thu nợ — ${customer.name}`,
      message: `Còn nợ: ${this.formatMoney(customer.debt)}`,
      inputs: [
        {
          name: 'amount',
          type: 'number',
          placeholder: 'Số tiền thu (₫)',
          min: 1,
          attributes: { inputmode: 'decimal' },
        },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thu nợ',
          handler: (data) => {
            const amount = Number(data?.amount ?? 0);
            if (!amount || amount <= 0) {
              this.toast('Số tiền không hợp lệ', 'danger');
              return false;
            }
            this.doCollect(customer, Math.min(amount, Number(customer.debt ?? 0)));
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async doCollect(customer: Customer, amount: number) {
    try {
      await this.customersService.addDebtPayment(customer, amount);
      this.toast(`Đã thu ${this.formatMoney(amount)} từ ${customer.name}`);
      await this.load();
      this.dataService.refreshHome();
    } catch (e: any) {
      this.toast(e?.message ?? 'Thu nợ thất bại', 'danger');
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}
