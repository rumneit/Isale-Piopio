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
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonNote,
  IonBadge,
  IonCheckbox,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, closeOutline, addOutline, trashOutline, personOutline, cubeOutline } from 'ionicons/icons';
import { OrdersService } from '../../core/services/orders.service';
import { ProductsService } from '../../core/services/products.service';
import { CustomersService } from '../../core/services/customers.service';
import { TransactionsService } from '../../core/services/transactions.service';
import { Product, Customer } from '../../core/models/models';

interface DraftItem {
  product_id: string | null;
  name: string;
  price: number;
  qty: number;
}

@Component({
  selector: 'app-order-add',
  templateUrl: './order-add.page.html',
  styleUrls: ['./order-add.page.scss'],
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
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonNote,
    IonBadge,
    IonCheckbox,
    FormsModule,
  ],
})
export class OrderAddPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ordersService = inject(OrdersService);
  private productsService = inject(ProductsService);
  private customersService = inject(CustomersService);
  private transactionsService = inject(TransactionsService);
  private toastCtrl = inject(ToastController);

  readonly busy = signal(false);
  readonly products = signal<Product[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly items = signal<DraftItem[]>([]);
  readonly discount = signal(0);

  customerId: string | null = null;
  paid = true;
  recordIncome = true;
  note = '';
  error = '';

  constructor() {
    addIcons({ saveOutline, closeOutline, addOutline, trashOutline, personOutline, cubeOutline });
  }

  readonly isQuoteMode = signal(false);

  async ngOnInit(): Promise<void> {
    this.isQuoteMode.set(this.route.snapshot.queryParamMap.get('mode') === 'quote');
    try {
      const [products, customers] = await Promise.all([
        this.productsService.list(),
        this.customersService.list(),
      ]);
      this.products.set(products);
      this.customers.set(customers);
    } catch (e: any) {
      console.error('load order form data failed', e);
    }
  }

  get total(): number {
    return this.items().reduce((s, i) => s + i.price * i.qty, 0) - Number(this.discount() || 0);
  }

  addProduct(ev: CustomEvent) {
    const productId = ev.detail.value as string;
    if (!productId) return;
    const product = this.products().find((p) => p.id === productId);
    if (!product) return;

    const current = [...this.items()];
    const existing = current.find((i) => i.product_id === productId);
    if (existing) {
      existing.qty += 1;
    } else {
      current.push({ product_id: productId, name: product.name, price: Number(product.price), qty: 1 });
    }
    this.items.set(current);
    (ev.target as HTMLIonSelectElement).value = '';
  }

  removeItem(index: number) {
    const current = [...this.items()];
    current.splice(index, 1);
    this.items.set(current);
  }

  onDiscount(ev: any) {
    this.discount.set(Number(ev?.detail?.value ?? 0) || 0);
  }

  async save() {
    this.error = '';
    if (!this.items().length) {
      this.error = 'Đơn hàng cần ít nhất một sản phẩm.';
      return;
    }

    const customer = this.customers().find((c) => c.id === this.customerId);
    this.busy.set(true);
    try {
      const order = await this.ordersService.create(
        {
          customer_id: this.customerId,
          customer_name: customer?.name ?? 'Khách lẻ',
          status: this.isQuoteMode() ? 'quote' : 'pending',
          discount: Number(this.discount() || 0),
          paid: this.isQuoteMode() ? false : this.paid,
          note: this.note.trim() || null,
        },
        this.items()
      );

      if (!this.isQuoteMode() && this.paid && this.recordIncome && this.total > 0) {
        await this.transactionsService.create({
          type: 'income',
          category: 'Bán hàng',
          amount: this.total,
          note: `Thu tiền đơn ${order.code}`,
          occurred_at: new Date().toISOString(),
        });
      }

      this.toast('Đã tạo đơn hàng ' + order.code);
      this.router.navigateByUrl('/order', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Tạo đơn hàng thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 1800, color: 'success', position: 'bottom' });
    await t.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  goBack() {
    this.router.navigateByUrl('/order', { replaceUrl: true });
  }
}
