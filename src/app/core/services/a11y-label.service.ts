import { Injectable } from '@angular/core';

/**
 * Bản đồ icon → nhãn tiếng Việt phục vụ WCAG 2.2 AA (4.1.2 Name/Role/Value).
 * Nút chỉ có icon mà thiếu aria-label sẽ được gán nhãn tự động.
 */
const ICON_LABELS: Record<string, string> = {
  'settings-outline': 'Cài đặt', settings: 'Cài đặt', 'settings-sharp': 'Cài đặt',
  'notifications-outline': 'Thông báo', notifications: 'Thông báo', 'notifications-off-outline': 'Tắt thông báo',
  'text-outline': 'Ghi chú',
  'arrow-back-outline': 'Quay lại', 'arrow-back': 'Quay lại', 'chevron-back-outline': 'Quay lại',
  home: 'Trang chủ', 'home-outline': 'Trang chủ', 'home-sharp': 'Trang chủ',
  'checkmark-outline': 'Xác nhận', checkmark: 'Xác nhận', 'checkmark-circle-outline': 'Hoàn tất', 'checkmark-sharp': 'Xác nhận',
  'barcode-outline': 'Quét mã vạch', 'barcode-sharp': 'Quét mã vạch', barcode: 'Quét mã vạch',
  add: 'Thêm mới', 'add-outline': 'Thêm mới', 'add-circle-outline': 'Thêm mới', 'add-sharp': 'Thêm mới', 'add-circle': 'Thêm mới',
  'create-outline': 'Sửa', create: 'Sửa',
  'ellipsis-vertical': 'Tùy chọn khác', 'ellipsis-vertical-outline': 'Tùy chọn khác', 'ellipsis-horizontal': 'Thêm',
  'close-outline': 'Đóng', close: 'Đóng', 'close-circle-outline': 'Đóng', 'close-sharp': 'Đóng',
  'search-outline': 'Tìm kiếm', search: 'Tìm kiếm', 'search-sharp': 'Tìm kiếm',
  'person-add': 'Thêm khách hàng', 'person-add-outline': 'Thêm khách hàng',
  apps: 'Danh mục', 'apps-outline': 'Danh mục',
  'stats-chart-outline': 'Thống kê',
  'options-outline': 'Tùy chọn',
  'save-outline': 'Lưu', save: 'Lưu',
  'print-outline': 'In', print: 'In',
  'copy-outline': 'Nhân bản', copy: 'Nhân bản',
  'trash-outline': 'Xóa', trash: 'Xóa', 'trash-sharp': 'Xóa', 'trash-bin-outline': 'Xóa',
  'sparkles-outline': 'Trợ lý AI', sparkles: 'Trợ lý AI',
  'image-outline': 'Ảnh', 'images-outline': 'Thư viện ảnh', image: 'Ảnh', images: 'Thư viện ảnh',
  'cloud-upload-outline': 'Tải lên',
  'cloud-download-outline': 'Tải xuống',
  'download-outline': 'Tải xuống',
  'filter-outline': 'Lọc', filter: 'Lọc', 'funnel-outline': 'Lọc', funnel: 'Lọc',
  'menu-outline': 'Menu', menu: 'Menu',
  'swap-horizontal-outline': 'Đổi chiều', 'swap-horizontal': 'Đổi chiều',
  'calculator-outline': 'Máy tính',
  'layers-outline': 'Đơn vị', layers: 'Đơn vị',
  'cart-outline': 'Đơn hàng', cart: 'Đơn hàng',
  'qr-code-outline': 'Mã QR',
  'camera-outline': 'Máy ảnh', 'camera-sharp': 'Máy ảnh', camera: 'Máy ảnh',
  'refresh-outline': 'Làm mới', refresh: 'Làm mới', 'refresh-circle-outline': 'Làm mới',
  'information-circle-outline': 'Thông tin',
  'warning-outline': 'Cảnh báo',
  'checkbox-outline': 'Chọn',
  'chevron-forward-outline': 'Mở', 'chevron-down-outline': 'Thu gọn', 'chevron-up-outline': 'Thu gọn',
  'pencil-outline': 'Sửa', pencil: 'Sửa', 'pencil-sharp': 'Sửa',
  'share-outline': 'Chia sẻ', 'share-social-outline': 'Chia sẻ',
  'call-outline': 'Gọi điện', call: 'Gọi điện',
  'location-outline': 'Vị trí',
  'mail-outline': 'Email',
  'heart-outline': 'Yêu thích',
  'star-outline': 'Đánh giá', star: 'Đánh giá',
  'gift-outline': 'Quà tặng', gift: 'Quà tặng',
  'flash-outline': 'Nhanh', flash: 'Nhanh',
  'list-outline': 'Danh sách', 'grid-outline': 'Lưới',
  'eye-outline': 'Xem', 'eye-off-outline': 'Ẩn',
  'send-outline': 'Gửi',
  'scan-outline': 'Quét',
  'calendar-outline': 'Lịch',
  'time-outline': 'Thời gian',
  'help-circle-outline': 'Trợ giúp',
  'log-out-outline': 'Đăng xuất',
  'cube-outline': 'Tồn kho',
  'people-outline': 'Khách hàng',
  'pricetags-outline': 'Sản phẩm',
  'wallet-outline': 'Sổ tiền',
  'document-text-outline': 'Tài liệu',
  'bar-chart-outline': 'Báo cáo',
  'clipboard-outline': 'Phiếu',
  'analytics-outline': 'Phân tích',
  'lock-closed-outline': 'Khóa',
  'key-outline': 'Khóa API',
  'link-outline': 'Liên kết',
  'rocket-outline': 'Nâng cấp',
  'car-outline': 'Vận chuyển',
  'storefront-outline': 'Cửa hàng',
  'person-outline': 'Cá nhân',
  'calendar-clear-outline': 'Lịch',
  'receipt-outline': 'Hóa đơn',
  'card-outline': 'Thẻ',
  'cash-outline': 'Tiền mặt',
  'trending-up-outline': 'Tăng trưởng',
  'trending-down-outline': 'Giảm',
  'arrow-forward-outline': 'Tiếp',
  'arrow-redo-outline': 'Chuyển tiếp',
  'return-down-back-outline': 'Trả về',
  'git-branch-outline': 'Nhánh',
  'shield-checkmark-outline': 'Duyệt',
  'medal-outline': 'Xếp hạng',
  'speedometer-outline': 'Chỉ tiêu',
  'restaurant-outline': 'Bàn',
  'book-outline': 'Sổ',
  'pulse-outline': 'Hoạt động',
  'briefcase-outline': 'Cơ hội',
  'git-merge-outline': 'Gộp',
};

