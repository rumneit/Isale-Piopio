import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonButton,
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
  swapHorizontalOutline,
} from 'ionicons/icons';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { MoneyAccount } from '../../core/models/models';

@Component({
  selector: 'app-money-accounts',
  templateUrl: './money-accounts.page.html',
  styleUrls: ['./money-accounts.page.scss'],
  imports: [
    IonButton,
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
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly accountsService = inject(MoneyAccountsService);
  private transactionsService = inject(TransactionsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<MoneyAccount[]>([]);
  readonly loading = signal(true);
  /** Số dư thực (số dư khai báo + giao dịch) theo account_id */
  readonly liveBalances = signal<Map<string, number>>(new Map());

  constructor() {
    addIcons({
      addOutline,
      walletOutline,
      cashOutline,
      cardOutline,
      phonePortraitOutline,
      createOutline,
      trashOutline,
      swapHorizontalOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.accountsService.list());
      try {
        this.liveBalances.set(await this.transactionsService.accountBalances());
      } catch {
        this.liveBalances.set(new Map());
      }
    } catch (e: any) {
      console.error('load accounts failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  liveBalance(account: MoneyAccount): number {
    const map = this.liveBalances();
    return map.has(account.id) ? map.get(account.id)! : Number(account.balance ?? 0);
  }

  get totalBalance(): number {
    return this.items().reduce((s, a) => s + this.liveBalance(a), 0);
  }

  // ================= Chuyển tiền nội bộ (ISale money-account-transfer) =================

  async openTransfer() {
    const accounts = this.items();
    if (accounts.length < 2) {
      this.toast('Cần ít nhất 2 sổ tiền để chuyển khoản nội bộ', 'warning');
      return;
    }
    const from = await this.pickAccount('Chuyển từ sổ nào?');
    if (!from) return;
    const to = await this.pickAccount('Chuyển đến sổ nào?', from.id);
    if (!to) return;

    const alert = await this.alertCtrl.create({
      header: 'Chuyển tiền nội bộ',
      message: `Từ "${from.name}" sang "${to.name}"`,
      inputs: [
        { name: 'amount', type: 'number', placeholder: 'Số tiền (₫) *' },
        { name: 'fee', type: 'number', placeholder: 'Phí chuyển (₫, 0 nếu miễn)', value: '0' },
        { name: 'note', type: 'text', placeholder: 'Ghi chú (tùy chọn)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Chuyển',
          handler: async (data) => {
            const amount = Number(data?.amount ?? 0);
            const fee = Number(data?.fee ?? 0);
            if (!amount || amount <= 0) {
              this.toast('Số tiền chuyển cần lớn hơn 0', 'danger');
              return false;
            }
            if (fee < 0) {
              this.toast('Phí chuyển không hợp lệ', 'danger');
              return false;
            }
            try {
              await this.transactionsService.transferMoney(from.id, to.id, amount, fee, (data?.note ?? '').trim() || undefined);
              this.toast(`Đã chuyển ${this.formatMoney(amount)} từ ${from.name} sang ${to.name}${fee > 0 ? ` (phí ${this.formatMoney(fee)})` : ''}`);
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Chuyển tiền thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async pickAccount(header: string, excludeId?: string): Promise<MoneyAccount | null> {
    const options = this.items().filter((a) => a.id !== excludeId);
    const alert = await this.alertCtrl.create({
      header,
      inputs: options.map((a, i) => ({
        name: 'account',
        type: 'radio' as const,
        label: `${a.name} (${this.formatMoney(this.liveBalance(a))})`,
        value: a.id,
        checked: i === 0,
      })),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Chọn', handler: (data) => !!data?.account },
      ],
    });
    await alert.present();
    const { data } = await alert.onWillDismiss();
    return options.find((a) => a.id === data?.account) ?? null;
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
