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
  IonInput,
  IonToggle,
  IonSpinner,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  saveOutline,
  trashOutline,
  closeOutline,
  pricetagsOutline,
  addCircleOutline,
} from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/models';

@Component({
  selector: 'app-product-edit',
  templateUrl: './product-edit.page.html',
  styleUrls: ['./product-edit.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    IonToggle,
    IonSpinner,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    FormsModule,
  ],
})
export class ProductEditPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productsService = inject(ProductsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly productId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly deleting = signal(false);
  error = '';

  name = '';
  sku = '';
  unit = 'Cái';
  price: number | null = null;
  cost: number | null = null;
  stock: number | null = 0;
  active = true;

  constructor() {
    addIcons({ saveOutline, trashOutline, closeOutline, pricetagsOutline, addCircleOutline });
  }

  get isEdit(): boolean {
    return !!this.productId();
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'add') {
      this.productId.set(id);
      await this.loadProduct(id);
    }
  }

  private async loadProduct(id: string) {
    this.busy.set(true);
    try {
      const p = await this.productsService.get(id);
      if (p) {
        this.name = p.name;
        this.sku = p.sku ?? '';
        this.unit = p.unit ?? 'Cái';
        this.price = p.price;
        this.cost = p.cost;
        this.stock = p.stock;
        this.active = p.active;
      }
    } catch (e: any) {
      this.error = e?.message ?? 'Không tải được sản phẩm.';
    } finally {
      this.busy.set(false);
    }
  }

  async save(continueAdding = false) {
    this.error = '';
    if (!this.name.trim()) {
      this.error = 'Vui lòng nhập tên sản phẩm.';
      return;
    }

    // Isale: sửa số lượng chỉ qua Phiếu nhập kho — payload KHÔNG gửi stock khi sửa
    const payload: Partial<Product> = {
      name: this.name.trim(),
      sku: this.sku.trim() || null,
      unit: this.unit.trim() || 'Cái',
      price: Number(this.price ?? 0),
      cost: this.cost == null ? null : Number(this.cost),
      active: this.active,
    };
    if (!this.isEdit) {
      payload.stock = Number(this.stock ?? 0);
    }

    this.busy.set(true);
    try {
      if (this.isEdit) {
        await this.productsService.update(this.productId()!, payload);
        this.toast('Đã lưu sản phẩm');
        this.router.navigateByUrl('/product', { replaceUrl: true });
      } else {
        await this.productsService.create(payload);
        if (continueAdding) {
          this.toast('Đã thêm "' + this.name.trim() + '"');
          this.error = '';
          this.name = '';
          this.sku = '';
          this.unit = 'Cái';
          this.price = null;
          this.cost = null;
          this.stock = 0;
          this.active = true;
        } else {
          this.router.navigateByUrl('/product', { replaceUrl: true });
        }
      }
    } catch (e: any) {
      this.error = this.translateError(e?.message ?? 'Lưu thất bại.');
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete() {
    if (!this.isEdit) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa sản phẩm',
      message: `Bạn chắc chắn muốn xóa "${this.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: () => this.doDelete(),
        },
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

  private translateError(msg: string): string {
    const m = (msg || '').toLowerCase();
    if (m.includes('row-level security')) return 'Không có quyền thực hiện. Kiểm tra lại đăng nhập.';
    return msg;
  }

  goBack() {
    this.router.navigateByUrl('/product', { replaceUrl: true });
  }
}
