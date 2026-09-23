import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonSearchbar, IonList, IonItem, IonLabel, IonBadge, IonFab, IonFabButton, IonSpinner,
  IonNote, IonRefresher, IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowRedoOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';

interface Transfer {
  id: string;
  code: string;
  destination: string | null;
  items: Array<{ product_id: string | null; name: string; qty: number }>;
  note: string | null;
  created_at: string;
}

@Component({
  selector: 'app-transfers',
  imports: [
    IonButton,
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonSearchbar, IonList, IonItem, IonLabel, IonBadge, IonFab, IonFabButton,
    IonSpinner, IonNote, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>Chuyển hàng</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm theo mã phiếu" [debounce]="300" (ionInput)="onSearch($any($event))" />
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
            <div><ion-icon name="arrow-redo-outline" /></div>
            Chưa có phiếu chuyển hàng nào. Nhấn + để tạo.
          </div>
        } @else {
          <div class="app-card">
            <ion-list lines="full">
              @for (t of items(); track t.id) {
                <ion-item>
                  <ion-icon slot="start" name="arrow-redo-outline" color="primary" />
                  <ion-label>
                    <h3>{{ t.code }}</h3>
                    <p>
                      {{ t.destination ?? 'Không rõ nơi đến' }} · {{ t.items.length }} SP ·
                      {{ t.created_at | date: 'dd/MM HH:mm' }}
                    </p>
                  </ion-label>
                  <ion-badge slot="end" color="primary">{{ totalQty(t) }} SP</ion-badge>
                </ion-item>
              }
            </ion-list>
          </div>
          <ion-note class="page-hint">Phiếu chuyển làm giảm tồn kho của cửa hàng</ion-note>
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
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 15px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class TransfersPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly svc = inject(ShopTableService);
  private router = inject(Router);

  readonly items = signal<Transfer[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, arrowRedoOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.svc.list<Transfer>('transfers', 'created_at', false, { column: 'code', term: this.search });
      this.items.set(list.map((t) => ({ ...t, items: Array.isArray(t.items) ? t.items : [] })));
    } catch (e: any) {
      console.error('load transfers failed', e);
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

  totalQty(t: Transfer): number {
    return (t.items ?? []).reduce((s, i) => s + Number(i.qty ?? 0), 0);
  }

  openAdd() {
    this.router.navigateByUrl('/transfer/add');
  }
}
