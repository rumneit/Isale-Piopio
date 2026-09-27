import { Component, inject, signal, Input, OnInit } from '@angular/core';
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
  IonSpinner,
  IonList,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonNote,
  ModalController,
  ToastController,
  AlertController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  saveOutline,
  closeOutline,
  homeOutline,
  addOutline,
  imageOutline,
  closeCircle,
} from 'ionicons/icons';
import { TransactionsService } from '../../core/services/transactions.service';
import { MoneyAccountsService } from '../../core/services/money-accounts.service';
import { Transaction } from '../../core/models/models';

interface PendingReceipt {
  file: File;
  previewUrl: string;
}

@Component({
  selector: 'app-trade-add',
  templateUrl: './trade-add.page.html',
  styleUrls: ['./trade-add.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonNote,
    FormsModule,
  ],
})
export class TradeAddPage implements OnInit {
  /** Dùng như modal (FAB từ trang danh sách) thay vì trang route */
  @Input() asModal = false;
  /** Truyền vào khi sửa giao dịch */
  @Input() editTarget: Transaction | null = null;

  openHome() {
    if (this.asModal) return;
    this.router.navigateByUrl('/home');
  }

  private router = inject(Router);
  private transactionsService = inject(TransactionsService);
  private accountsService = inject(MoneyAccountsService);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  readonly busy = signal(false);
  readonly categories = signal<string[]>([]);

  type: 'income' | 'expense' = 'income';
  amount: number | null = null;
  category = '';
  note = '';
  occurredDate = '';
  accountId = '';
  paymentType = 'CASH';
  existingImages: string[] = [];
  readonly pendingReceipts = signal<PendingReceipt[]>([]);
  readonly accounts = signal<Array<{ id: string; name: string }>>([]);
  error = '';

  constructor() {
    addIcons({ saveOutline, closeOutline, homeOutline, addOutline, imageOutline, closeCircle });
  }

  get isEdit(): boolean {
    return !!this.editTarget;
  }

  /** Cho template (field private không truy cập được từ template) */
  get paymentTypes() {
    return this.transactionsService.paymentTypes;
  }

  get pageTitle(): string {
    return this.isEdit ? 'Sửa giao dịch' : 'Thêm giao dịch';
  }

  async ngOnInit(): Promise<void> {
    if (this.editTarget) {
      const t = this.editTarget;
      this.type = t.type;
      this.amount = Number(t.amount ?? 0);
      this.category = t.category ?? '';
      this.note = t.note ?? '';
      this.accountId = t.account_id ?? '';
      this.paymentType = t.payment_type ?? 'CASH';
      this.existingImages = [...(t.image_urls ?? [])];
      const d = new Date(t.occurred_at);
      this.occurredDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      const now = new Date();
      this.occurredDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    await Promise.all([this.loadCategories(), this.loadAccounts()]);
  }

  private async loadCategories() {
    try {
      const cats = await this.transactionsService.listCategories(this.type);
      const dynamic = cats.map((c) => c.title);
      const fallback = this.type === 'income' ? this.transactionsService.incomeCategories : this.transactionsService.expenseCategories;
      const merged = [...new Set([...dynamic, ...fallback])];
      this.categories.set(merged);
      if (this.category && !merged.includes(this.category)) this.category = '';
    } catch {
      this.categories.set(this.type === 'income' ? this.transactionsService.incomeCategories : this.transactionsService.expenseCategories);
    }
  }

  private async loadAccounts() {
    try {
      const list = await this.accountsService.list();
      this.accounts.set(list.map((a) => ({ id: a.id, name: a.name })));
      if (!this.editTarget && !this.accountId && list.length === 1) {
        this.accountId = list[0].id;
      }
    } catch {
      this.accounts.set([]);
    }
  }

  onTypeChange(ev: CustomEvent) {
    this.type = ev.detail.value as 'income' | 'expense';
    this.category = '';
    this.loadCategories();
  }

  /** ISale trade-add .00/.000: nhân nhanh số tiền */
  appendZeros(zeros: number) {
    const cur = Number(this.amount ?? 0);
    if (!cur) return;
    this.amount = cur * Math.pow(10, zeros);
  }

  async promptAddCategory() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm mục mới',
      inputs: [{ name: 'title', type: 'text', placeholder: `Tên mục ${this.type === 'income' ? 'thu' : 'chi'}` }],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            const title = (data?.title ?? '').trim();
            if (!title) return false;
            try {
              await this.transactionsService.createCategory(title, this.type);
              await this.loadCategories();
              this.category = title;
              this.toast('Đã thêm mục');
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm mục thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  onFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const f of files) {
      if (this.pendingReceipts().length + this.existingImages.length >= 10) {
        this.toast('Tối đa 10 ảnh biên lai', 'danger');
        break;
      }
      if (!f.type.startsWith('image/')) continue;
      this.pendingReceipts.update((list) => [...list, { file: f, previewUrl: URL.createObjectURL(f) }]);
    }
  }

  removePending(index: number) {
    const list = [...this.pendingReceipts()];
    const [removed] = list.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    this.pendingReceipts.set(list);
  }

  removeExisting(index: number) {
    this.existingImages = this.existingImages.filter((_, i) => i !== index);
  }

  async save() {
    const amount = Number(this.amount ?? 0);
    if (!amount || amount <= 0) {
      this.error = 'Số tiền phải lớn hơn 0.';
      this.toast(this.error, 'danger');
      return;
    }
    if (amount >= 1e13) {
      this.error = 'Số tiền quá lớn.';
      this.toast(this.error, 'danger');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.occurredDate)) {
      this.error = 'Ngày tạo không hợp lệ.';
      this.toast(this.error, 'danger');
      return;
    }
    this.error = '';
    this.busy.set(true);
    try {
      // Upload ảnh biên lai (nén canvas trước khi lên Storage)
      const uploadedUrls: string[] = [];
      for (const p of this.pendingReceipts()) {
        uploadedUrls.push(await this.transactionsService.uploadReceipt(p.file));
      }
      const finalImages = [...this.existingImages, ...uploadedUrls];

      const [y, m, d] = this.occurredDate.split('-').map(Number);
      const occurred = new Date(y, m - 1, d, 12).toISOString();

      if (this.editTarget) {
        await this.transactionsService.update(this.editTarget.id, {
          type: this.type,
          category: this.category.trim() || null,
          amount,
          note: this.note.trim() || null,
          occurred_at: occurred,
          account_id: this.accountId || null,
          payment_type: this.paymentType,
          image_urls: finalImages,
        });
      } else {
        const created = await this.transactionsService.create({
          type: this.type,
          category: this.category.trim() || null,
          amount,
          note: this.note.trim() || null,
          occurred_at: occurred,
          account_id: this.accountId || null,
          payment_type: this.paymentType,
          source: 'manual',
          image_urls: finalImages.length ? finalImages : [],
        });
        void created;
      }
      this.toast(this.isEdit ? 'Đã cập nhật giao dịch' : 'Đã thêm giao dịch');
      if (this.asModal) {
        await this.modalCtrl.dismiss({ saved: true });
      } else {
        this.router.navigateByUrl('/trade', { replaceUrl: true });
      }
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu thất bại';
      this.toast(this.error, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    if (this.asModal) {
      this.modalCtrl.dismiss(null);
    } else {
      this.router.navigateByUrl('/trade', { replaceUrl: true });
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