/**
 * Lưới an toàn accessibility: quét DOM, mọi nút/liên kết icon-only thiếu
 * accessible name được gán aria-label theo icon. Chạy 1 lần khi khởi động +
 * MutationObserver (debounce) cho nội dung động. Gán cả vào nút bên trong
 * shadow DOM của Ionic để screen reader chắc chắn đọc được.
 */
@Injectable({ providedIn: 'root' })
export class A11yLabelService {
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.observer || typeof document === 'undefined') return;
    this.scan();
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scan();
    }, 250);
  }

  private scan(): void {
    try {
      const candidates = document.querySelectorAll<HTMLElement>(
        'ion-button, ion-fab-button, button, a, [role="button"]'
      );
      for (const el of Array.from(candidates)) {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) continue;
        if ((el.textContent || '').trim()) continue;
        const box = el.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        const icon = el.querySelector('ion-icon')?.getAttribute('name') ?? '';
        const label = ICON_LABELS[icon] ?? this.humanize(icon);
        if (!label) continue;
        this.apply(el, label);
      }
      // WCAG 3.3.2: ô nhập chỉ có placeholder → dùng placeholder làm accessible name
      const inputs = document.querySelectorAll<HTMLElement>(
        'ion-input, ion-textarea, ion-select, input:not([type="hidden"]), textarea, select'
      );
      for (const inp of Array.from(inputs)) {
        const box = inp.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        const ph = inp.getAttribute('placeholder') ?? '';
        if (!ph) continue;
        this.apply(inp, ph);
      }
    } catch {
      // a11y an toàn lưới — không bao giờ làm vỡ app
    }
  }

  /** Gán aria-label lên host lẫn phần tử thật trong shadow DOM (nếu có) */
  private apply(el: HTMLElement, label: string): void {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
    el.setAttribute('aria-label', label);
    const shadow = (el as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot;
    const inner = shadow?.querySelector('button, input, textarea');
    if (inner && !inner.getAttribute('aria-label')) inner.setAttribute('aria-label', label);
  }

  private humanize(name: string): string {
    if (!name) return '';
    const base = name.replace(/-outline|-sharp|-circle$/g, '');
    if (!base) return '';
    return base.charAt(0).toUpperCase() + base.slice(1).replace(/-/g, ' ');
  }
}
