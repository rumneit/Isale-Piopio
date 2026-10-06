import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSpinner,
  IonList,
  IonItem,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  AlertController,
  ToastController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import { saveOutline, trashOutline, closeOutline, homeOutline } from 'ionicons/icons';
import { CustomersService } from '../../core/services/customers.service';
import { Customer, CustomerGroup } from '../../core/models/models';

@Component({
  selector: 'app-customer-edit',
  templateUrl: './customer-edit.page.html',
  styleUrls: ['./customer-edit.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSpinner,
    IonList,
    IonItem,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    FormsModule,
  ],
})
export class CustomerEditPage implements OnInit {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private customersService = inject(CustomersService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly customerId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly deleting = signal(false);
  readonly groups = signal<CustomerGroup[]>([]);
  error = '';

  name = '';
  code = '';
  phone = '';
  email = '';
  address = '';
  /** ISale: Không phân biệt (null) | Nam | Nữ — lưu đúng giá trị import */
  gender: string | null = null;
  debt: number | null = 0;
  dob = '';
  avatarUrl = '';
  groupId: string | null = null;
  status: Customer['status'] = 'active';
  tags = '';
  important = false;

  constructor() {
    addIcons({ saveOutline, trashOutline, closeOutline, homeOutline });
  }

  get isEdit(): boolean {
    return !!this.customerId();
  }

  async ngOnInit(): Promise<void> {
    this.customersService.groups().then((groups) => this.groups.set(groups)).catch(() => undefined);

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'add') {
      this.customerId.set(id);
      this.busy.set(true);
      try {
        const c = await this.customersService.get(id);
        if (c) {
          this.name = c.name;
          this.code = c.code ?? '';
          this.phone = c.phone ?? '';
          this.email = c.email ?? '';
          this.address = c.address ?? '';
          this.gender = c.gender ?? null;
          this.debt = c.debt;
          this.dob = c.dob ?? '';
          this.avatarUrl = c.avatar_url ?? '';
          this.groupId = c.customer_group_id ?? null;
          this.status = c.status ?? 'active';
          this.tags = (c.tags ?? []).join(', ');
          this.important = !!c.important;
        }
      } catch (e: any) {
        this.error = e?.message ?? 'Không tải được khách hàng.';
      } finally {
        this.busy.set(false);
      }
    }
  }

  async save() {
    this.error = '';
    if (!this.name.trim()) {
      this.error = 'Vui lòng nhập tên khách hàng.';
      return;
    }

    const payload: Partial<Customer> = {
      name: this.name.trim(),
      code: this.code.trim() || null,
      phone: this.phone.trim() || null,
      email: this.email.trim() || null,
      address: this.address.trim() || null,
      gender: this.gender,
      debt: Number(this.debt ?? 0),
      dob: this.dob || null,
      avatar_url: this.avatarUrl.trim() || null,
      customer_group_id: this.groupId || null,
      status: this.status,
      tags: this.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      important: this.important,
    };

    this.busy.set(true);
    try {
      if (this.isEdit) {
        await this.customersService.update(this.customerId()!, payload);
      } else {
        await this.customersService.create(payload);
      }
      this.toast('Đã lưu khách hàng');
      this.router.navigateByUrl('/contact', { replaceUrl: true });
    } catch (e: any) {
      this.error = e?.message ?? 'Lưu thất bại.';
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete() {
    if (!this.isEdit) return;
    const alert = await this.alertCtrl.create({
      header: 'Xóa khách hàng',
      message: `Xóa "${this.name}"?`,
      buttons: [
        { text: 'Hủy', role: 'cancel' },
        { text: 'Xóa', role: 'destructive', handler: () => this.doDelete() },
      ],
    });
    await alert.present();
  }

  private async doDelete() {
    this.deleting.set(true);
    try {
      await this.customersService.remove(this.customerId()!);
      this.toast('Đã xóa khách hàng');
      this.router.navigateByUrl('/contact', { replaceUrl: true });
    } catch (e: any) {
      this.toast(e?.message ?? 'Xóa thất bại', 'danger');
    } finally {
      this.deleting.set(false);
    }
  }

  private async toast(message: string, color: string = 'success') {
    const t = await this.toastCtrl.create({ message, duration: 1800, color, position: 'bottom' });
    await t.present();
  }

  goBack() {
    this.router.navigateByUrl('/contact', { replaceUrl: true });
  }
}
