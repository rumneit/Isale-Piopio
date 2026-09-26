import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonSearchbar,
  IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, gitBranchOutline, createOutline, trashOutline, peopleOutline } from 'ionicons/icons';
import { SalesRoutesService, SalesRoute } from '../../core/services/sales-routes.service';

@Component({
  selector: 'app-sales-routes',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonSearchbar, IonFab, IonFabButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Tuyến bán hàng</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm tuyến" [debounce]="300" (ionInput)="onSearch($any($event))" />
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (items().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="git-branch-outline" /></div>
            Chưa có tuyến bán hàng. Nhấn + để tạo tuyến.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (route of items(); track route.id) {
                <ion-item button (click)="openEdit(route)" detail="false">
                  <div class="route-dot" slot="start" [style.background]="route.color"></div>
                  <ion-label>
                    <h3>{{ route.name }}</h3>
                    <p>{{ route.description ?? '—' }}</p>
                  </ion-label>
                  <ion-badge slot="end" color="primary">
                    <ion-icon name="people-outline" /> {{ counts()[route.id] ?? 0 }}
                  </ion-badge>
                  @if (!route.active) {
                    <ion-badge slot="end" color="medium">Tạm dừng</ion-badge>
                  }
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Nhấn tuyến để sửa / xóa. Gán khách vào tuyến ở trang Khách hàng.</ion-note>
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="openAdd()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .route-dot { width: 14px; height: 14px; border-radius: 50%; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class SalesRoutesPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(SalesRoutesService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<SalesRoute[]>([]);
  readonly counts = signal<Record<string, number>>({});
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, gitBranchOutline, createOutline, trashOutline, peopleOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [routes, counts] = await Promise.all([
        this.service.list(this.search),
        this.service.customerCounts(),
      ]);
      this.items.set(routes);
      this.counts.set(counts);
    } catch (e: any) {
      console.error('load sales routes failed', e);
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

  private fields(route?: SalesRoute) {
    return [
      { name: 'name', type: 'text' as const, placeholder: 'Tên tuyến (VD: Tuyến Q1)', value: route?.name ?? '' },
      { name: 'description', type: 'text' as const, placeholder: 'Mô tả', value: route?.description ?? '' },
      { name: 'color', type: 'text' as const, placeholder: 'Màu (#6030ff)', value: route?.color ?? '#6030ff' },
    ];
  }

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm tuyến bán hàng',
      inputs: this.fields(),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên tuyến', 'danger');
              return false;
            }
            try {
              await this.service.create({
                name: data.name.trim(),
                description: data.description?.trim() || null,
                color: data.color?.trim() || '#6030ff',
                active: true,
              });
              this.toast('Đã thêm tuyến');
              await this.load();
              return true;
            } catch (e: any) {
              this.toast(e?.message ?? 'Thêm thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async openEdit(route: SalesRoute) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa tuyến',
      inputs: this.fields(route),
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.remove(route.id);
              this.toast('Đã xóa tuyến');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
            return true;
          },
        },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Tên không được trống', 'danger');
              return false;
            }
            try {
              await this.service.update(route.id, {
                name: data.name.trim(),
                description: data.description?.trim() || null,
                color: data.color?.trim() || '#6030ff',
              });
              this.toast('Đã lưu');
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

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
