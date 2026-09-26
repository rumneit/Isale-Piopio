import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, homeOutline, cartOutline } from 'ionicons/icons';

/**
 * Trang 404 — URL không tồn tại. Global-launch QA: trước đây route lạ bị
 * redirect êm về /home, người dùng không biết mình đang ở đâu.
 */
@Component({
  selector: 'app-not-found',
  templateUrl: './not-found.page.html',
  styleUrls: ['./not-found.page.scss'],
  imports: [CommonModule, IonContent, IonButton, IonIcon, RouterLink],
})
export class NotFoundPage {
  /** Đường dẫn sai để hiển thị cho người dùng (hash router) */
  get currentPath(): string {
    const hash = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
    return hash || (typeof location !== 'undefined' ? location.pathname : '');
  }

  constructor() {
    addIcons({ alertCircleOutline, homeOutline, cartOutline });
  }
}
