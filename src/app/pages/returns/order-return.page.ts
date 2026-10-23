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
  /** Số lượng theo đơn vị khách đã mua (Thùng/Lốc...). */
  qty: number;
  /** Tối đa theo đơn vị khách đã mua, đã trừ các lần trả trước. */
  maxUnits: number;
  /** Tối đa theo đơn vị gốc, đã trừ các lần trả trước. */
  maxBase: number;
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
  /** Giữ nguyên qua các lần bấm Lưu để retry không sinh phiếu trả trùng. */
  private readonly nonce = crypto.randomUUID();

  constructor() {
    addIcons({ saveOutline, closeOutline, returnDownBackOutline, cubeOutline });
  }

  get total(): number {
    return this.drafts()
      .filter((d) => d.selected && d.qty > 0)
      .reduce((s, d) => s + this.unitPrice(d.item) * Math.min(d.qty, d.maxUnits), 0);
  }

  /** 1 đơn vị khách đã mua = bao nhiêu đơn vị gốc. */
  unitConversion(item: OrderItem): number {
    const n = Number(item.unit_conversion);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  unitPrice(item: OrderItem): number {
    return item.unit_price != null ? Number(item.unit_price) : Number(item.price ?? 0);
  }

  formatQty(v: number): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(v ?? 0);
  }

  get selectedCount(): number {
    return this.drafts().filter((d) => d.selected).length;
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.busy.set(true);
    try {
      const [{ order, items }, previous] = await Promise.all([
        this.ordersService.getWithItems(id),
        this.returnsService.listByOrder(id).catch(() => []),
      ]);
      if (order) {
        this.order.set(order);
        // Trừ số lượng đã trả ở các phiếu trước (quy về đơn vị gốc) — không cho
        // trả vượt số đã mua, kể cả khi khách mua theo Thùng/Lốc.
        const returned = new Map<string, number>();
        for (const note of previous) {
          for (const it of note.items) {
            const key = it.product_id ?? `name:${it.name}`;
            returned.set(key, (returned.get(key) ?? 0) + Number(it.qty ?? 0));
          }
        }
        this.drafts.set(
          items.map((item) => {
            const key = item.product_id ?? `name:${item.name}`;
            const conversion = this.unitConversion(item);
            const maxBase = Math.max(0, Number(item.qty) - (returned.get(key) ?? 0));
            const maxUnits = Math.max(0, Math.floor(maxBase / conversion + 1e-9));
            const wanted = item.unit_qty != null ? Number(item.unit_qty) : maxUnits;
            return { item, selected: false, qty: Math.min(wanted, maxUnits), maxUnits, maxBase };
          })
        );
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
      .map((d) => {
        const unitQty = Math.min(d.qty, d.maxUnits);
        // Phiếu trả kho lưu số lượng/giá theo đơn vị gốc để hoàn tồn kho đúng;
        // giao diện chỉ hiển thị theo đơn vị khách đã mua.
        const baseQty = Math.min(unitQty * this.unitConversion(d.item), d.maxBase);
        return {
          product_id: d.item.product_id,
          name: d.item.name,
          price: d.item.price,
          qty: baseQty,
        };
      });

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
          idempotencyKey: this.nonce,
        },
        items
      );
      const cash = Number(created.cash_refund ?? 0);
      const credit = Number(created.debt_credit ?? 0);
      const parts: string[] = [];
      if (cash > 0) parts.push(`hoàn tiền mặt ${this.formatMoney(cash)}`);
      if (credit > 0) parts.push(`giảm công nợ ${this.formatMoney(credit)}`);
      const moneyNote = parts.length ? `; ${parts.join(', ')}` : '; không phát sinh hoàn tiền';
      const t = await this.toastCtrl.create({
        message: `Đã tạo phiếu trả ${created.code} — tồn kho đã hoàn lại${moneyNote}`,
        duration: 3200,
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
