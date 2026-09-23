import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonSpinner, IonNote, IonFab, IonFabButton, IonButton,
  IonRefresher, IonRefresherContent, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, gridOutline, downloadOutline, trashOutline } from 'ionicons/icons';
import {
  CustomTablesService,
  CustomTable,
  CustomTableRow,
} from '../../core/services/custom-tables.service';

@Component({
  selector: 'app-custom-table-detail',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonSpinner, IonNote, IonFab, IonFabButton,
    IonButton, IonRefresher, IonRefresherContent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/custom-table" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>{{ table()?.name ?? 'Bảng dữ liệu' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [disabled]="rows().length === 0" (click)="exportCsv()">
            <ion-icon slot="icon-only" name="download-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <ion-refresher slot="fixed" (ionRefresh)="doRefresh($any($event))">
        <ion-refresher-content />
      </ion-refresher>
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (!table()) {
          <div class="app-empty">
            <div><ion-icon name="grid-outline" /></div>
            Không tìm thấy bảng. Có thể bảng đã bị xóa.
          </div>
        } @else if (rows().length === 0) {
          <div class="app-empty">
            <div><ion-icon name="grid-outline" /></div>
            Bảng trống. Nhấn + để thêm dòng dữ liệu.
          </div>
        } @else {
          <div class="app-card table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  @for (c of table()!.columns; track c.key) {
                    <th>{{ c.label }}</th>
                  }
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr>
                    @for (c of table()!.columns; track c.key) {
                      <td>{{ display(r, c.key, c.type) }}</td>
                    }
                    <td>
                      <ion-button fill="clear" color="danger" size="small" (click)="removeRow(r)">
                        <ion-icon slot="icon-only" name="trash-outline" />
                      </ion-button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <ion-note class="page-hint">{{ rows().length }} dòng · nhấn biểu tượng tải để xuất CSV</ion-note>
        }
      </div>

      @if (table()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button (click)="openAddRow()"><ion-icon name="add-outline" /></ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .table-scroll { overflow-x: auto; padding: 4px; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th { text-align: left; padding: 8px 10px; color: var(--app-text-muted); font-weight: 600; white-space: nowrap; border-bottom: 1px solid var(--app-border); }
    .data-table td { padding: 8px 10px; color: var(--app-text); white-space: nowrap; border-bottom: 1px dashed var(--app-border); }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 4px; }
  `],
})
export class CustomTableDetailPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(CustomTablesService);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly table = signal<CustomTable | null>(null);
  readonly rows = signal<CustomTableRow[]>([]);
  readonly loading = signal(true);

  private tableId = '';

  constructor() {
    addIcons({ addOutline, gridOutline, downloadOutline, trashOutline });
  }

  ngOnInit(): void {
    this.tableId = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const table = await this.service.get(this.tableId);
      this.table.set(table);
      this.rows.set(table ? await this.service.listRows(table.id) : []);
    } catch (e: any) {
      console.error('load custom table failed', e);
      this.table.set(null);
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  display(row: CustomTableRow, key: string, type: string): string {
    const v = row.data?.[key];
    if (v === null || v === undefined || v === '') return '—';
    if (type === 'boolean') return v ? 'Có' : 'Không';
    if (type === 'number') return new Intl.NumberFormat('vi-VN').format(Number(v));
    return String(v);
  }

  async openAddRow() {
    const t = this.table();
    if (!t) return;
    const inputs = t.columns.map((c) => ({
      name: c.key,
      type: c.type === 'number' ? ('number' as const) : ('text' as const),
      placeholder: c.label + (c.type === 'date' ? ' (YYYY-MM-DD)' : ''),
    }));
    const alert = await this.alertCtrl.create({
      header: `Thêm dòng — ${t.name}`,
      inputs,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            const rowData: Record<string, any> = {};
            for (const c of t.columns) {
              const raw = data?.[c.key];
              if (raw === undefined || raw === null || raw === '') continue;
              rowData[c.key] = c.type === 'number' ? Number(raw) : raw;
            }
            try {
              await this.service.addRow(t.id, rowData);
              this.toast('Đã thêm dòng');
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

  async removeRow(r: CustomTableRow) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa dòng',
      message: 'Xóa dòng dữ liệu này?',
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: async () => {
            try {
              await this.service.removeRow(r.id);
              this.toast('Đã xóa dòng');
              await this.load();
            } catch (e: any) {
              this.toast(e?.message ?? 'Xóa thất bại', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  exportCsv() {
    const t = this.table();
    if (!t) return;
    const csv = CustomTablesService.toCsv(t, this.rows());
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.name.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
