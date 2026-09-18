import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonButton,
  IonSearchbar,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  clipboardOutline,
  pricetagsOutline,
  createOutline,
  checkmarkDoneOutline,
} from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/models';

@Component({
  selector: 'app-stock-check',
  templateUrl: './stock-check.page.html',
  styleUrls: ['./stock-check.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonButton,
    IonSearchbar,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class StockCheckPage implements OnInit {
  private productsService = inject(ProductsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Product[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ clipboardOutline, pricetagsOutline, createOutline, checkmarkDoneOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.productsService.list(this.search));
    } catch (e: any) {
      console.error('load stock failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    await this.load();
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  async adjustStock(product: Product) {
    const alert = await this.alertCtrl.create({
      header: 'Điều chỉnh tồn kho',
      message: `${product.name} — tồn hiện tại: ${product.stock}`,
      inputs: [
        {
          name: 'stock',
          type: 'number',
          value: String(product.stock ?? 0),
          placeholder: 'Số lượng thực tế',
          attributes: { inputmode: 'decimal' },
        },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Cập nhật',
          handler: async (data) => {
            const value = Number(data?.stock ?? 0);
            if (Number.isNaN(value) || value < 0) {
              this.toast('Số lượng không hợp lệ', 'danger');
              return false;
            }
            try {
              await this.productsService.update(product.id, { stock: value });
              this.toast(`Đã cập nhật tồn kho: ${product.stock} → ${value}`);
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Cập nhật thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}
