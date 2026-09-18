import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonNote,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  walletOutline,
  cashOutline,
  cardOutline,
  phonePortraitOutline,
  createOutline,
  trashOutline,
} from 'ionicons/icons';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';
import { MoneyAccount } from '../../core/models/models';

@Component({
  selector: 'app-money-accounts',
  templateUrl: './money-accounts.page.html',
  styleUrls: ['./money-accounts.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
  ],
})
export class MoneyAccountsPage implements OnInit {
  readonly accountsService = inject(MoneyAccountsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<MoneyAccount[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({
      addOutline,
      walletOutline,
      cashOutline,
      cardOutline,
      phonePortraitOutline,
      createOutline,
      trashOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.accountsService.list());
    } catch (e: any) {
      console.error('load accounts failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  get totalBalance(): number {
    return this.items().reduce((s, a) => s + Number(a.balance ?? 0), 0);
  }

  typeIcon(type: string): string {
    switch (type) {
      case 'bank':
        return 'card-outline';
      case 'e-wallet':
        return 'phone-portrait-outline';
      default:
        return 'cash-outline';
    }
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm sổ tiền',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên sổ (VD: Vietcombank)' },
        {
          name: 'type',
          type: 'radio',
          label: 'Tiền mặt',
          value: 'cash',
          checked: true,
        },
        { name: 'type', type: 'radio', label: 'Ngân hàng', value: 'bank' },
        { name: 'type', type: 'radio', label: 'Ví điện tử', value: 'e-wallet' },
        { name: 'balance', type: 'number', placeholder: 'Số dư ban đầu (₫)', value: '0' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên sổ tiền', 'danger');
              return false;
            }
            try {
              await this.accountsService.create(data.name, data.type ?? 'cash', Number(data.balance ?? 0));
              this.toast('Đã thêm sổ tiền');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async openEdit(account: MoneyAccount) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa sổ tiền',
      inputs: [
        { name: 'name', type: 'text', value: account.name, placeholder: 'Tên sổ' },
        {
          name: 'type',
          type: 'radio',
          label: 'Tiền mặt',
          value: 'cash',
          checked: account.type === 'cash',
        },
        { name: 'type', type: 'radio', label: 'Ngân hàng', value: 'bank', checked: account.type === 'bank' },
        { name: 'type', type: 'radio', label: 'Ví điện tử', value: 'e-wallet', checked: account.type === 'e-wallet' },
        { name: 'balance', type: 'number', value: String(account.balance ?? 0), placeholder: 'Số dư (₫)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: () => {
            this.doDelete(account);
            return true;
          },
        },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Tên không được trống', 'danger');
              return false;
            }
            try {
              await this.accountsService.update(account.id, {
                name: data.name.trim(),
                type: data.type ?? account.type,
                balance: Number(data.balance ?? 0),
              });
              this.toast('Đã lưu');
              await this.load();
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

  private async doDelete(account: MoneyAccount) {
    try {
      await this.accountsService.remove(account.id);
      this.toast('Đã xóa sổ tiền');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
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
