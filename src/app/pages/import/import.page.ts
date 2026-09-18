import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonButton, IonTextarea, IonNote,
  IonItem, IonInput, IonBadge, IonList, ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { cloudUploadOutline, downloadOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';
import { ProductsService } from '../../core/services/products.service';
import { CustomersService } from '../../core/services/customers.service';

@Component({
  selector: 'app-import',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonSpinner, IonButton, IonTextarea,
    IonNote, IonItem, IonInput, IonBadge, IonList, FormsModule,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Nhập dữ liệu</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="kind()" (ionChange)="kind.set($any($event.detail.value))">
          <ion-segment-button value="products"><ion-label>Sản phẩm</ion-label></ion-segment-button>
          <ion-segment-button value="customers"><ion-label>Khách hàng</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        <div class="app-card">
          <div class="app-card-title"><h4><ion-icon name="cloud-upload-outline" /> Dán dữ liệu CSV</h4></div>
          <ion-note class="import-hint">
            @if (kind() === 'products') {
              Mỗi dòng 1 sản phẩm, các cột cách nhau bởi dấu phẩy:<br>
              <code>Tên, Mã SP, Đơn vị, Giá bán, Giá vốn, Tồn kho</code>
            } @else {
              Mỗi dòng 1 khách hàng:<br>
              <code>Tên, SĐT, Email, Địa chỉ</code>
            }
          </ion-note>
          <ion-textarea
            [(ngModel)]="raw"
            [rows]="8"
            placeholder="Sữa tươi, SF001, Hộp, 15000, 10000, 20"
            class="import-textarea"
          ></ion-textarea>
          <input type="file" accept=".csv,.txt" (change)="onFile($any($event))" class="import-file" />
        </div>

        @if (parsed().length > 0) {
          <div class="app-card">
            <div class="app-card-title"><h4>Xem trước</h4><ion-badge color="success">{{ parsed().length }} dòng hợp lệ</ion-badge></div>
            <ion-list lines="full" class="preview-list">
              @for (row of parsed().slice(0, 5); track $index) {
                <ion-item>
                  <ion-label><h3>{{ row[0] }}</h3><p>{{ row.slice(1).join(' · ') }}</p></ion-label>
                </ion-item>
              }
            </ion-list>
            @if (parsed().length > 5) {
              <ion-note class="import-hint">...và {{ parsed().length - 5 }} dòng nữa</ion-note>
            }
          </div>
        }

        @if (error) { <div class="form-error">{{ error }}</div> }

        <ion-button expand="block" size="large" (click)="doImport()" [disabled]="busy() || parsed().length === 0">
          <ion-icon slot="start" name="download-outline" />
          {{ busy() ? 'Đang nhập...' : 'Nhập ' + parsed().length + ' dòng vào hệ thống' }}
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .import-hint { display: block; font-size: 12.5px; color: var(--app-text-muted); line-height: 1.5; padding: 0 2px 8px; }
    code { font-size: 11.5px; background: var(--app-surface-alt); padding: 1px 4px; border-radius: 4px; }
    .import-textarea { --background: var(--app-surface-alt); border-radius: 10px; font-size: 13px; font-family: monospace; }
    .import-file { display: block; margin-top: 10px; font-size: 12.5px; color: var(--app-text-muted); }
    .preview-list ion-item { --background: transparent; }
    .preview-list ion-item h3 { font-size: 14px; color: var(--app-text); }
    .preview-list ion-item p { font-size: 12px; color: var(--app-text-muted); }
    .form-error { background: var(--app-danger-soft-bg); color: var(--app-danger-soft-text); border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
  `],
})
export class ImportPage {
  private productsService = inject(ProductsService);
  private customersService = inject(CustomersService);
  private toastCtrl = inject(ToastController);

  readonly kind = signal<'products' | 'customers'>('products');
  readonly busy = signal(false);
  readonly parsed = signal<string[][]>([]);
  raw = '';
  error = '';

  constructor() {
    addIcons({ cloudUploadOutline, downloadOutline });
  }

  parseRaw(): string[][] {
    return this.raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(',').map((c) => c.trim()));
  }

  refreshParsed() {
    this.error = '';
    const rows = this.parseRaw();
    for (const row of rows) {
      if (this.kind() === 'products' && row.length < 4) {
        this.error = 'Dòng sản phẩm cần ít nhất 4 cột: Tên, Mã SP, Đơn vị, Giá bán.';
        this.parsed.set([]);
        return;
      }
      if (this.kind() === 'customers' && row.length < 1) {
        this.error = 'Dòng khách hàng cần tối thiểu tên.';
        this.parsed.set([]);
        return;
      }
    }
    this.parsed.set(rows);
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.raw = String(reader.result ?? '');
      this.refreshParsed();
    };
    reader.readAsText(file, 'utf-8');
  }

  async doImport() {
    this.refreshParsed();
    const rows = this.parsed();
    if (!rows.length) return;
    this.busy.set(true);
    let ok = 0;
    try {
      for (const row of rows) {
        try {
          if (this.kind() === 'products') {
            await this.productsService.create({
              name: row[0],
              sku: row[1] || null,
              unit: row[2] || 'Cái',
              price: Number(row[3] ?? 0),
              cost: row[4] != null && row[4] !== '' ? Number(row[4]) : null,
              stock: Number(row[5] ?? 0),
              active: true,
            });
          } else {
            await this.customersService.create({
              name: row[0],
              phone: row[1] || null,
              email: row[2] || null,
              address: row[3] || null,
              debt: 0,
            });
          }
          ok++;
        } catch (e) {
          console.error('import row failed', row[0], e);
        }
      }
      const t = await this.toastCtrl.create({
        message: `Đã nhập thành công ${ok}/${rows.length} ${this.kind() === 'products' ? 'sản phẩm' : 'khách hàng'}`,
        duration: 2200,
        color: 'success',
        position: 'bottom',
      });
      await t.present();
      this.raw = '';
      this.parsed.set([]);
    } finally {
      this.busy.set(false);
    }
  }
}
