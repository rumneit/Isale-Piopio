import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  IonNote,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personOutline, peopleOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { Profile } from '../../core/models/models';

@Component({
  selector: 'app-staff',
  templateUrl: './staff.page.html',
  styleUrls: ['./staff.page.scss'],
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
    IonNote,
  ],
})
export class StaffPage implements OnInit {
  private sb = inject(SupabaseService);
  readonly auth = inject(AuthService);

  readonly items = signal<Profile[]>([]);
  readonly loading = signal(true);

  constructor() {
    addIcons({ personOutline, peopleOutline, shieldCheckmarkOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  async load() {
    const shopId = this.auth.shop()?.id;
    if (!this.sb.isConfigured || !shopId) {
      this.items.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const { data, error } = await this.sb
        .from('profiles')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      this.items.set((data ?? []) as Profile[]);
    } catch (e: any) {
      console.error('load staff failed', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  roleLabel(role: string | null): string {
    switch (role) {
      case 'owner':
        return 'Chủ cửa hàng';
      case 'manager':
        return 'Quản lý';
      default:
        return 'Nhân viên';
    }
  }

  initial(name: string | null): string {
    return (name || '?').trim().charAt(0).toUpperCase();
  }
}
