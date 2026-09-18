import { Component, inject, signal } from '@angular/core';
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
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSegment,
  IonSegmentButton,
  IonNote,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, closeOutline } from 'ionicons/icons';
import { TransactionsService } from '../../core/services/transactions.service';
import { Transaction } from '../../core/models/models';

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
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSegment,
    IonSegmentButton,
    IonNote,
    FormsModule,
  ],
})
export class TradeAddPage {
  private router = inject(Router);
  private transactionsService = inject(TransactionsService);
  private toastCtrl = inject(ToastController);

  readonly busy = signal(false);

  type: 'income' | 'expense' = 'expense';
  amount: number | null = null;
  category = '';
  note = '';
  error = '';

  constructor() {
    addIcons({ saveOutline, closeOutline });
  }

  get categories(): string[] {
    return this.type === 'income'
      ? this.transactionsService.incomeCategories
      : this.transactionsService.expenseCategories;
  }

  onTypeChange(ev: CustomEvent) {
    this.type = ev.detail.value as 'income' | 'expense';
    this.category = '';
  }

  async save() {
    this.error = '';
    if (!this.amount || Number(this.amount) <= 0) {
      this.error = 'Vui lòng nhập số tiền.';
      return;
    }

    this.busy.set(true);
    try {
      await this.transactionsService.create({
        type: this.type,
        category: this.category || null,
        amount: Number(this.amount),
        note: this.note.trim() || null,
        occurred_at: new Date().toISOString(),
      });
      const t = await this.toastCtrl.create({
        message: 'Đã lưu giao dịch',
        duration: 1600,
        color: 'success',
        position: 'bottom',
      });
      await t.present();
      this.router.navigateByUrl('/trade', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu giao dịch thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    this.router.navigateByUrl('/trade', { replaceUrl: true });
  }
}
