import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { IonFab, IonFabButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, sparklesOutline, caretUpOutline } from 'ionicons/icons';

/**
 * Bộ 3 nút nổi chuẩn ISale, dùng chung mọi trang danh sách:
 *  - FAB chính (giữa đáy): hành động thêm mới của trang
 *  - FAB AI (góc phải dưới): mở Dịch vụ AI
 *  - FAB lên đầu trang (góc phải dưới, hiện khi cuộn)
 */
@Component({
  selector: 'app-fab-trio',
  template: `
    <ion-fab slot="fixed" vertical="bottom" horizontal="center" class="fab-main">
      <ion-fab-button (click)="mainAction.emit()" [attr.aria-label]="mainLabel">
        <ion-icon [name]="mainIcon" />
      </ion-fab-button>
    </ion-fab>
    <ion-fab slot="fixed" vertical="bottom" horizontal="end" class="fab-side">
      <ion-fab-button size="small" (click)="openAi()" aria-label="Dịch vụ AI">
        <ion-icon name="sparkles-outline" />
      </ion-fab-button>
    </ion-fab>
    <ion-fab
      *ngIf="showScrollTop"
      slot="fixed"
      vertical="bottom"
      horizontal="end"
      class="fab-side fab-top"
    >
      <ion-fab-button size="small" color="light" (click)="scrollTop()" aria-label="Lên đầu trang">
        <ion-icon name="caret-up-outline" />
      </ion-fab-button>
    </ion-fab>
  `,
  styles: [
    `
      .fab-main {
        bottom: 76px;
      }
      .fab-side {
        bottom: 76px;
      }
      .fab-side.fab-top {
        bottom: 138px;
      }
      ion-fab-button {
        --box-shadow: 0 4px 10px rgba(var(--ion-color-primary-rgb), 0.4);
      }
      ion-fab-button[color='light'] {
        --background: var(--app-surface, #fff);
        --color: var(--ion-color-primary);
        --box-shadow: 0 2px 8px rgba(16, 24, 40, 0.18);
      }
    `,
  ],
  imports: [IonFab, IonFabButton, IonIcon, NgIf],
})
export class FabTrioComponent implements AfterViewInit, OnDestroy {
  @Input() mainIcon: string = 'add';
  @Input() mainLabel: string = 'Thêm mới';
  @Input() aiPath: string | null = '/module/ai-services';
  @Output() mainAction = new EventEmitter<void>();

  showScrollTop = false;
  private scrollHandler: ((e: CustomEvent) => void) | null = null;

  private el = inject(ElementRef);
  private router = inject(Router);

  constructor() {
    addIcons({ add, sparklesOutline, caretUpOutline });
  }

  ngAfterViewInit(): void {
    const content = (this.el.nativeElement as HTMLElement).closest('ion-content');
    if (content) {
      this.scrollHandler = (e: CustomEvent) => {
        this.showScrollTop = (e.detail as { scrollY: number }).scrollY > 240;
      };
      content.addEventListener('ionScroll', this.scrollHandler as EventListener);
    }
  }

  ngOnDestroy(): void {
    const content = (this.el.nativeElement as HTMLElement).closest('ion-content');
    if (content && this.scrollHandler) {
      content.removeEventListener('ionScroll', this.scrollHandler as EventListener);
    }
  }

  scrollTop(): void {
    const content = (this.el.nativeElement as HTMLElement).closest('ion-content') as {
      scrollToTop: (d?: number) => Promise<void>;
    } | null;
    content?.scrollToTop(300);
  }

  openAi(): void {
    if (this.aiPath) this.router.navigateByUrl(this.aiPath);
  }
}
