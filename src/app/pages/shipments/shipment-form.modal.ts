import { Component, inject, Input, OnInit, signal } from '@angular/core';
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
  IonList,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonNote,
  IonTextarea,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, closeOutline } from 'ionicons/icons';
import { ShipmentsService } from '../../core/services/shipments.service';
import { ShippingPartnersService, ShippingPartner } from '../../core/services/shipping-partners.service';
import { AuthService } from '../../core/services/auth.service';
import { Order, ShipmentStatus } from '../../core/models/models';

/**
 * Form tạo vận đơn thủ công (P0 — nhập mã hãng tay, chưa nối API 3PL).
 * Mở dạng modal từ:
 *  - Trang /shipments (FAB)
 *  - order-detail ("Tạo vận đơn") — có prefill từ đơn hàng
 */
@Component({
  selector: 'app-shipment-form-modal',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">
            <ion-icon slot="icon-only" name="close-outline" />
          </ion-button>
        </ion-buttons>
        <ion-title>Tạo vận đơn</ion-title>
        <ion-buttons slot="end">
          <ion-button [disabled]="busy() || !trackingCode.trim()" (click)="save()">
            @if (busy()) {
              <ion-spinner name="crescent" />
            } @else {
              <ion-icon slot="icon-only" name="save-outline" />
            }
            Lưu
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
          <div class="app-card-title"><h4>Thông tin vận đơn</h4></div>
          <ion-list lines="full">
            <ion-item>
              <ion-select label="Đối tác vận chuyển" labelPlacement="stacked" [(ngModel)]="partnerId" (ionChange)="onPartnerChange()" interface="action-sheet">
                <ion-select-option value="">Thủ công / hãng khác</ion-select-option>
                @for (p of partners(); track p.id) {
                  <ion-select-option [value]="p.id">{{ p.name }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input
                label="Mã vận đơn"
                labelPlacement="stacked"
                placeholder="VD: GHN8842KLMN"
                [(ngModel)]="trackingCode"
              />
            </ion-item>
            <ion-item>
              <ion-segment [(ngModel)]="status">
                <ion-segment-button value="draft">
                  <ion-label>Nháp</ion-label>
                </ion-segment-button>
                <ion-segment-button value="submitted">
                  <ion-label>Đã tạo</ion-label>
                </ion-segment-button>
              </ion-segment>
            </ion-item>
            @if (order) {
              <ion-item>
                <ion-label>
                  <h3>{{ order.code }}{{ order.customer_name ? ' · ' + order.customer_name : '' }}</h3>
                  <p>Đơn hàng liên quan</p>
                </ion-label>
              </ion-item>
            }
            @if (!order) {
              <ion-item>
                <ion-input
                  label="Mã đơn liên quan"
                  labelPlacement="stacked"
                  placeholder="Tùy chọn — VD: DH-260927-AB12"
                  [(ngModel)]="orderCode"
                />
              </ion-item>
            }
          </ion-list>
        </div>

        <div class="app-card">
          <div class="app-card-title"><h4>Cước &amp; hàng hóa</h4></div>
          <ion-list lines="full">
            <ion-item>
              <ion-input label="Phí vận chuyển (₫)" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="shippingFee" />
            </ion-item>
            <ion-item>
              <ion-input label="Tiền thu hộ COD (₫)" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="codAmount" />
            </ion-item>
            <ion-item>
              <ion-input label="Khối lượng (gram)" labelPlacement="stacked" type="number" inputmode="numeric" placeholder="VD: 1200" [(ngModel)]="weightG" />
            </ion-item>
            <ion-item>
              <ion-input label="Dài × Rộng × Cao (cm)" labelPlacement="stacked" placeholder="VD: 20 × 15 × 10" [(ngModel)]="dimensions" />
              <ion-note slot="end" class="dim-note">D × W × H</ion-note>
            </ion-item>
          </ion-list>
        </div>

        <div class="app-card">
          <div class="app-card-title"><h4>Địa chỉ</h4></div>
          <ion-list lines="full">
            <ion-item>
              <ion-textarea label="Địa chỉ gửi" labelPlacement="stacked" [rows]="2" [(ngModel)]="fromAddress" />
            </ion-item>
            <ion-item>
              <ion-textarea label="Địa chỉ nhận" labelPlacement="stacked" [rows]="2" [(ngModel)]="toAddress" />
            </ion-item>
            <ion-item>
              <ion-textarea label="Ghi chú" labelPlacement="stacked" [rows]="2" placeholder="VD: Hàng dễ vỡ — nhẹ tay" [(ngModel)]="note" />
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
        font-size: 13px;
      }

      .dim-note {
        font-size: 11px;
        color: var(--ion-color-medium);
      }
    `,
  ],
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
    IonTextarea,
    FormsModule,
  ],
})
export class ShipmentFormModal implements OnInit {
  /** Đơn hàng prefill (mở từ order-detail) */
  @Input() order: Order | null = null;
  /** Trạng thái đơn v22 nhập tay trước đó (prefill mã vận đơn nếu có) */
  @Input() prefillTrackingCode: string | null = null;
  @Input() prefillAddress: string | null = null;

  private shipmentsService = inject(ShipmentsService);
  private partnersService = inject(ShippingPartnersService);
  private auth = inject(AuthService);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);

  readonly partners = signal<ShippingPartner[]>([]);
  readonly busy = signal(false);

  partnerId = '';
  trackingCode = '';
  status: ShipmentStatus = 'submitted';
  orderCode = '';
  shippingFee: number | null = null;
  codAmount: number | null = null;
  weightG: number | null = null;
  dimensions = '';
  fromAddress = '';
  toAddress = '';
  note = '';
  error = '';

  constructor() {
    addIcons({ saveOutline, closeOutline });
  }

  async ngOnInit(): Promise<void> {
    this.shipmentsService.migrationNeeded.set(false);
    try {
      const partners = await this.partnersService.list();
      // chỉ hiện đối tác đang bật
      this.partners.set(partners.filter((p) => p.active !== false));
    } catch {
      /* ignore — vẫn tạo được vận đơn thủ công */
    }
    if (this.prefillTrackingCode) this.trackingCode = this.prefillTrackingCode;
    if (this.order) {
      this.orderCode = this.order.code;
      this.toAddress =
        this.prefillAddress ||
        [this.order.customer_name, this.order.customer_phone, this.order.customer_address]
          .filter(Boolean)
          .join(' · ');
    } else if (this.prefillAddress) {
      this.toAddress = this.prefillAddress;
    }
    const shop = this.auth.shop();
    if (shop) {
      this.fromAddress = [shop.name, shop.phone, shop.address].filter(Boolean).join(' · ');
    }
  }

  onPartnerChange(): void {
    /* provider tính lúc save */
  }

  private selectedPartner(): ShippingPartner | null {
    return this.partners().find((p) => p.id === this.partnerId) ?? null;
  }

  /** '20 × 15 × 10' | '20x15x10' → [20, 15, 10] */
  private parseDimensions(): { length_cm: number | null; width_cm: number | null; height_cm: number | null } {
    const parts = this.dimensions
      .split(/[x×*\s,/.]+/)
      .map((s) => parseFloat(s.replace(',', '.')))
      .filter((n) => Number.isFinite(n) && n > 0);
    return { length_cm: parts[0] ?? null, width_cm: parts[1] ?? null, height_cm: parts[2] ?? null };
  }

  async save(): Promise<void> {
    this.error = '';
    const tracking = this.trackingCode.trim();
    if (!tracking) {
      this.error = 'Vui lòng nhập mã vận đơn.';
      return;
    }
    if (this.codAmount && Number(this.codAmount) < 0) {
      this.error = 'COD không được âm.';
      return;
    }
    if (this.weightG && Number(this.weightG) <= 0) {
      this.error = 'Khối lượng phải lớn hơn 0.';
      return;
    }
    this.busy.set(true);
    try {
      const partner = this.selectedPartner();
      const dims = this.parseDimensions();
      await this.shipmentsService.create({
        order_id: this.order?.id ?? null,
        order_code: this.order?.code ?? this.orderCode.trim() ?? null,
        partner_id: partner?.id ?? null,
        partner_name: partner?.name ?? null,
        provider: partner?.code || 'manual',
        tracking_code: tracking,
        status: this.status,
        shipping_fee: Number(this.shippingFee ?? 0),
        cod_amount: Number(this.codAmount ?? 0),
        weight_g: this.weightG ? Number(this.weightG) : null,
        from_address: this.fromAddress,
        to_address: this.toAddress,
        note: this.note,
        ...dims,
      });
      this.toast('Đã tạo vận đơn');
      await this.modalCtrl.dismiss({ saved: true }, 'save');
    } catch (e: any) {
      this.error = e?.message ?? 'Tạo vận đơn thất bại';
    } finally {
      this.busy.set(false);
    }
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1600, color, position: 'bottom' });
    await t.present();
  }
}
