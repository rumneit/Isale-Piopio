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
import { addIcons } from 'ionicons';
import {
  home,
  create,
  trash,
  close,
  call,
  mail,
  location,
  person,
  cash,
  star,
  receipt,
} from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { OrdersService } from '../../core/services/orders.service';
import { Customer, Order } from '../../core/models/models';

/**
 * Trang xem chi tiết khách hàng — theo ISale `#/contact/detail/:id`:
 * thông tin cơ bản + đơn hàng gần đây + hành động (Sửa, Xóa).
 */
@Component({
  selector: 'app-customer-detail',
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
        <ion-title>Chi tiết khách hàng</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="openEdit()" [disabled]="busy()">
            <ion-icon slot="icon-only" name="create" />
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
      } @else if (customer(); as c) {
        <div class="app-page-container">
          <div class="app-card detail-card">
            <div class="detail-head">
              <div class="avatar">{{ initial(c.name) }}</div>
              <div class="head-info">
                <h2 class="detail-name">{{ c.name }}</h2>
                <div class="sub">
                  @if (c.code) {<span class="chip">{{ c.code }}</span>}
                  @if (c.gender) {<span class="chip">{{ c.gender }}</span>}
                  @if (c.important) {<ion-badge color="warning">Quan trọng</ion-badge>}
                </div>
              </div>
            </div>

            <ion-list lines="full">
              <ion-item>
                <ion-icon name="call" slot="start" />
                <ion-label>
                  <h3>{{ c.phone || '—' }}</h3>
                  <p>Điện thoại</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-icon name="mail" slot="start" />
                <ion-label>
                  <h3>{{ c.email || '—' }}</h3>
                  <p>Email</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-icon name="location" slot="start" />
                <ion-label>
                  <h3>{{ c.address || '—' }}</h3>
                  <p>Địa chỉ</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-icon name="cash" slot="start" />
                <ion-label>
                  <h3 [class.debt]="(c.debt ?? 0) > 0">{{ formatMoney(c.debt ?? 0) }}</h3>
                  <p>Công nợ</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-icon name="person" slot="start" />
                <ion-label>
                  <h3>{{ c.gender || 'Không phân biệt' }}</h3>
                  <p>Giới tính</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-icon name="star" slot="start" />
                <ion-label>
                  <h3>{{ c.last_activity ? (c.last_activity | date: 'HH:mm dd/MM/yyyy') : '—' }}</h3>
                  <p>Hoạt động cuối</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>

          <!-- Đơn hàng gần đây -->
          <div class="app-card orders-card">
            <h3 class="section-title">
              <ion-icon name="receipt" />
              Đơn hàng gần đây
            </h3>
            @if (orders().length === 0) {
              <div class="orders-empty">Chưa có đơn hàng nào.</div>
            } @else {
              <div class="order-rows">
                @for (o of orders(); track o.id) {
                  <div class="order-row" (click)="openOrder(o)">
                    <div class="o-main">
                      <span class="o-code">{{ o.code }}</span>
                      <span class="o-date">{{ o.created_at | date: 'dd/MM/yyyy HH:mm' }}</span>
                    </div>
                    <div class="o-side">
                      <span class="o-total">{{ formatMoney(o.total) }}</span>
                      <ion-badge [color]="o.paid ? 'success' : 'warning'">{{ o.paid ? 'Đã TT' : 'Còn nợ' }}</ion-badge>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <ion-button expand="block" (click)="openEdit()">
            <ion-icon slot="start" name="create" />
            Sửa khách hàng
          </ion-button>
          <ion-button expand="block" color="danger" fill="outline" (click)="confirmDelete()" [disabled]="deleting()">
            <ion-icon slot="start" name="trash" />
            {{ deleting() ? 'Đang xóa...' : 'Xóa khách hàng' }}
          </ion-button>
        </div>
      } @else {
        <div class="app-empty">Không tìm thấy khách hàng</div>
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
        align-items: center;
        gap: 12px;
        padding: 0 0 12px;
        border-bottom: 1px solid var(--app-border);
        margin-bottom: 6px;
      }
      .avatar {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: rgba(96, 48, 255, 0.12);
        color: var(--ion-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 800;
        flex-shrink: 0;
      }
      .head-info {
        min-width: 0;
      }
      .detail-name {
        margin: 0 0 4px;
        font-size: 17px;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: #1f2a5a;
      }
      .sub {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .chip {
        background: var(--app-surface);
        border: 1px solid var(--app-border);
        border-radius: 999px;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 650;
        color: var(--app-text-muted);
      }
      .debt {
        color: var(--ion-color-danger);
      }
      .section-title {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 10px;
        font-size: 14.5px;
        font-weight: 750;
        color: #1f2a5a;
      }
      .orders-empty {
        font-size: 12.5px;
        color: var(--app-text-muted);
        padding: 4px 2px;
      }
      .order-rows {
        display: flex;
        flex-direction: column;
      }
      .order-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid var(--app-border);
        cursor: pointer;
        font-size: 12.5px;

        &:last-child {
          border-bottom: none;
        }
      }
      .o-main {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .o-code {
        font-weight: 700;
        color: var(--app-text);
      }
      .o-date {
        font-size: 11.5px;
        color: var(--app-text-muted);
      }
      .o-side {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .o-total {
        font-weight: 750;
        color: var(--app-text);
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
    IonLabel,
    IonBadge,
    IonNote,
  ],
})
export class CustomerDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private customersService = inject(CustomersService);
  private ordersService = inject(OrdersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly customerId = signal<string | null>(null);
  readonly customer = signal<Customer | null>(null);
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly deleting = signal(false);

  constructor() {
    addIcons({ home, create, trash, close, call, mail, location, person, cash, star, receipt });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.customerId.set(id);
      this.load(id);
    }
  }

  private async load(id: string) {
    this.loading.set(true);
    try {
      const [c, orders] = await Promise.all([
        this.customersService.get(id),
        this.ordersService.listByCustomer(id).catch(() => []),
      ]);
      this.customer.set(c);
      this.orders.set(orders);
    } catch (e: any) {
      this.toast(e?.message ?? 'Không tải được khách hàng.', 'danger');
    } finally {
      this.loading.set(false);
    }
  }

  initial(name: string): string {
    return (name ?? '?').trim().charAt(0).toUpperCase();
  }

  formatMoney(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  goBack() {
    this.router.navigateByUrl('/contact', { replaceUrl: true });
  }

  openEdit() {
    if (this.customerId()) this.router.navigateByUrl(`/contact/${this.customerId()}`);
  }

  openOrder(o: Order) {
    this.router.navigateByUrl(`/order/detail/${o.id}`);
  }

  async confirmDelete() {
    const c = this.customer();
    if (!c) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa khách hàng',
      message: `Bạn sắp xóa "${c.name}". Nội dung sẽ không thể khôi phục. Bạn có chắc muốn xóa?`,
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
      await this.customersService.remove(this.customerId()!);
      this.toast('Đã xóa khách hàng');
      this.router.navigateByUrl('/contact', { replaceUrl: true });
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
