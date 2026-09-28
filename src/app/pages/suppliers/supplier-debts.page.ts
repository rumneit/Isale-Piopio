import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, cashOutline, timeOutline, businessOutline, syncOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { SuppliersService, SupplierDebt } from '../../core/services/suppliers.service';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';
import { MoneyAccount } from '../../core/models/models';

@Component({
  selector: 'app-supplier-debts',
  templateUrl: './supplier-debts.page.html',
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
    IonSegment,
    IonSegmentButton,
  ],
})
export class SupplierDebtsPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private suppliersService = inject(SuppliersService);
  private accountsService = inject(MoneyAccountsService);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  readonly debts = signal<SupplierDebt[]>([]);
  readonly accounts = signal<MoneyAccount[]>([]);
  readonly loading = signal(true);
  readonly filter = signal<'all' | 'overdue'>('all');
  supplierFilter: string | null = null;

  readonly filtered = computed(() => {
    const list = this.debts();
    if (this.filter() === 'overdue') return list.filter((d) => this.isOverdue(d));
    return list;
  });
  readonly totalRemaining = computed(() => this.filtered().reduce((s, d) => s + d.remaining, 0));
  readonly overdueCount = computed(() => this.debts().filter((d) => this.isOverdue(d)).length);

  constructor() {
    addIcons({ alertCircleOutline, cashOutline, timeOutline, businessOutline, syncOutline, checkmarkCircleOutline });
  }

  async ngOnInit(): Promise<void> {
    this.supplierFilter = this.route.snapshot.queryParamMap.get('supplier') ?? null;
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [debts, accounts] = await Promise.all([this.suppliersService.debts(), this.accountsService.list().catch(() => [])]);
      this.debts.set(debts);
      this.accounts.set(accounts);
    } catch (e: any) {
      console.error('load supplier debts failed', e);
      this.toast(e?.message ?? 'Tải công nợ thất bại', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  onFilter(ev: CustomEvent) {
    this.filter.set((ev.detail as any).value ?? 'all');
  }

  isOverdue(d: SupplierDebt): boolean {
    if (!d.due_date) return false;
    const today = new Date().toISOString().slice(0, 10);
    return d.due_date < today;
  }

  dueLabel(d: SupplierDebt): string {
    if (!d.due_date) return 'Không có hạn';
    const dt = new Date(d.due_date + 'T00:00:00');
    return `Hạn ${dt.toLocaleDateString('vi-VN')}${this.isOverdue(d) ? ' (quá hạn)' : ''}`;
  }

  /** Trả tiền: chọn số tiền + ghi chú + ví (tùy chọn) */
  async pay(debt: SupplierDebt) {
    const alert = await this.alertCtrl.create({
      header: `Trả nợ ${debt.supplier_name}`,
      message: `${debt.received_code ?? ''} · Còn ${this.formatMoney(debt.remaining)}`,
      inputs: [
        { name: 'amount', type: 'number', value: String(debt.remaining), min: 1, max: debt.remaining, placeholder: 'Số tiền trả *' },
        { name: 'note', type: 'text', placeholder: 'Ghi chú (tùy chọn)' },
        ...this.accounts().map((a, i) => ({
          name: 'account',
          type: 'radio' as const,
          label: `${a.name} (${this.accountsService.typeLabel(a.type)})`,
          value: a.id,
          checked: i === 0,
        })),
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xác nhận trả',
          handler: async (data) => {
            const amount = Number(data.amount);
            if (!amount || amount <= 0) {
              this.toast('Số tiền phải lớn hơn 0', 'danger');
              return false;
            }
            try {
              await this.suppliersService.payDebt(debt.id, Math.min(amount, debt.remaining), data.account ?? null, String(data.note ?? '').trim() || null);
              this.toast(`Đã ghi chi ${this.formatMoney(Math.min(amount, debt.remaining))}`);
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Trả nợ thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /** Lịch sử các lần trả của khoản nợ */
  async openPayments(debt: SupplierDebt, ev?: Event) {
    ev?.stopPropagation();
    try {
      const rows = await this.suppliersService.debtPayments(debt.id);
      const body = rows.length
        ? rows
            .map((r) => `${new Date(r.occurred_at).toLocaleString('vi-VN')} · ${this.formatMoney(r.amount)}${r.note ? ' · ' + r.note : ''}`)
            .join('\n')
        : 'Chưa có lần trả nào.';
      const alert = await this.alertCtrl.create({
        header: `Lịch sử trả — ${debt.supplier_name}`,
        message: `<pre style="white-space:pre-wrap;font-size:12px;margin:0">${body}</pre>`,
        buttons: ['Đóng'],
      });
      await alert.present();
    } catch (e: any) {
      this.toast(e?.message ?? 'Tải lịch sử thất bại', 'danger');
    }
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
