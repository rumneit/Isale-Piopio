import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonButton,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, nutritionOutline, createOutline, trashOutline } from 'ionicons/icons';
import { MaterialsService, Material } from '../../core/services/materials.service';

@Component({
  selector: 'app-materials',
  templateUrl: './materials.page.html',
  styleUrls: ['./materials.page.scss'],
  imports: [
    IonButton,
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class MaterialsPage implements OnInit {
  private readonly router = inject(Router);

  openHome() {
    this.router.navigateByUrl('/home');
  }

  readonly materialsService = inject(MaterialsService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly items = signal<Material[]>([]);
  readonly loading = signal(true);
  search = '';

  constructor() {
    addIcons({ addOutline, nutritionOutline, createOutline, trashOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.materialsService.list(this.search));
    } catch (e: any) {
      console.error('load materials failed', e);
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

  async openAdd() {
    const alert = await this.alertCtrl.create({
      header: 'Thêm nguyên liệu',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Tên nguyên liệu (VD: Trà xanh)' },
        { name: 'unit', type: 'text', placeholder: 'Đơn vị (Kg / L / Hộp)' },
        { name: 'stock', type: 'number', placeholder: 'Số lượng tồn', value: '0' },
        { name: 'cost', type: 'number', placeholder: 'Giá vốn / đơn vị (₫)', value: '0' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Thêm',
          handler: async (data) => {
            if (!data?.name?.trim()) {
              this.toast('Vui lòng nhập tên nguyên liệu', 'danger');
              return false;
            }
            try {
              await this.materialsService.create({
                name: data.name.trim(),
                unit: data.unit?.trim() || null,
                stock: Number(data.stock ?? 0),
                cost: Number(data.cost ?? 0),
              });
              this.toast('Đã thêm nguyên liệu');
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

  async openEdit(material: Material) {
    const alert = await this.alertCtrl.create({
      header: 'Sửa nguyên liệu',
      inputs: [
        { name: 'name', type: 'text', value: material.name },
        { name: 'unit', type: 'text', value: material.unit ?? '', placeholder: 'Đơn vị' },
        { name: 'stock', type: 'number', value: String(material.stock ?? 0), placeholder: 'Tồn' },
        { name: 'cost', type: 'number', value: String(material.cost ?? 0), placeholder: 'Giá vốn (₫)' },
      ],
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        {
          text: 'Xóa',
          role: 'destructive',
          handler: () => {
            this.doDelete(material);
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
              await this.materialsService.update(material.id, {
                name: data.name.trim(),
                unit: data.unit?.trim() || null,
                stock: Number(data.stock ?? 0),
                cost: Number(data.cost ?? 0),
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

  private async doDelete(material: Material) {
    try {
      await this.materialsService.remove(material.id);
      this.toast('Đã xóa nguyên liệu');
      await this.load();
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}
