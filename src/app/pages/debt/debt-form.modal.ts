import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonNote,
  IonSpinner,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, saveOutline } from 'ionicons/icons';
import { DEBT_TYPES, Loan, LoanType } from '../../core/services/loans.service';

/** yyyy-MM-dd -> ISO (giua ngay, tranh le mui gio); rong/loi -> null */
function toIsoOrNull(dateStr: string): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** ISO -> yyyy-MM-dd cho input type=date */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Form Them/Sua vay-no dong bo ISale (debt-add):
 * doi tac, so tien, kieu vay/no (4 loai), muc, ngay tao, ngay den han,
 * lai suat %, da tra?, ghi chu.
 */
@Component({
  selector: 'app-debt-form-modal',
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonNote,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">
            <ion-icon slot="icon-only" name="close-outline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ isEdit ? 'Sửa vay/nợ' : 'Thêm vay/nợ' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="save()" [disabled]="busy">
            @if (busy) {
              <ion-spinner name="crescent" />
            } @else {
              Lưu
            }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="app-page">
      <div class="app-page-container">
        @if (error) {
          <div class="form-error">{{ error }}</div>
        }
        <div class="app-card">
          <ion-list lines="full">
            <ion-item>
              <ion-select
                label="Kiểu vay/nợ"
                labelPlacement="stacked"
                interface="action-sheet"
                [cancelText]="'Hủy'"
                [(ngModel)]="type"
              >
                @for (t of debtTypes; track t.value) {
                  <ion-select-option [value]="t.value">{{ t.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input
                label="Tên người/đối tác *"
                labelPlacement="stacked"
                placeholder="VD: Nguyễn Văn A"
                [(ngModel)]="party"
              />
            </ion-item>
            <ion-item>
              <ion-input
                label="Số tiền (₫)"
                labelPlacement="stacked"
                type="number"
                inputmode="numeric"
                placeholder="0"
                [(ngModel)]="amount"
              />
            </ion-item>
            <ion-item>
              <ion-input
                label="Mục"
                labelPlacement="stacked"
                placeholder="VD: vay nóng, nợ đợt 1..."
                [(ngModel)]="category"
              />
            </ion-item>
            <ion-item>
              <ion-input
                label="Lãi suất (%)"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                placeholder="0"
                [(ngModel)]="interestRate"
              />
              <ion-note slot="end">%/tháng</ion-note>
            </ion-item>
            <ion-item>
              <ion-input label="Ngày tạo" labelPlacement="stacked" type="date" [(ngModel)]="occurredDate" />
            </ion-item>
            <ion-item>
              <ion-input label="Ngày đến hạn" labelPlacement="stacked" type="date" [(ngModel)]="maturityDate" />
            </ion-item>
            <ion-item>
              <ion-toggle [(ngModel)]="paid">Đã trả?</ion-toggle>
            </ion-item>
            <ion-item>
              <ion-input
                label="Mô tả ngắn / ghi chú"
                labelPlacement="stacked"
                placeholder="Nhập mô tả ngắn"
                [(ngModel)]="note"
              />
            </ion-item>
          </ion-list>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* Ionic gan class .ion-page len host modal nhung core CSS khong ap dung
         trong app nay -> tu don lay out full-height nhu .ion-page chuan */
      :host {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        background: var(--app-page-bg);
      }

      ion-content {
        flex: 1 1 0%;
        --background: var(--app-page-bg);
      }

      .form-error {
        margin: 12px 16px 0;
        padding: 10px 12px;
        border-radius: 10px;
        background: #fdecea;
        color: #b71c1c;
        font-size: 0.9rem;
      }
    `,
  ],
})
export class DebtFormModalComponent implements OnInit {
  private modalCtrl = inject(ModalController);

  readonly debtTypes = DEBT_TYPES;
  /** Truyen tu componentProps: khoa can sua */
  loan?: Partial<Loan>;
  isEdit = false;
  busy = false;
  error = '';

  party = '';
  amount: number | null = null;
  type: LoanType = 'receivable';
  category = '';
  interestRate: number | null = null;
  occurredDate = toDateInput(new Date().toISOString());
  maturityDate = '';
  paid = false;
  note = '';

  ngOnInit(): void {
    addIcons({ closeOutline, saveOutline });
    if (this.loan) this.load(this.loan);
  }

  /** componentProps truyen tu page mo modal */
  load(loan?: Partial<Loan>): void {
    if (!loan) return;
    this.isEdit = true;
    this.party = loan.party_name ?? '';
    this.amount = loan.amount != null ? Number(loan.amount) : null;
    this.type = (loan.type ?? 'receivable') as LoanType;
    this.category = loan.category ?? '';
    this.interestRate = loan.interest_rate != null ? Number(loan.interest_rate) : null;
    this.occurredDate = toDateInput(loan.occurred_at) || toDateInput(new Date().toISOString());
    this.maturityDate = toDateInput(loan.maturity_date);
    this.paid = !!loan.paid;
    this.note = loan.note ?? '';
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  async save(): Promise<void> {
    if (!this.party.trim()) {
      this.error = 'Vui lòng nhập tên người/đối tác.';
      return;
    }
    if (!this.amount || Number(this.amount) <= 0) {
      this.error = 'Vui lòng nhập số tiền lớn hơn 0.';
      return;
    }
    this.error = '';
    this.busy = true;
    const payload: Partial<Loan> = {
      type: this.type,
      party_name: this.party.trim(),
      amount: Number(this.amount),
      category: this.category.trim() || null,
      interest_rate: this.interestRate != null && !isNaN(Number(this.interestRate)) ? Number(this.interestRate) : null,
      occurred_at: toIsoOrNull(this.occurredDate) ?? new Date().toISOString(),
      maturity_date: toIsoOrNull(this.maturityDate),
      paid: this.paid,
      note: this.note.trim() || null,
    };
    // tra ket qua ve page goi (page tu goi create/update de ghi log dung loai)
    this.busy = false;
    await this.modalCtrl.dismiss({ payload }, 'save');
  }
}
