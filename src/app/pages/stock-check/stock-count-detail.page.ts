import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton, IonSearchbar,
  IonInput, IonTextarea, IonFooter, AlertController, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  saveOutline, checkmarkDoneOutline, closeCircleOutline, cubeOutline, warningOutline,
} from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { StockCountsService } from '../../core/services/stock-counts.service';
import { Product, StockCountItem } from '../../core/models/models';

interface CountRow extends StockCountItem {
  counted: number | null;
}

/**
 * Tạo / chỉnh sửa phiếu kiểm kê kho.
 * - Hiển thị tồn hệ thống, cho nhập số lượng đếm thực tế, tính chênh lệch tức thời.
 * - "Lưu nháp" giữ phiếu ở trạng thái draft; "Hoàn tất" mới ghi tồn thật.
 */
@Component({
  selector: 'app-stock-count-detail',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonButton,
    IonSearchbar, IonInput, IonTextarea, IonFooter,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/stock-check" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>{{ isNew() ? 'Phiếu kiểm kê mới' : 'Phiếu ' + code() }}</ion-title>
        @if (!isNew()) {
          <ion-badge slot="end" [color]="statusColor()">{{ statusLabel() }}</ion-badge>
        }
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm sản phẩm theo tên hoặc mã" [debounce]="250" (ionInput)="onSearch($any($event))" />
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container">
          <div class="app-card">
            <div class="sc-summary">
              <div>
                <span class="sc-summary-label">Sản phẩm đếm</span>
                <strong>{{ countedRows().length }}/{{ rows().length }}</strong>
              </div>
              <div>
                <span class="sc-summary-label">Tổng chênh lệch</span>
                <strong [class.sc-pos]="totalDiff() > 0" [class.sc-neg]="totalDiff() < 0">
                  {{ totalDiff() > 0 ? '+' : '' }}{{ totalDiff() }}
                </strong>
              </div>
            </div>
            <ion-textarea
              fill="outline"
              label="Ghi chú phiếu"
              labelPlacement="floating"
              [autoGrow]="true"
              [value]="note()"
              (ionInput)="note.set($any($event.detail.value) ?? '')"
              [disabled]="readonly()"
            />
          </div>

          @if (rows().length === 0) {
            <div class="app-empty">
              <div><ion-icon name="cube-outline" /></div>
              Không có sản phẩm phù hợp
            </div>
          } @else {
            <div class="app-card">
              <ion-list lines="full">
                @for (row of rows(); track row.product_id ?? row.name) {
                  <ion-item>
                    <ion-icon slot="start" name="cube-outline" color="medium" />
                    <ion-label>
                      <h3>{{ row.name }}</h3>
                      <p>{{ row.sku ?? '—' }} · Tồn hệ thống: {{ row.system_qty }}</p>
                    </ion-label>
                    <div class="sc-qty" slot="end">
                      <ion-input
                        type="number"
                        inputmode="decimal"
                        placeholder="Đếm"
                        [value]="row.counted === null ? '' : row.counted"
                        (ionInput)="setCounted(row, $any($event.detail.value))"
                        [disabled]="readonly()"
                      />
                      @if (row.counted !== null) {
                        <ion-badge [color]="diffColor(row.counted - row.system_qty)">
                          {{ row.counted - row.system_qty > 0 ? '+' : '' }}{{ row.counted - row.system_qty }}
                        </ion-badge>
                      }
                    </div>
                  </ion-item>
                }
              </ion-list>
            </div>
          }

          <ion-note class="page-hint">
            <ion-icon name="warning-outline" />
            Chỉ khi bấm "Hoàn tất" tồn kho mới được cập nhật theo số đếm thực tế.
          </ion-note>
        </div>
      }

      @if (!readonly()) {
        <ion-footer>
          <ion-toolbar>
            <ion-button expand="block" fill="outline" (click)="saveDraft()" [disabled]="saving()">
              <ion-icon slot="start" name="save-outline" /> Lưu nháp
            </ion-button>
            <ion-button expand="block" color="success" (click)="complete()" [disabled]="saving() || isNew()">
              <ion-icon slot="start" name="checkmark-done-outline" /> Hoàn tất kiểm kê
            </ion-button>
          </ion-toolbar>
        </ion-footer>
      }
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .sc-summary { display: flex; gap: 24px; margin-bottom: 14px; }
    .sc-summary > div { display: flex; flex-direction: column; }
    .sc-summary-label { font-size: 11.5px; color: var(--app-text-muted); }
    .sc-summary strong { font-size: 19px; color: var(--app-text); }
    .sc-pos { color: var(--ion-color-success); }
    .sc-neg { color: var(--ion-color-danger); }
    .sc-qty { display: flex; align-items: center; gap: 8px; }
    .sc-qty ion-input { --padding-start: 8px; --padding-end: 8px; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); width: 92px; font-size: 14px; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: flex; align-items: center; gap: 6px; justify-content: center; font-size: 12px; padding: 4px; }
  `],
})
export class StockCountDetailPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productsService = inject(ProductsService);
  private stockCountsService = inject(StockCountsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly rows = signal<CountRow[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly note = signal('');
  readonly status = signal<'draft' | 'completed' | 'cancelled'>('draft');
  readonly code = signal('');

  private countId: string | null = null;
  private allRows: CountRow[] = [];
  private search = '';

  readonly isNew = computed(() => !this.countId);
  readonly readonly = computed(() => this.status() !== 'draft');
  readonly countedRows = computed(() => this.rows().filter((r) => r.counted !== null));
  readonly totalDiff = computed(() =>
    this.countedRows().reduce((s, r) => s + ((r.counted as number) - r.system_qty), 0)
  );

  constructor() {
    addIcons({ saveOutline, checkmarkDoneOutline, closeCircleOutline, cubeOutline, warningOutline });
  }

  ngOnInit(): void {
    this.countId = this.route.snapshot.paramMap.get('id');
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const products = await this.productsService.list();

      if (this.countId) {
        const count = await this.stockCountsService.get(this.countId);
        if (count) {
          this.code.set(count.code);
          this.status.set(count.status);
          this.note.set(count.note ?? '');
          this.allRows = count.items.map((i) => ({
            ...i,
            counted: i.counted_qty,
          }));
          this.applyFilter();
          return;
        }
      }

      this.allRows = products.map((p) => this.rowFromProduct(p));
      this.applyFilter();
    } catch (e: any) {
      this.toast(e?.message ?? 'Tải dữ liệu thất bại', 'danger');
      this.allRows = [];
      this.applyFilter();
    } finally {
      this.loading.set(false);
    }
  }

  private rowFromProduct(p: Product): CountRow {
    return {
      product_id: p.id,
      name: p.name,
      sku: p.sku,
      system_qty: Number(p.stock ?? 0),
      counted_qty: Number(p.stock ?? 0),
      diff: 0,
      counted: null,
    };
  }

  private applyFilter() {
    const term = this.search.trim().toLowerCase();
    const list = term
      ? this.allRows.filter(
          (r) => r.name.toLowerCase().includes(term) || (r.sku ?? '').toLowerCase().includes(term)
        )
      : this.allRows;
    this.rows.set([...list]);
  }

  onSearch(ev: CustomEvent) {
    this.search = (ev.detail as any).value ?? '';
    this.applyFilter();
  }

  setCounted(row: CountRow, value: any) {
    const raw = String(value ?? '').trim();
    const num = raw === '' ? null : Number(raw);
    row.counted = num === null || Number.isNaN(num) ? null : num;
    this.rows.update((list) => [...list]);
  }

  diffColor(diff: number): string {
    if (diff === 0) return 'medium';
    return diff > 0 ? 'success' : 'danger';
  }

  statusLabel(): string {
    return { draft: 'Nháp', completed: 'Đã chốt', cancelled: 'Đã hủy' }[this.status()];
  }

  statusColor(): string {
    return { draft: 'warning', completed: 'success', cancelled: 'medium' }[this.status()];
  }

  private buildItems(): StockCountItem[] {
    return this.countedRows().map((r) => ({
      product_id: r.product_id,
      name: r.name,
      sku: r.sku,
      system_qty: r.system_qty,
      counted_qty: r.counted as number,
      diff: (r.counted as number) - r.system_qty,
    }));
  }

  async saveDraft() {
    const items = this.buildItems();
    if (!items.length) {
      this.toast('Hãy nhập số lượng đếm cho ít nhất một sản phẩm', 'warning');
      return;
    }
    this.saving.set(true);
    try {
      if (this.countId) {
        await this.stockCountsService.updateDraft(this.countId, items, this.note() || null);
        this.toast('Đã lưu phiếu kiểm kê');
      } else {
        const created = await this.stockCountsService.createDraft(items, this.note() || null);
        this.countId = created.id;
        this.code.set(created.code);
        this.toast(`Đã tạo phiếu ${created.code}`);
      }
      this.router.navigateByUrl(`/stock-check/${this.countId}`, { replaceUrl: true });
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu phiếu thất bại', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async complete() {
    if (!this.countId) {
      this.toast('Hãy lưu nháp trước khi hoàn tất', 'warning');
      return;
    }
    const diff = this.totalDiff();
    const alert = await this.alertCtrl.create({
      header: 'Hoàn tất kiểm kê',
      message: `Tồn kho sẽ được cập nhật theo số đếm thực tế. Tổng chênh lệch: ${diff > 0 ? '+' : ''}${diff}. Tiếp tục?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Hoàn tất', handler: () => this.doComplete() },
      ],
    });
    await alert.present();
  }

  private async doComplete() {
    if (!this.countId) return;
    this.saving.set(true);
    try {
      await this.stockCountsService.complete(this.countId);
      this.status.set('completed');
      this.toast('Đã hoàn tất kiểm kê và cập nhật tồn kho');
    } catch (e: any) {
      this.toast(e?.message ?? 'Hoàn tất thất bại', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 2000, color, position: 'bottom' });
    await t.present();
  }
}
