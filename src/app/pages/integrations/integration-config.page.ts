import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent,
  IonList, IonItem, IonLabel, IonToggle, IonSpinner, IonNote, IonButton, IonInput,
  IonBadge, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  saveOutline, warningOutline, checkmarkCircleOutline, informationCircleOutline,
} from 'ionicons/icons';
import { IntegrationsService, IntegrationProvider, ProviderMeta } from '../../core/services/integrations.service';

/**
 * Trang cấu hình tích hợp dùng chung cho nhiều nhà cung cấp.
 * Nhà cung cấp được chọn qua `data.provider` trên route.
 */
@Component({
  selector: 'app-integration-config',
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonToggle, IonSpinner, IonNote, IonButton,
    IonInput, IonBadge,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/integrations" /><ion-button (click)="openHome()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons>
        <ion-title>{{ meta()?.name ?? 'Cấu hình tích hợp' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <div class="app-page-container">
        @if (loading()) {
          <div class="page-loading"><ion-spinner name="crescent" /></div>
        } @else if (!meta()) {
          <div class="app-empty">
            <div><ion-icon name="warning-outline" /></div>
            Không xác định được nhà cung cấp cần cấu hình.
          </div>
        } @else {
          <div class="app-banner-warning">
            <ion-icon name="warning-outline" />
            <span>{{ meta()!.requirement }}</span>
          </div>

          <div class="app-card">
            <ion-list lines="full">
              <ion-item>
                <ion-icon slot="start" [name]="enabled() ? 'checkmark-circle-outline' : 'information-circle-outline'"
                          [color]="enabled() ? 'success' : 'medium'" />
                <ion-label>
                  <h3>Bật tích hợp</h3>
                  <p>{{ meta()!.description }}</p>
                </ion-label>
                <ion-toggle slot="end" [checked]="enabled()" (ionChange)="enabled.set($any($event.detail.checked))" />
              </ion-item>

              @for (f of meta()!.fields; track f.key) {
                <ion-item>
                  <ion-input
                    [label]="f.label"
                    labelPlacement="stacked"
                    [type]="f.type === 'password' ? 'password' : 'text'"
                    [placeholder]="f.placeholder ?? ''"
                    [value]="config()[f.key] ?? ''"
                    (ionInput)="setField(f.key, $any($event.detail.value))"
                  />
                </ion-item>
              }
            </ion-list>
          </div>

          <ion-button expand="block" (click)="save()">
            <ion-icon slot="start" name="save-outline" /> Lưu cấu hình
          </ion-button>

          <ion-note class="page-hint">
            Cấu hình được lưu theo cửa hàng. Các khoá bí mật chỉ hiển thị cho chủ cửa hàng.
          </ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); }
    .page-loading { display: flex; justify-content: center; padding: 40px 0; }
    ion-list { background: transparent; }
    ion-item { --background: transparent; }
    ion-item h3 { font-size: 14.5px; font-weight: 600; color: var(--app-text); }
    ion-item p { color: var(--app-text-muted); font-size: 12.5px; }
    .page-hint { display: block; text-align: center; font-size: 12px; padding: 10px 4px; }
  `],
})
export class IntegrationConfigPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  private service = inject(IntegrationsService);
  private route = inject(ActivatedRoute);
  private toastCtrl = inject(ToastController);

  readonly meta = signal<ProviderMeta | null>(null);
  readonly enabled = signal(false);
  readonly config = signal<Record<string, any>>({});
  readonly loading = signal(true);

  private provider: IntegrationProvider = 'fbpage';

  constructor() {
    addIcons({ saveOutline, warningOutline, checkmarkCircleOutline, informationCircleOutline });
  }

  ngOnInit(): void {
    this.provider = (this.route.snapshot.data['provider'] ?? 'fbpage') as IntegrationProvider;
    this.meta.set(this.service.providerMeta(this.provider) ?? null);
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const all = await this.service.list();
      const current = all.find((s) => s.provider === this.provider);
      // Nếu chưa có config cho AI, điền sẵn giá trị mặc định từ ViLao
      if (!current) {
        this.enabled.set(false);
        this.config.set({
          base_url: 'https://api.vilao.ai/v1',
          model: 'DeepSeek V4.1 Flash',
          api_key: ''
        });
      } else {
        this.enabled.set(current.enabled ?? false);
        this.config.set(current.config ?? {});
      }
    } catch (e: any) {
      console.error('load integration config failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  setField(key: string, value: any) {
    this.config.set({ ...this.config(), [key]: value });
  }

  async save() {
    try {
      await this.service.save(this.provider, this.enabled(), this.config());
      this.toast('Đã lưu cấu hình');
    } catch (e: any) {
      this.toast(e?.message ?? 'Lưu thất bại', 'danger');
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }
}
