import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSpinner,
  IonSearchbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, personOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { Customer } from '../../core/models/models';

/**
 * Bộ chọn khách hàng dạng toàn màn hình (thay cho ActionSheet chỉ hiện 30 KH).
 * Mở từ trang Bán hàng → tab Khách hàng; bấm 1 khách để điền tên/SĐT/địa chỉ vào đơn.
 * Dùng modal để KHÔNG mất các sản phẩm đang nhập trong đơn.
 */
@Component({
  selector: 'app-customer-picker-modal',
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
    IonSearchbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="close()" aria-label="Đóng">
            <ion-icon slot="icon-only" name="close-outline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Chọn khách hàng</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="pick(null)" aria-label="Khách lẻ">Khách lẻ</ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          [value]="query()"
          (ionInput)="onSearch($any($event))"
          placeholder="Tìm theo tên, số điện thoại..."
          debounce="120"
          aria-label="Tìm khách hàng"
        />
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="picker-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container picker-container">
          @if (filtered().length === 0) {
            <div class="app-empty">
              @if (customers().length === 0) {
                Chưa có khách hàng nào. Vào mục <b>Khách hàng</b> để thêm mới.
              } @else {
                Không tìm thấy khách hàng khớp "{{ query() }}".
              }
            </div>
          } @else {
            <div class="picker-count">{{ filtered().length }} khách hàng</div>
            <div class="app-card picker-list">
              @for (c of filtered(); track c.id) {
                <button class="picker-row" [class.active]="c.id === selectedId" (click)="pick(c)">
                  <span class="picker-avatar">{{ initial(c.name) }}</span>
                  <span class="picker-main">
                    <span class="picker-name">{{ c.name }}</span>
                    <span class="picker-meta">
                      @if (c.phone) {
                        <span>{{ c.phone }}</span>
                      }
                      @if (c.address) {
                        <span class="picker-address">{{ c.address }}</span>
                      }
                    </span>
                  </span>
                  @if ((c.debt ?? 0) > 0) {
                    <span class="picker-debt">Nợ {{ money(c.debt) }}</span>
                  }
                  @if (c.id === selectedId) {
                    <ion-icon class="picker-check" name="checkmark-circle-outline" aria-label="Đang chọn" />
                  }
                </button>
              }
            </div>
          }
        </div>
      }
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
      .picker-loading {
        display: flex;
        justify-content: center;
        padding: 40px 0;
      }
      .picker-container {
        padding-top: 6px;
      }
      .picker-count {
        font-size: 12px;
        font-weight: 600;
        color: var(--app-text-muted);
        padding: 4px 2px 8px;
      }
      .picker-list {
        display: flex;
        flex-direction: column;
        padding: 0;
        overflow: hidden;
      }
      .picker-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 11px 12px;
        border: 0;
        border-bottom: 1px solid var(--app-border);
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:last-child {
          border-bottom: none;
        }
        &:active {
          background: var(--app-surface-alt);
        }
        &.active {
          background: rgba(var(--ion-color-primary-rgb), 0.08);
        }
      }
      .picker-avatar {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(var(--ion-color-primary-rgb), 0.12);
        color: var(--ion-color-primary);
        font-size: 14px;
        font-weight: 800;
      }
      .picker-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .picker-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--app-text);
        white-space: normal;
        word-break: break-word;
      }
      .picker-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 2px 10px;
        font-size: 12px;
        color: var(--app-text-muted);
      }
      .picker-address {
        white-space: normal;
        word-break: break-word;
      }
      .picker-debt {
        flex-shrink: 0;
        font-size: 11.5px;
        font-weight: 700;
        color: var(--ion-color-danger);
        white-space: nowrap;
      }
      .picker-check {
        flex-shrink: 0;
        font-size: 20px;
        color: var(--ion-color-primary);
      }
    `,
  ],
})
export class CustomerPickerModalComponent implements OnInit {
  /** Khách đang được chọn trên đơn — tô sáng trong danh sách */
  @Input() selectedId: string | null = null;

  private customersService = inject(CustomersService);
  private modalCtrl = inject(ModalController);

  readonly loading = signal(true);
  readonly customers = signal<Customer[]>([]);
  readonly query = signal('');

  readonly filtered = computed(() => {
    const term = this.norm(this.query().trim());
    if (!term) return this.customers();
    return this.customers().filter(
      (c) => this.norm(c.name).includes(term) || (c.phone ?? '').replace(/\s+/g, '').includes(term)
    );
  });

  constructor() {
    addIcons({ closeOutline, personOutline, checkmarkCircleOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.customers.set(await this.customersService.list());
    } catch (e) {
      console.error('load customers for picker failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  private norm(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  onSearch(ev: CustomEvent): void {
    this.query.set((ev.detail as any)?.value ?? '');
  }

  initial(name: string | null | undefined): string {
    return (name ?? '').trim().charAt(0).toUpperCase() || '?';
  }

  money(value: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(value ?? 0) + ' ₫';
  }

  pick(customer: Customer | null): void {
    void this.modalCtrl.dismiss(customer, customer ? 'select' : 'retail');
  }

  close(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }
}
