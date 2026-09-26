import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton,
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
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  helpCircleOutline,
  cartOutline,
  pricetagsOutline,
  swapHorizontalOutline,
  peopleOutline,
  documentTextOutline,
  walletOutline,
  barChartOutline,
  clipboardOutline,
  calendarOutline,
  timeOutline,
  arrowRedoOutline,
  restaurantOutline,
  cloudUploadOutline,
  linkOutline,
  mailOutline,
  cardOutline,
} from 'ionicons/icons';

interface HelpItem {
  icon: string;
  title: string;
  desc: string;
  path: string;
}

@Component({
  selector: 'app-help',
  templateUrl: './help.page.html',
  styleUrls: ['./help.page.scss'],
  imports: [ IonButton,CommonModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, IonContent, IonList, IonItem, IonLabel],
})
export class HelpPage {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private router = inject(Router);

  readonly items: HelpItem[] = [
    {
      icon: 'cart-outline',
      title: 'Bán hàng & Tạo đơn',
      desc: 'Home → Đơn hàng mới → chọn khách → thêm sản phẩm → chỉnh số lượng/giá → tạo đơn. Tick "Ghi nhận thu tiền" để tự vào sổ thu.',
      path: '/order',
    },
    {
      icon: 'pricetags-outline',
      title: 'Quản lý sản phẩm',
      desc: 'Thêm sản phẩm với giá bán, giá vốn, tồn kho. Dùng tìm kiếm nhanh theo tên hoặc mã SP.',
      path: '/product',
    },
    {
      icon: 'swap-horizontal-outline',
      title: 'Thu chi',
      desc: 'Giao dịch mới → chọn Thu/Chi → nhập số tiền + nhóm + ghi chú. Xem lại trong danh sách giao dịch.',
      path: '/trade',
    },
    {
      icon: 'wallet-outline',
      title: 'Sổ tiền',
      desc: 'Quản lý các nguồn tiền (tiền mặt, ngân hàng, ví điện tử) và theo dõi tổng số dư.',
      path: '/money-account',
    },
    {
      icon: 'people-outline',
      title: 'Khách hàng & Công nợ',
      desc: 'Lưu thông tin khách, theo dõi nợ. Trang Công nợ cho phép thu nợ 1 chạm — tự trừ nợ và ghi giao dịch thu.',
      path: '/contact',
    },
    {
      icon: 'bar-chart-outline',
      title: 'Báo cáo',
      desc: 'Doanh thu theo ngày/tuần/tháng/năm, tổng thu - chi, top 5 sản phẩm bán chạy và biểu đồ theo ngày.',
      path: '/report',
    },
    {
      icon: 'clipboard-outline',
      title: 'Kiểm kho',
      desc: 'Đối chiếu tồn kho thực tế: nhấn bút chì cạnh sản phẩm để nhập số lượng đếm được.',
      path: '/stock-check',
    },
    {
      icon: 'calendar-outline',
      title: 'Lịch & Ghi chú',
      desc: 'Lên kế hoạch theo ngày với Lịch; lưu ý quick với Ghi chú (ghim bài quan trọng).',
      path: '/calendar',
    },
    {
      icon: 'time-outline',
      title: 'Ca làm việc',
      desc: 'Mở ca khi bắt đầu, kết thúc ca khi đóng cửa — lưu lịch sử từng ca.',
      path: '/shift',
    },
    {
      icon: 'arrow-redo-outline',
      title: 'Chuyển hàng',
      desc: 'Tạo phiếu chuyển đến kho phụ/chi nhánh — tự giảm tồn kho cửa hàng.',
      path: '/transfer',
    },
    {
      icon: 'restaurant-outline',
      title: 'Quản bàn (F&B)',
      desc: 'Sơ đồ bàn cho quán cafe/nhà hàng: trống, có khách, đặt trước.',
      path: '/cafe-tables',
    },
    {
      icon: 'cloud-upload-outline',
      title: 'Nhập dữ liệu',
      desc: 'Dán hoặc tải CSV để nhập hàng loạt sản phẩm / khách hàng vào hệ thống.',
      path: '/import',
    },
    {
      icon: 'link-outline',
      title: 'Tích hợp',
      desc: 'Kết nối SePay, Zalo OA, SMS, Facebook Page, External API, AI bằng khóa API của bạn.',
      path: '/integrations',
    },
    {
      icon: 'mail-outline',
      title: 'Hỗ trợ',
      desc: 'Gửi yêu cầu hỗ trợ trực tiếp và đánh giá trải nghiệm PioPio.',
      path: '/support',
    },
    {
      icon: 'document-text-outline',
      title: 'Cấu hình cửa hàng',
      desc: 'Đổi tên cửa hàng, tên hiển thị của bạn, đăng xuất tài khoản.',
      path: '/config',
    },
  ];

  constructor() {
    addIcons({
      helpCircleOutline,
      cartOutline,
      pricetagsOutline,
      swapHorizontalOutline,
      peopleOutline,
      documentTextOutline,
      walletOutline,
      barChartOutline,
      clipboardOutline,
      calendarOutline,
      timeOutline,
      arrowRedoOutline,
      restaurantOutline,
      cloudUploadOutline,
      linkOutline,
      mailOutline,
      cardOutline,
    });
  }

  open(path: string) {
    this.router.navigateByUrl(path);
  }
}
