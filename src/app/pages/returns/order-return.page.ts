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
  IonInput,
  IonCheckbox,
  IonToggle,
  IonNote,
  IonBadge,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  saveOutline,
  closeOutline,
  returnDownBackOutline,
  cubeOutline,
} from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { ReturnsService, ReturnNoteItem } from '../../core/services/returns.service';
import { Order, OrderItem } from '../../core/models/models';

interface DraftReturn {
  item: OrderItem;
  selected: boolean;
  qty: number;
}

@Component({
  selector: 'app-order-return',
  templateUrl: './order-return.page.html',
  styleUrls: ['./order-return.page.scss'],
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
    IonCheckbox,
    IonToggle,
    IonNote,
    IonBadge,
    FormsModule,
  ],
})
export class OrderReturnPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ordersService = inject(OrdersService);
  private returnsService = inject(ReturnsService);
  private toastCtrl = inject(ToastController);

  readonly busy = signal(false);
  readonly order = signal<Order | null>(null);
  readonly drafts = signal<DraftReturn[]>([]);
  readonly refunded = signal(true);

  note = '';
  error = '';

  constructor() {
    addIcons({ saveOutline, closeOutline, returnDownBackOutline, cubeOutline });
  }

  get total(): number {
    return this.drafts()
      .filter((d) => d.selected && d.qty > 0)
      .reduce((s, d) => s + d.item.price * Math.min(d.qty, d.item.qty), 0);
  }

  get selectedCount(): number {
    return this.drafts().filter((d) => d.selected).length;
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.busy.set(true);
    try {
      const { order, items } = await this.ordersService.getWithItems(id);
      if (order) {
        this.order.set(order);
        this.drafts.set(items.map((item) => ({ item, selected: false, qty: item.qty })));
      }
    } catch (e: any) {
      this.error = e?.message ?? 'Không tải được đơn hàng.';
    } finally {
      this.busy.set(false);
    }
  }

  toggleAll(ev: any) {
    const checked = !!ev?.detail?.checked;
    this.drafts.update((list) => list.map((d) => ({ ...d, selected: checked })));
  }

  get allSelected(): boolean {
    return this.drafts().length > 0 && this.drafts().every((d) => d.selected);
  }

  async save() {
    this.error = '';
    const order = this.order();
    if (!order) return;

    const items: ReturnNoteItem[] = this.drafts()
      .filter((d) => d.selected && d.qty > 0)
      .map((d) => ({
        product_id: d.item.product_id,
        name: d.item.name,
        price: d.item.price,
        qty: Math.min(d.qty, d.item.qty),
      }));

    if (!items.length) {
      this.error = 'Chọn ít nhất một sản phẩm cần trả.';
      return;
    }

    this.busy.set(true);
    try {
      const created = await this.returnsService.create(
        {
          order_id: order.id,
          order_code: order.code,
          customer_id: order.customer_id,
          refunded: this.refunded(),
          note: this.note.trim() || null,
        },
        items
      );
      const t = await this.toastCtrl.create({
        message: `Đã tạo phiếu trả ${created.code} — tồn kho đã được hoàn lại`,
        duration: 2200,
        color: 'success',
        position: 'bottom',
      });
      await t.present();
      this.router.navigateByUrl(`/order/${order.id}`, { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Tạo phiếu trả thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  goBack() {
    const id = this.order()?.id;
    if (id) {
      this.router.navigateByUrl(`/order/${id}`, { replaceUrl: true });
    } else {
      this.router.navigateByUrl('/order');
    }
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}
