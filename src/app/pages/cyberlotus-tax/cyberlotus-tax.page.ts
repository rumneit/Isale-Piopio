import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonSegment,
  IonSegmentButton, IonInput, IonSelect, IonSelectOption, IonRefresher,
  IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, documentTextOutline, cloudDownloadOutline, settingsOutline,
  informationCircleOutline, trashOutline, businessOutline, cashOutline, checkmarkDoneOutline,
  warningOutline,
} from 'ionicons/icons';
import { TaxService, TaxProfile, TaxDeclaration } from '../../core/services/tax.service';
import {
  computeTax, DIRECT_VAT_RATES, htkkRows, periodLabel, recentPeriods, VatMethod,
} from '../../core/tax';
import { SettingsService } from '../../core/services/settings.service';
import { CsvExportService } from '../../core/services/csv-export.service';

/**
 * Kết nối thuế CyberLotus (khớp /cyberlotus-tax của mẫu):
 *  - Thông tin kê khai thuế (hồ sơ doanh nghiệp)
 *  - Xuất tờ khai HTKK: tổng hợp doanh thu thật trong kỳ + tính GTGT + xuất CSV
 *  - Cài đặt CyberLotus (tài khoản kết nối)
 *
 * Việc NỘP tờ khai lên cơ quan thuế qua API CyberLotus cần tài khoản đối tác và
 * backend giữ khoá — module này lưu hồ sơ và xuất dữ liệu tờ khai.
 */
