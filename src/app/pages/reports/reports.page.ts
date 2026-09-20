import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonMenuButton,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline,
  receiptOutline,
  documentOutline,
  personOutline,
  barChartOutline,
  readerOutline,
  newspaperOutline,
  downloadOutline,
} from 'ionicons/icons';

interface ReportItem {
  id: string;
  label: string;
  icon: string;
  color: string;
  path: string;
  section?: string;
}

@Component({
  selector: 'app-reports',
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonMenuButton,
  ],
})
export class ReportsPage {
  private router = inject(Router);

  readonly mainReports: ReportItem[] = [
    { id: 'orders', label: 'Tổng hợp theo đơn hàng', icon: 'receipt-outline', color: '#6030ff', path: '/report/orders' },
    { id: 'products', label: 'Tổng hợp theo sản phẩm', icon: 'document-outline', color: '#47bdb5', path: '/report/product' },
    { id: 'customers', label: 'Tổng hợp theo khách hàng', icon: 'person-outline', color: '#e6bf00', path: '/report/customer' },
    { id: 'staff', label: 'Tổng hợp theo nhân viên', icon: 'person-outline', color: '#2dd55b', path: '/staff' },
    { id: 'chart', label: 'Biểu đồ doanh thu', icon: 'bar-chart-outline', color: '#ff7043', path: '/report/chart' },
    { id: 'debt', label: 'Báo cáo vay/nợ', icon: 'bar-chart-outline', color: '#5c6bc0', path: '/report/debt' },
  ];

  readonly exportReports: ReportItem[] = [
    { id: 'excel-products', label: 'Xuất SP ra Excel', icon: 'reader-outline', color: '#ec407a', path: '/product' },
    { id: 'stock', label: 'Báo cáo tồn kho tổng hợp', icon: 'document-outline', color: '#26c6da', path: '/report/stock' },
    { id: 'inout', label: 'Báo cáo xuất nhập', icon: 'newspaper-outline', color: '#8d6e63', path: '/report/inout' },
  ];

  constructor() {
    addIcons({
      homeOutline,
      receiptOutline,
      documentOutline,
      personOutline,
      barChartOutline,
      readerOutline,
      newspaperOutline,
      downloadOutline,
    });
  }

  openHome() {
    this.router.navigateByUrl('/home');
  }

  open(item: ReportItem) {
    this.router.navigateByUrl(item.path);
  }
}
