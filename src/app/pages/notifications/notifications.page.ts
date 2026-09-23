import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSpinner,
  IonButton,
  IonNote,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  notificationsOutline,
  warningOutline,
  documentTextOutline,
  boatOutline,
  receiptOutline,
  checkmarkDoneOutline,
} from 'ionicons/icons';
import { NotificationsService, AppNotification } from '../../core/services/notifications.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSpinner,
    IonButton,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class NotificationsPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly notificationsService = inject(NotificationsService);
  private router = inject(Router);

  readonly items = signal<AppNotification[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(true);

  constructor() {
    addIcons({
      notificationsOutline,
      warningOutline,
      documentTextOutline,
      boatOutline,
      receiptOutline,
      checkmarkDoneOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.notificationsService.build();
      this.items.set(list);
      this.unread.set(this.notificationsService.countUnread(list));
    } finally {
      this.loading.set(false);
    }
  }

  doRefresh(event: CustomEvent) {
    this.load().finally(() => (event.target as HTMLIonRefresherElement).complete());
  }

  open(item: AppNotification) {
    this.notificationsService.markAllRead();
    this.router.navigateByUrl(item.path);
  }

  markRead() {
    this.notificationsService.markAllRead();
    this.unread.set(0);
  }
}