@Component({
  selector: 'app-cyberlotus-tax',
  imports: [
    CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonIcon, IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote,
    IonButton, IonSegment, IonSegmentButton, IonInput, IonSelect, IonSelectOption,
    IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Kết nối thuế CyberLotus</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))" scrollable>
          <ion-segment-button value="profile"><ion-label>Hồ sơ thuế</ion-label></ion-segment-button>
          <ion-segment-button value="declare"><ion-label>Tờ khai</ion-label></ion-segment-button>
          <ion-segment-button value="connect"><ion-label>Cài đặt</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (migrationNeeded()) {
          <div class="app-banner-warning">
            <ion-icon name="warning-outline" />
            <span>Cần chạy migration v14 trong Supabase để lưu hồ sơ & tờ khai.</span>
          </div>
        }
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (tab() === 'profile') {
          <div class="app-banner-warning">
            <ion-icon name="information-circle-outline" />
            <span>Hồ sơ thuế dùng để điền thông tin người nộp thuế trên tờ khai.</span>
          </div>
          @if (profiles().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="business-outline" /></div>
              Chưa có hồ sơ thuế.
            </div>
          } @else {
            @for (p of profiles(); track p.id) {
              <div class="app-card">
                <div class="app-card-title">
                  <h4>{{ p.company_name }}</h4>
                  <ion-badge [color]="p.status === 'submitted' ? 'success' : 'medium'">{{ statusLabel(p.status) }}</ion-badge>
                </div>
                <ion-list lines="full">
                  <ion-item><ion-label>Mã số thuế</ion-label><ion-note slot="end">{{ p.tax_code }}</ion-note></ion-item>
                  <ion-item><ion-label>Người đại diện</ion-label><ion-note slot="end">{{ p.legal_rep ?? '—' }}</ion-note></ion-item>
                  <ion-item><ion-label>Kỳ kế toán</ion-label><ion-note slot="end">{{ p.accounting_period ?? '—' }}</ion-note></ion-item>
                  <ion-item><ion-label>Mẫu hóa đơn</ion-label><ion-note slot="end">{{ p.invoice_form ?? '—' }}</ion-note></ion-item>
                </ion-list>
                <div class="row-actions">
                  <ion-button size="small" fill="clear" (click)="openProfile(p)">
                    <ion-icon slot="start" name="settings-outline" /> Sửa
                  </ion-button>
                  <ion-button size="small" fill="clear" color="danger" (click)="removeProfile(p)">
                    <ion-icon slot="start" name="trash-outline" /> Xóa
                  </ion-button>
                </div>
              </div>
            }
          }
          <ion-button expand="block" (click)="openProfile()">
            <ion-icon slot="start" name="add-outline" /> Thêm hồ sơ thuế
          </ion-button>
        } @else if (tab() === 'declare') {
          <div class="app-card">
            <div class="app-card-title"><h4>Tổng hợp tờ khai</h4></div>
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Kỳ kê khai" labelPlacement="stacked" [(ngModel)]="period">
                  @for (p of periods; track p) { <ion-select-option [value]="p">{{ periodLabel(p) }}</ion-select-option> }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Phương pháp tính GTGT" labelPlacement="stacked" [(ngModel)]="method">
                  <ion-select-option value="direct">Trực tiếp (theo tỉ lệ %)</ion-select-option>
                  <ion-select-option value="deduction">Khấu trừ</ion-select-option>
                </ion-select>
              </ion-item>
              @if (method === 'direct') {
                <ion-item>
                  <ion-select label="Ngành / tỉ lệ GTGT" labelPlacement="stacked" [(ngModel)]="directRate">
                    @for (r of vatRates; track r.key) {
                      <ion-select-option [value]="r.rate">{{ r.label }} — {{ r.rate }}%</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              } @else {
                <ion-item>
                  <ion-input type="number" label="Thuế GTGT đầu vào đã trả (₫)" labelPlacement="stacked" [(ngModel)]="inputVat" />
                </ion-item>
              }
            </ion-list>
            <ion-button expand="block" (click)="compute()">
              <ion-icon slot="start" name="document-text-outline" /> Tính tờ khai
            </ion-button>
          </div>

          @if (summary()) {
            <div class="app-card">
              <div class="app-card-title"><h4>{{ periodLabel(period) }}</h4></div>
              <ion-list lines="full">
                <ion-item>
                  <ion-icon slot="start" name="cash-outline" color="primary" />
                  <ion-label>Tổng doanh thu</ion-label>
                  <ion-note slot="end">{{ summary()!.revenue | number }} ₫</ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>Thuế GTGT đầu ra</ion-label>
                  <ion-note slot="end">{{ summary()!.outputVat | number }} ₫</ion-note>
                </ion-item>
                <ion-item>
                  <ion-label>Thuế GTGT đầu vào</ion-label>
                  <ion-note slot="end">{{ summary()!.inputVat | number }} ₫</ion-note>
                </ion-item>
                <ion-item>
                  <ion-icon slot="start" name="checkmark-done-outline" color="success" />
                  <ion-label><strong>Thuế phải nộp</strong></ion-label>
                  <ion-note slot="end"><strong>{{ summary()!.payableVat | number }} ₫</strong></ion-note>
                </ion-item>
              </ion-list>
            </div>
            <ion-button expand="block" fill="outline" (click)="exportHtkk()">
              <ion-icon slot="start" name="cloud-download-outline" /> Xuất tờ khai (CSV)
            </ion-button>
            <ion-button expand="block" (click)="saveDeclaration()">
              <ion-icon slot="start" name="add-outline" /> Lưu tờ khai
            </ion-button>
          }

          @if (declarations().length > 0) {
            <div class="app-card-title"><h4>Đã lưu</h4></div>
            <div class="app-card">
              <ion-list lines="full">
                @for (d of declarations(); track d.id) {
                  <ion-item>
                    <ion-icon slot="start" name="document-text-outline" color="medium" />
                    <ion-label>
                      <h3>{{ periodLabel(d.period) }} · {{ d.declaration_type }}</h3>
                      <p>Doanh thu {{ d.revenue | number }} ₫ · GTGT {{ d.vat_amount | number }} ₫</p>
                    </ion-label>
                    <ion-badge slot="end" [color]="d.status === 'submitted' ? 'success' : 'medium'">{{ statusLabel(d.status) }}</ion-badge>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
        } @else {
          <div class="app-banner-warning">
            <ion-icon name="information-circle-outline" />
            <span>Cần tài khoản đối tác CyberLotus để nộp tờ khai tự động. Phần này chỉ lưu cấu hình kết nối.</span>
          </div>
          <div class="app-card">
            <div class="app-card-title"><h4>Cài đặt CyberLotus</h4></div>
            <ion-list lines="full">
              <ion-item>
                <ion-input label="Tài khoản CyberLotus" labelPlacement="stacked" [(ngModel)]="clUser" />
              </ion-item>
              <ion-item>
                <ion-input type="password" label="Mật khẩu / API Key" labelPlacement="stacked" [(ngModel)]="clKey" />
              </ion-item>
              <ion-item>
                <ion-input label="Mã số thuế mặc định" labelPlacement="stacked" [(ngModel)]="clTaxCode" />
              </ion-item>
            </ion-list>
          </div>
          <ion-button expand="block" (click)="saveConnect()">
            <ion-icon slot="start" name="settings-outline" /> Lưu cài đặt
          </ion-button>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .app-card-title { margin: 14px 2px 8px; }
    .app-card-title h4 { margin: 0; font-size: 15px; font-weight: 800; color: var(--app-text); }
    .row-actions { display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px; }
  `],
})
export class CyberlotusTaxPage implements OnInit {
  private service = inject(TaxService);
  private settings = inject(SettingsService);
  private csv = inject(CsvExportService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly tab = signal<'profile' | 'declare' | 'connect'>('profile');
  readonly profiles = signal<TaxProfile[]>([]);
  readonly declarations = signal<TaxDeclaration[]>([]);
  readonly summary = signal<ReturnType<typeof computeTax> | null>(null);
  readonly loading = signal(true);
  readonly migrationNeeded = signal(false);

  readonly periods = recentPeriods(12);
  readonly vatRates = DIRECT_VAT_RATES;

  period = this.periods[0];
  method: VatMethod = 'direct';
  directRate = 1;
  inputVat: number | null = 0;

  clUser = '';
  clKey = '';
  clTaxCode = '';

  constructor() {
    addIcons({
      addOutline, documentTextOutline, cloudDownloadOutline, settingsOutline,
      informationCircleOutline, trashOutline, businessOutline, cashOutline, checkmarkDoneOutline,
      warningOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.settings.load();
    this.clUser = this.settings.get('cyberlotus_user') ?? '';
    this.clKey = this.settings.get('cyberlotus_key') ?? '';
    this.clTaxCode = this.settings.get('cyberlotus_tax_code') ?? '';
    await this.load();
  }

  periodLabel = periodLabel;

  statusLabel(s: string): string {
    const map: Record<string, string> = { draft: 'Nháp', ready: 'Sẵn sàng', submitted: 'Đã nộp' };
    return map[s] ?? s;
  }

  async load() {
    this.loading.set(true);
    try {
      const [profiles, declarations] = await Promise.all([
        this.service.listProfiles(),
        this.service.listDeclarations(),
      ]);
      this.profiles.set(profiles);
      this.declarations.set(declarations);
      this.migrationNeeded.set(this.service.migrationNeeded());
    } catch (e: any) {
      console.error('load tax data failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  async compute() {
    try {
      const s = await this.service.summaryForPeriod(
        this.period,
        this.method,
        Number(this.directRate ?? 0),
        Number(this.inputVat ?? 0)
      );
      this.summary.set(s);
      this.toast('Đã tính tờ khai');
    } catch (e: any) {
      this.toast(e?.message ?? 'Tính tờ khai thất bại', 'danger');
    }
  }

  exportHtkk() {
    const s = this.summary();
    if (!s) return;
    const rows = htkkRows(s);
    this.csv.export(`to-khai-01-GTGT-${this.period}.csv`, rows[0].map(String), rows.slice(1));
    this.toast('Đã xuất tờ khai CSV');
  }

  async saveDeclaration() {
    const s = this.summary();
    if (!s) return;
    try {
      await this.service.saveDeclaration({
        period: this.period,
        declaration_type: '01/GTGT',
        revenue: s.revenue,
        vat_amount: s.payableVat,
        status: 'ready',
        profile_id: this.profiles()[0]?.id ?? null,
      });
      this.toast('Đã lưu tờ khai');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu thất bại', 'danger');
    }
  }

  private profileFields(p?: TaxProfile) {
    return [
      { name: 'company_name', type: 'text' as const, placeholder: 'Tên doanh nghiệp', value: p?.company_name ?? '' },
      { name: 'tax_code', type: 'text' as const, placeholder: 'Mã số thuế', value: p?.tax_code ?? '' },
      { name: 'address', type: 'text' as const, placeholder: 'Địa chỉ', value: p?.address ?? '' },
      { name: 'legal_rep', type: 'text' as const, placeholder: 'Người đại diện pháp luật', value: p?.legal_rep ?? '' },
      { name: 'phone', type: 'tel' as const, placeholder: 'Điện thoại', value: p?.phone ?? '' },
      { name: 'accounting_period', type: 'text' as const, placeholder: 'Kỳ kế toán (YYYY-MM)', value: p?.accounting_period ?? this.period },
      { name: 'invoice_form', type: 'text' as const, placeholder: 'Mẫu hóa đơn (VD: 01GTKT0/001)', value: p?.invoice_form ?? '' },
    ];
  }

  async openProfile(p?: TaxProfile) {
    const alert = await this.alertCtrl.create({
      header: p ? 'Sửa hồ sơ thuế' : 'Thêm hồ sơ thuế',
      inputs: this.profileFields(p),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.company_name?.trim() || !data?.tax_code?.trim()) {
              this.toast('Cần nhập tên doanh nghiệp và mã số thuế', 'danger');
              return false;
            }
            try {
              await this.service.saveProfile({
                id: p?.id,
                company_name: data.company_name.trim(),
                tax_code: data.tax_code.trim(),
                address: data.address?.trim() || null,
                legal_rep: data.legal_rep?.trim() || null,
                phone: data.phone?.trim() || null,
                accounting_period: data.accounting_period?.trim() || null,
                invoice_form: data.invoice_form?.trim() || null,
                status: p?.status ?? 'draft',
              });
              this.toast('Đã lưu hồ sơ');
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

  async removeProfile(p: TaxProfile) {
    try {
      await this.service.removeProfile(p.id);
      this.toast('Đã xóa hồ sơ');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    }
  }

  async saveConnect() {
    try {
      await this.settings.set('cyberlotus_user', this.clUser.trim());
      await this.settings.set('cyberlotus_key', this.clKey.trim());
      await this.settings.set('cyberlotus_tax_code', this.clTaxCode.trim());
      this.toast('Đã lưu cài đặt CyberLotus');
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu thất bại', 'danger');
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
