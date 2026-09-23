import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
  IonBadge,
  IonNote,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  home,
  create,
  trash,
  copy,
  close,
  pricetags,
  cube,
} from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/models';

/**
 * Trang xem chi tiết sản phẩm — theo ISale `#/product/detail/:id`:
 * thông tin đầy đủ + hành động (Sửa, Nhân bản, Xóa).
 */
@Component({
  selector: 'app-product-detail',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="goBack()">
            <ion-icon slot="icon-only" name="close" />
          </ion-button>
          <ion-button (click)="openHome()">
            <ion-icon slot="icon-only" name="home" />
          </ion-button>
        </ion-buttons>
        <ion-title>Chi tiết sản phẩm</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="openEdit()" [disabled]="busy()">
            <ion-icon slot="icon-only" name="create" />
          </ion-button>
          <ion-button (click)="copyProduct()" [disabled]="busy()">
            <ion-icon slot="icon-only" name="copy" />
          </ion-button>
          <ion-button (click)="confirmDelete()" [disabled]="busy()">
            <ion-icon slot="icon-only" name="trash" color="danger" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else if (product(); as p) {
        <div class="app-page-container">
          <div class="app-card detail-card">
            <div class="detail-head">
              <h2 class="detail-name">{{ p.name }}</h2>
              <ion-badge [color]="p.active ? 'success' : 'medium'">{{ p.active ? 'Đang kinh doanh' : 'Ngừng bán' }}</ion-badge>
            </div>

            <ion-list lines="full">
              <ion-item>
                <ion-icon name="cube" slot="start" />
                <ion-label>
                  <h3>{{ formatQty(p.stock) }}</h3>
                  <p>Số lượng</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-icon name="pricetags" slot="start" />
                <ion-label>
                  <h3>{{ formatMoney(p.price) }}</h3>
                  <p>Đơn giá</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ p.cost != null ? formatMoney(p.cost) : '—' }}</h3>
                  <p>Giá nhập</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ p.sku ?? '—' }}</h3>
                  <p>Mã/SKU</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ p.unit ?? '—' }}</h3>
                  <p>Đơn vị</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>{{ categoryName() ?? '—' }}</h3>
                  <p>Danh mục</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>

          <ion-note class="detail-tip">Để cập nhật số lượng, hãy tạo Phiếu nhập kho.</ion-note>

          <ion-button expand="block" (click)="openEdit()">
            <ion-icon slot="start" name="create" />
            Sửa sản phẩm
          </ion-button>
          <ion-button expand="block" fill="outline" (click)="copyProduct()" [disabled]="busy()">
            <ion-icon slot="start" name="copy" />
            Nhân bản/Sao chép
          </ion-button>
          <ion-button expand="block" color="danger" fill="outline" (click)="confirmDelete()" [disabled]="deleting()">
            <ion-icon slot="start" name="trash" />
            {{ deleting() ? 'Đang xóa...' : 'Xóa sản phẩm' }}
          </ion-button>
        </div>
      } @else {
        <div class="app-empty">Không tìm thấy sản phẩm</div>
      }
    </ion-content>
  `,
  styles: [
    `
      .page-loading {
        display: flex;
        justify-content: center;
        padding: 40px 0;
      }
      .detail-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 0 0 12px;
        border-bottom: 1px solid var(--app-border);
        margin-bottom: 6px;
      }
      .detail-name {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: #1f2a5a;
      }
      .detail-tip {
        display: block;
        font-size: 12px;
        color: var(--app-text-muted);
        margin: 0 4px 12px;
      }
    `,
  ],
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
    IonSpinner,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonNote,
  ],
})
export class ProductDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productsService = inject(ProductsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly productId = signal<string | null>(null);
  readonly product = signal<Product | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly deleting = signal(false);
  readonly categoryName = signal<string | null>(null);

  constructor() {
    addIcons({ home, create, trash, copy, close, pricetags, cube });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.productId.set(id);
      this.load(id);
    }
  }

  private async load(id: string) {
    this.loading.set(true);
    try {
      const p = await this.productsService.get(id);
      this.product.set(p);
      if (p?.category_id) {
        const cats = await this.productsService.listCategories();
        this.categoryName.set(cats.find((c) => c.id === p.category_id)?.name ?? null);
      }
    } catch (e: any) {
      this.toast(e?.message ?? 'Không tải được sản phẩm.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  formatMoney(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  formatQty(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0);
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  goBack() {
    this.router.navigateByUrl('/product', { replaceUrl: true });
  }

  openEdit() {
    if (this.productId()) this.router.navigateByUrl(`/product/${this.productId()}`);
  }

  async copyProduct() {
    const p = this.product();
    if (!p || this.busy()) return;
    const alert = await this.alertCtrl.create({
      header: 'Nhân bản/Sao chép',
      message: `Tạo sản phẩm mới từ "${p.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Nhân bản',
          handler: () => this.doCopy(p),
        },
      ],
    });
    await alert.present();
  }

  private async doCopy(p: Product) {
    this.busy.set(true);
    try {
      const created = await this.productsService.create({
        name: p.name + ' (bản sao)',
        sku: p.sku,
        unit: p.unit,
        price: p.price,
        cost: p.cost,
        stock: 0,
        category_id: p.category_id,
        active: p.active,
        serial_managed: p.serial_managed,
      });
      this.toast('Đã nhân bản sản phẩm');
      this.router.navigateByUrl(`/product/detail/${created.id}`, { replaceUrl: true });
    } catch (e: any) {
      this.toast(e?.message ?? 'Nhân bản thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete() {
    const p = this.product();
    if (!p) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa sản phẩm',
      message:
        'Tất cả giao dịch thuộc sản phẩm này sẽ không bị xóa, tuy nhiên nội dung của sản phẩm này sẽ không thể khôi phục. Bạn có chắc muốn xóa?',
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Xóa', role: 'destructive', handler: () => this.doDelete() },
      ],
    });
    await alert.present();
  }

  private async doDelete() {
    this.deleting.set(true);
    try {
      await this.productsService.remove(this.productId()!);
      this.toast('Đã xóa sản phẩm');
      this.router.navigateByUrl('/product', { replaceUrl: true });
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    } finally {
      this.deleting.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
