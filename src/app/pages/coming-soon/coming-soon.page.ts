import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonIcon,
  IonButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { constructOutline, homeOutline } from 'ionicons/icons';

const MODULE_LABELS: Record<string, string> = {
  'order': 'Đơn hàng',
  'order-add': 'Đơn hàng mới',
  'product': 'Sản phẩm',
  'contact': 'Khách hàng',
  'trade': 'Giao dịch',
  'trade-add': 'Giao dịch mới',
  'money-account': 'Sổ tiền',
  'debt': 'Công nợ',
  'report': 'Báo cáo doanh thu',
  'report-income': 'Báo cáo thu',
  'report-expense': 'Báo cáo chi',
  'category-report': 'Báo cáo theo nhóm',
  'timely-report': 'Báo cáo theo thời gian',
  'trade-category': 'Danh mục giao dịch',
  'stock-check': 'Kiểm kho',
  'staff': 'Nhân viên',
  'store': 'Cửa hàng',
  'config': 'Cấu hình',
  'help': 'Trợ giúp',
  'notifications': 'Thông báo',
  'crm-leads': 'CRM — Leads',
  'crm-pipeline': 'CRM — Pipeline',
  'crm-deals': 'CRM — Deals',
  'crm-forecast': 'CRM — Dự báo',
  'crm-activities': 'CRM — Hoạt động',
  'crm-settings': 'CRM — Cài đặt',
  'sms-marketing': 'SMS Marketing',
  'zbs-marketing': 'Zalo Marketing',
  'received-note': 'Nhập hàng',
  'transfer-note': 'Chuyển hàng',
  'delivery-note': 'Giao hàng',
  'material': 'Nguyên liệu',
  'quote': 'Báo giá',
  'promotion': 'Khuyến mãi',
  'scan': 'Quét mã',
  'serial': 'Serial/IMEI',
  'import': 'Nhập Excel',
  'point': 'Tích điểm',
  'level-config': 'Hạng thành viên',
  'shift': 'Ca làm việc',
  'org-chart': 'Sơ đồ tổ chức',
  'contact-import': 'Nhập khách hàng',
  'filter-duplicate': 'Khách hàng trùng lặp',
  'permission': 'Phân quyền',
  'external-api': 'External API',
  'sales-channels': 'Kênh bán',
  'shipping': 'Vận chuyển',
};

@Component({
  selector: 'app-coming-soon',
  templateUrl: './coming-soon.page.html',
  styleUrls: ['./coming-soon.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonIcon, IonButton],
})
export class ComingSoonPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly moduleId = signal('');

  constructor() {
    addIcons({ constructOutline, homeOutline });
    this.moduleId.set(this.route.snapshot.paramMap.get('id') ?? '');
  }

  get label(): string {
    const id = this.moduleId();
    return MODULE_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
  }

  goHome() {
    this.router.navigateByUrl('/home');
  }
}
