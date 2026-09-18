import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonButton, IonSpinner, IonBadge, IonNote, IonFab, IonFabButton, IonCheckbox,
  IonList, IonItem, IonLabel,
  AlertController, ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  calendarOutline, addOutline, chevronBackOutline, chevronForwardOutline,
  createOutline, trashOutline, closeOutline, checkmarkCircleOutline,
} from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';

interface CalEvent {
  id: string;
  title: string;
  details: string | null;
  event_date: string;
  color: string;
  done: boolean;
}

@Component({
  selector: 'app-calendar',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonButton, IonSpinner, IonBadge, IonNote, IonFab, IonFabButton,
    IonCheckbox, IonList, IonItem, IonLabel, FormsModule,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Lịch</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="prevMonth()"><ion-icon slot="icon-only" name="chevron-back-outline" /></ion-button>
          <ion-button (click)="nextMonth()"><ion-icon slot="icon-only" name="chevron-forward-outline" /></ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-title class="month-title">{{ monthLabel() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      @if (loading()) {
        <div class="page-loading"><ion-spinner name="crescent" /></div>
      } @else {
        <div class="app-page-container">
          <div class="cal-grid">
            @for (d of weekDays; track d) {
              <div class="cal-head">{{ d }}</div>
            }
            @for (cell of grid(); track $index) {
              @if (cell) {
                <div class="cal-cell" [class.today]="cell.isToday" [class.selected]="cell.date === selectedDate()" (click)="selectDate(cell)">
                  <span class="cal-day">{{ cell.day }}</span>
                  @if (cell.count > 0) {
                    <div class="cal-dots">
                      @for (e of cell.events.slice(0, 3); track e.id) {
                        <span class="cal-dot" [style.background]="dotColor(e.color)"></span>
                      }
                    </div>
                  }
                </div>
              } @else {
                <div class="cal-cell empty"></div>
              }
            }
          </div>

          <div class="app-card">
            <div class="app-card-title">
              <h4><ion-icon name="calendar-outline" /> Sự kiện {{ labelForSelected() }}</h4>
            </div>
            @if (selectedEvents().length === 0) {
              <div class="app-empty">Không có sự kiện nào</div>
            } @else {
              <ion-list lines="full">
                @for (e of selectedEvents(); track e.id) {
                  <ion-item>
                    <ion-checkbox slot="start" [checked]="e.done" (ionChange)="toggleDone(e)" />
                    <ion-label>
                      <h3 [class.done]="e.done">{{ e.title }}</h3>
                      @if (e.details) { <p>{{ e.details }}</p> }
                    </ion-label>
                    <ion-button slot="end" fill="clear" size="small" (click)="editEvent(e)">
                      <ion-icon slot="icon-only" name="create-outline" />
                    </ion-button>
                    <ion-button slot="end" fill="clear" size="small" color="danger" (click)="deleteEvent(e)">
                      <ion-icon slot="icon-only" name="trash-outline" />
                    </ion-button>
                  </ion-item>
                }
              </ion-list>
            }
          </div>
        </div>
      }

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="addEvent()"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    .month-title { font-weight: 800; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 14px; }
    .cal-head { text-align: center; font-size: 11px; font-weight: 700; color: var(--app-text-muted); padding: 4px 0; }
    .cal-cell { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 10px; min-height: 52px; padding: 4px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .cal-cell.empty { background: transparent; border: none; }
    .cal-cell.today { border-color: var(--ion-color-primary); }
    .cal-cell.selected { background: rgba(var(--ion-color-primary-rgb), 0.12); }
    .cal-day { font-size: 12.5px; font-weight: 600; color: var(--app-text); }
    .cal-dots { display: flex; gap: 2px; }
    .cal-dot { width: 5px; height: 5px; border-radius: 50%; }
    .done { text-decoration: line-through; opacity: 0.55; }
  `],
})
export class CalendarPage implements OnInit {
  private svc = inject(ShopTableService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  readonly loading = signal(false);
  readonly events = signal<CalEvent[]>([]);
  readonly cursor = signal(new Date());
  readonly selectedDate = signal(this.toIso(new Date()));

  private monthStart = computed(() => {
    const c = this.cursor();
    return new Date(c.getFullYear(), c.getMonth(), 1);
  });

  readonly monthLabel = computed(() => `Tháng ${this.monthStart().getMonth() + 1}/${this.monthStart().getFullYear()}`);

  readonly grid = computed(() => {
    const start = this.monthStart();
    const lead = (start.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const cells: (null | { date: string; day: number; isToday: boolean; count: number; events: CalEvent[] })[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), d);
      const iso = this.toIso(date);
      const evts = this.events().filter((e) => e.event_date === iso);
      cells.push({
        date: iso,
        day: d,
        isToday: iso === this.toIso(new Date()),
        count: evts.length,
        events: evts,
      });
    }
    return cells;
  });

  readonly selectedEvents = computed(() =>
    this.events()
      .filter((e) => e.event_date === this.selectedDate())
      .sort((a, b) => Number(a.done) - Number(b.done))
  );

  constructor() {
    addIcons({ calendarOutline, addOutline, chevronBackOutline, chevronForwardOutline, createOutline, trashOutline, closeOutline, checkmarkCircleOutline });
  }

  ngOnInit(): void { this.load(); }

  static toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private toIso(d: Date): string {
    return CalendarPage.toIso(d);
  }

  async load() {
    this.loading.set(true);
    try {
      const all = await this.svc.list<CalEvent>('calendar_events', 'event_date', false);
      this.events.set(all);
    } catch (e: any) {
      console.error('load events failed', e);
      this.events.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  prevMonth() {
    const c = this.cursor();
    this.cursor.set(new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }

  nextMonth() {
    const c = this.cursor();
    this.cursor.set(new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }

  selectDate(cell: { date: string }) {
    this.selectedDate.set(cell.date);
  }

  labelForSelected(): string {
    const d = new Date(this.selectedDate() + 'T00:00:00');
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  dotColor(color: string): string {
    const map: Record<string, string> = { primary: 'var(--ion-color-primary)', success: 'var(--ion-color-success)', warning: 'var(--ion-color-warning)', danger: 'var(--ion-color-danger)' };
    return map[color] ?? 'var(--ion-color-primary)';
  }

  async toggleDone(e: CalEvent) {
    try {
      await this.svc.update('calendar_events', e.id, { done: !e.done });
      this.events.update((list) => list.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)));
    } catch (err: any) {
      this.toast(err?.message ?? 'Cập nhật thất bại', 'danger');
    }
  }

  async addEvent() {
    await this.openForm(null);
  }

  async editEvent(e: CalEvent) {
    await this.openForm(e);
  }

  private async openForm(existing: CalEvent | null) {
    const alert = await this.alertCtrl.create({
      header: existing ? 'Sửa sự kiện' : 'Thêm sự kiện',
      inputs: [
        { name: 'title', type: 'text', placeholder: 'Tiêu đề *', value: existing?.title ?? '' },
        { name: 'details', type: 'text', placeholder: 'Chi tiết', value: existing?.details ?? '' },
        { name: 'date', type: 'date', value: existing?.event_date ?? this.selectedDate() },
        { name: 'color', type: 'radio', label: 'Xanh dương', value: 'primary', checked: (existing?.color ?? 'primary') === 'primary' },
        { name: 'color', type: 'radio', label: 'Xanh lá', value: 'success', checked: existing?.color === 'success' },
        { name: 'color', type: 'radio', label: 'Vàng', value: 'warning', checked: existing?.color === 'warning' },
        { name: 'color', type: 'radio', label: 'Đỏ', value: 'danger', checked: existing?.color === 'danger' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Lưu',
          handler: async (data) => {
            if (!data?.title?.trim()) {
              this.toast('Vui lòng nhập tiêu đề', 'danger');
              return false;
            }
            try {
              if (existing) {
                await this.svc.update('calendar_events', existing.id, {
                  title: data.title.trim(),
                  details: data.details?.trim() || null,
                  event_date: data.date,
                  color: data.color ?? 'primary',
                });
              } else {
                await this.svc.create('calendar_events', {
                  title: data.title.trim(),
                  details: data.details?.trim() || null,
                  event_date: data.date || this.selectedDate(),
                  color: data.color ?? 'primary',
                });
              }
              this.selectedDate.set(data.date || this.selectedDate());
              await this.load();
              return true;
            } catch (err: any) {
              this.toast(err?.message ?? 'Lưu thất bại', 'danger');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async deleteEvent(e: CalEvent) {
    const alert = await this.alertCtrl.create({
      header: 'Xóa sự kiện',
      message: `Xóa "${e.title}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa', role: 'destructive',
          handler: async () => {
            try {
              await this.svc.remove('calendar_events', e.id);
              await this.load();
            } catch (err: any) {
              this.toast(err?.message ?? 'Xóa thất bại', 'danger');
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
