import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonSpinner, IonList, IonItem, IonInput, IonSelect, IonSelectOption, IonBadge,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, closeOutline, arrowRedoOutline, cubeOutline, trashOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/models';

interface DraftItem {
  product_id: string;
  name: string;
  qty: number;
  max: number;
}

@Component({
  selector: 'app-transfer-add',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonSpinner, IonList, IonItem, IonInput, IonSelect, IonSelectOption,
    IonBadge, FormsModule,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="goBack()"><ion-icon slot="icon-only" name="close-outline" /></ion-button>
      <ion-button (click)="openHome()">
        <ion-icon slot="icon-only" name="home-outline" />
      </ion-button>
        </ion-buttons>
        <ion-title>Phiếu chuyển hàng</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="save()" [disabled]="busy()">
            @if (busy()) { <ion-spinner name="crescent" /> }
            @else { <ion-icon slot="icon-only" name="save-outline" /> }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        @if (error) { <div class="form-error">{{ error }}</div> }

        <div class="app-card">
          <ion-list lines="full">
            <ion-item>
              <ion-input label="Nơi nhận / chi nhánh đến" labelPlacement="floating" [(ngModel)]="destination" placeholder="VD: Kho phụ Q7" />
            </ion-item>
          </ion-list>
        </div>

        <div class="app-card">
          <div class="app-card-title"><h4><ion-icon name="cube-outline" /> Sản phẩm chuyển</h4></div>
          <ion-item lines="full">
            <ion-select placeholder="+ Chọn sản phẩm" (ionChange)="addProduct($any($event))" interface="action-sheet" cancelText="Đóng">
              @for (p of products(); track p.id) {
                <ion-select-option [value]="p.id">{{ p.name }} (tồn: {{ p.stock }})</ion-select-option>
              }
            </ion-select>
          </ion-item>

          @if (items().length === 0) {
            <div class="app-empty">Chưa chọn sản phẩm nào</div>
          } @else {
            <ion-list lines="none">
              @for (item of items(); track item.product_id; let i = $index) {
                <div class="draft-item">
                  <div class="draft-name">{{ item.name }}</div>
                  <div class="draft-row">
                    <ion-input class="draft-qty" type="number" min="1" [max]="item.max" [(ngModel)]="items()[i].qty" />
                    <span class="draft-x">/ tối đa {{ item.max }}</span>
                    <ion-button fill="clear" size="small" color="danger" (click)="removeItem(i)">
                      <ion-icon slot="icon-only" name="trash-outline" />
                    </ion-button>
                  </div>
                </div>
              }
            </ion-list>
          }
        </div>

        <div class="app-card">
          <ion-list lines="full">
            <ion-item>
              <ion-input label="Ghi chú" labelPlacement="floating" [(ngModel)]="note" />
            </ion-item>
          </ion-list>
        </div>

        <div class="total-box">
          <span>Tổng số lượng chuyển</span>
          <strong>{{ totalQty }}</strong>
        </div>

        <ion-button expand="block" size="large" (click)="save()" [disabled]="busy()">
          <ion-icon slot="start" name="arrow-redo-outline" />
          Lưu phiếu chuyển
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    .form-error { background: var(--app-danger-soft-bg); color: var(--app-danger-soft-text); border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
    .draft-item { padding: 10px 14px; border-bottom: 1px solid var(--app-border); }
    .draft-name { font-weight: 600; font-size: 14px; color: var(--app-text); margin-bottom: 6px; }
    .draft-row { display: flex; align-items: center; gap: 8px; }
    .draft-qty { width: 80px; flex-shrink: 0; text-align: center; }
    .draft-x { color: var(--app-text-muted); font-size: 12px; flex: 1; }
    .total-box { display: flex; align-items: center; justify-content: space-between; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
    .total-box span { color: var(--app-text-muted); font-size: 14px; }
    .total-box strong { font-size: 20px; color: var(--ion-color-primary); }
  `],
})
export class TransferAddPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private svc = inject(ShopTableService);
  private productsService = inject(ProductsService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);

  readonly busy = signal(false);
  readonly products = signal<Product[]>([]);
  readonly items = signal<DraftItem[]>([]);

  destination = '';
  note = '';
  error = '';

  constructor() {
    addIcons({ saveOutline, closeOutline, arrowRedoOutline, cubeOutline, trashOutline });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.products.set(await this.productsService.list());
    } catch (e) {
      console.error('load products failed', e);
    }
  }

  get totalQty(): number {
    return this.items().reduce((s, i) => s + Number(i.qty ?? 0), 0);
  }

  addProduct(ev: CustomEvent) {
    const productId = ev.detail.value as string;
    if (!productId) return;
    const product = this.products().find((p) => p.id === productId);
    if (!product) return;
    const current = [...this.items()];
    if (!current.find((i) => i.product_id === productId)) {
      current.push({ product_id: productId, name: product.name, qty: 1, max: Number(product.stock ?? 0) });
    }
    this.items.set(current);
    (ev.target as HTMLIonSelectElement).value = '';
  }

  removeItem(index: number) {
    const current = [...this.items()];
    current.splice(index, 1);
    this.items.set(current);
  }

  async save() {
    this.error = '';
    if (!this.items().length) {
      this.error = 'Chọn ít nhất một sản phẩm để chuyển.';
      return;
    }
    const invalid = this.items().find((i) => i.qty <= 0 || i.qty > i.max);
    if (invalid) {
      this.error = `Số lượng chuyển của "${invalid.name}" phải từ 1 đến ${invalid.max}.`;
      return;
    }

    this.busy.set(true);
    try {
      await this.svc.create('transfers', {
        code: this.svc.newCode('CH'),
        destination: this.destination.trim() || null,
        items: this.items().map((i) => ({ product_id: i.product_id, name: i.name, qty: i.qty })),
        note: this.note.trim() || null,
      });
      // Giảm tồn kho
      for (const item of this.items()) {
        const product = await this.productsService.get(item.product_id);
        if (product) {
          await this.productsService.update(item.product_id, {
            stock: Math.max(0, Number(product.stock ?? 0) - item.qty),
          });
        }
      }
      this.toast('Đã tạo phiếu chuyển — tồn kho đã giảm');
      this.router.navigateByUrl('/transfer', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu phiếu thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    this.router.navigateByUrl('/transfer', { replaceUrl: true });
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
