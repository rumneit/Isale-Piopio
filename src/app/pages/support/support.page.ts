import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonInput, IonTextarea,
  IonButton, IonSegment, IonSegmentButton, ToastController, IonListHeader,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { starOutline, star, ticketOutline, helpCircleOutline } from 'ionicons/icons';
import { ShopTableService } from '../../core/services/shop-table.service';

interface Ticket {
  id: string;
  subject: string;
  content: string | null;
  status: string;
  created_at: string;
}

interface Survey {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

@Component({
  selector: 'app-support',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonNote, IonInput,
    IonTextarea, IonButton, IonSegment, IonSegmentButton, IonListHeader, FormsModule,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/home" /></ion-buttons>
        <ion-title>Hỗ trợ</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))">
          <ion-segment-button value="ticket"><ion-label>Yêu cầu hỗ trợ</ion-label></ion-segment-button>
          <ion-segment-button value="survey"><ion-label>Đánh giá app</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        @if (tab() === 'ticket') {
          <div class="app-card">
            <div class="app-card-title"><h4><ion-icon name="ticket-outline" /> Gửi yêu cầu hỗ trợ</h4></div>
            <ion-list lines="full">
              <ion-item>
                <ion-input label="Tiêu đề *" labelPlacement="stacked" [(ngModel)]="ticketSubject" placeholder="VD: Không in được hóa đơn" />
              </ion-item>
              <ion-item>
                <ion-textarea label="Mô tả chi tiết" labelPlacement="stacked" [autoGrow]="true" [(ngModel)]="ticketContent" />
              </ion-item>
            </ion-list>
            <ion-button expand="block" class="send-btn" (click)="sendTicket()" [disabled]="busy()">
              {{ busy() ? 'Đang gửi...' : 'Gửi yêu cầu' }}
            </ion-button>
          </div>

          <div class="app-card">
            <div class="app-card-title"><h4>Lịch sử yêu cầu</h4></div>
            @if (tickets().length === 0) {
              <div class="app-empty">Chưa có yêu cầu nào</div>
            } @else {
              <ion-list lines="full">
                @for (t of tickets(); track t.id) {
                  <ion-item>
                    <ion-label>
                      <h3>{{ t.subject }}</h3>
                      <p>{{ t.content ?? '—' }} · {{ t.created_at | date: 'dd/MM HH:mm' }}</p>
                    </ion-label>
                    <ion-badge slot="end" [color]="t.status === 'open' ? 'warning' : 'success'">
                      {{ t.status === 'open' ? 'Đang xử lý' : 'Đã trả lời' }}
                    </ion-badge>
                  </ion-item>
                }
              </ion-list>
            }
          </div>
        } @else {
          <div class="app-card">
            <div class="app-card-title"><h4><ion-icon name="star-outline" /> Đánh giá PioPio</h4></div>
            <div class="stars">
              @for (s of [1, 2, 3, 4, 5]; track s) {
                <ion-icon [name]="s <= rating() ? 'star' : 'star-outline'" (click)="rating.set(s)" />
              }
            </div>
            <ion-list lines="full">
              <ion-item>
                <ion-textarea label="Ý kiến của bạn" labelPlacement="stacked" [autoGrow]="true" [(ngModel)]="surveyComment" />
              </ion-item>
            </ion-list>
            <ion-button expand="block" class="send-btn" (click)="sendSurvey()" [disabled]="busy()">
              {{ busy() ? 'Đang gửi...' : 'Gửi đánh giá' }}
            </ion-button>
          </div>

          @if (mySurveys().length > 0) {
            <div class="app-card">
              <ion-list-header>Lịch sử đánh giá</ion-list-header>
              <ion-list lines="full">
                @for (s of mySurveys(); track s.id) {
                  <ion-item>
                    <ion-icon slot="start" name="star" color="warning" />
                    <ion-label>
                      <h3>{{ s.rating }}/5 sao</h3>
                      <p>{{ s.comment ?? '—' }} · {{ s.created_at | date: 'dd/MM' }}</p>
                    </ion-label>
                  </ion-item>
                }
              </ion-list>
            </div>
          }
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .send-btn { margin: 10px 14px 14px; }
    .stars { display: flex; justify-content: center; gap: 8px; padding: 6px 0 12px; }
    .stars ion-icon { font-size: 34px; color: var(--ion-color-warning); cursor: pointer; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; white-space: normal; }
    ion-list-header { font-size: 13px; color: var(--app-text-muted); }
  `],
})
export class SupportPage implements OnInit {
  readonly svc = inject(ShopTableService);
  private toastCtrl = inject(ToastController);

  readonly tab = signal<'ticket' | 'survey'>('ticket');
  readonly busy = signal(false);
  readonly tickets = signal<Ticket[]>([]);
  readonly mySurveys = signal<Survey[]>([]);
  readonly rating = signal(5);

  ticketSubject = '';
  ticketContent = '';
  surveyComment = '';

  constructor() {
    addIcons({ starOutline, star, ticketOutline, helpCircleOutline });
  }

  ngOnInit(): void { this.load(); }

  async load() {
    try {
      const [tickets, surveys] = await Promise.all([
        this.svc.list<Ticket>('tickets', 'created_at', false),
        this.svc.list<Survey>('surveys', 'created_at', false),
      ]);
      this.tickets.set(tickets);
      this.mySurveys.set(surveys);
    } catch (e) {
      console.error('load support failed', e);
    }
  }

  async sendTicket() {
    if (!this.ticketSubject.trim()) {
      this.toast('Vui lòng nhập tiêu đề', 'danger');
      return;
    }
    this.busy.set(true);
    try {
      await this.svc.create('tickets', {
        subject: this.ticketSubject.trim(),
        content: this.ticketContent.trim() || null,
        status: 'open',
      });
      this.ticketSubject = '';
      this.ticketContent = '';
      this.toast('Đã gửi yêu cầu hỗ trợ');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Gửi thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async sendSurvey() {
    this.busy.set(true);
    try {
      await this.svc.create('surveys', {
        rating: this.rating(),
        comment: this.surveyComment.trim() || null,
      });
      this.surveyComment = '';
      this.toast('Cảm ơn bạn đã đánh giá!');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Gửi thất bại', 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
