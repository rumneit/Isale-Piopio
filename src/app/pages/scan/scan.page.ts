import { Component, OnDestroy, inject, signal, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonContent,
  IonButton,
  IonInput,
  IonBadge,
  IonNote,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  scanOutline,
  barcodeOutline,
  pricetagsOutline,
  cartOutline,
  videocamOutline,
  videocamOffOutline,
  refreshOutline,
  closeCircleOutline,
} from 'ionicons/icons';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/models';

@Component({
  selector: 'app-scan',
  templateUrl: './scan.page.html',
  styleUrls: ['./scan.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonContent,
    IonButton,
    IonInput,
    IonBadge,
    IonNote,
    FormsModule,
  ],
})
export class ScanPage implements OnDestroy {
  openHome() {
    this.router.navigateByUrl('/home');
  }

  private productsService = inject(ProductsService);
  private router = inject(Router);

  readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly detectorSupported = signal(typeof (window as any).BarcodeDetector !== 'undefined');
  readonly cameraActive = signal(false);
  readonly scanning = signal(false);
  readonly found = signal<Product | null>(null);
  readonly notFoundMsg = signal('');
  manualCode = '';

  private stream: MediaStream | null = null;
  private scanTimer: any = null;

  constructor() {
    addIcons({
      scanOutline,
      barcodeOutline,
      pricetagsOutline,
      cartOutline,
      videocamOutline,
      videocamOffOutline,
      refreshOutline,
      closeCircleOutline,
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  async toggleCamera() {
    if (this.cameraActive()) {
      this.stopCamera();
      return;
    }
    if (!this.detectorSupported()) {
      this.notFoundMsg.set('Thiết bị không hỗ trợ quét camera — hãy nhập mã tay bên dưới.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      const video = this.videoEl()?.nativeElement;
      if (video) {
        video.srcObject = this.stream;
        await video.play();
      }
      this.cameraActive.set(true);
      this.notFoundMsg.set('');
      this.startDetectLoop();
    } catch (e: any) {
      this.notFoundMsg.set('Không truy cập được camera. Kiểm tra quyền truy cập.');
    }
  }

  private async startDetectLoop() {
    const detector = new (window as any).BarcodeDetector();
    const video = this.videoEl()?.nativeElement;
    if (!video) return;

    this.scanTimer = setInterval(async () => {
      if (this.scanning() || !video.videoWidth) return;
      try {
        this.scanning.set(true);
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          const code = codes[0].rawValue;
          this.stopCamera();
          await this.lookup(code);
        }
      } catch {
        /* frame not ready — ignore */
      } finally {
        this.scanning.set(false);
      }
    }, 350);
  }

  stopCamera() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.cameraActive.set(false);
  }

  async lookup(code?: string) {
    const value = (code ?? this.manualCode).trim();
    if (!value) return;
    this.found.set(null);
    try {
      let product = await this.productsService.getBySku(value);
      if (!product) {
        // thử tìm theo tên nếu không có SKU khớp
        const list = await this.productsService.list(value);
        product = list[0] ?? null;
      }
      if (product) {
        this.found.set(product);
        this.notFoundMsg.set('');
      } else {
        this.notFoundMsg.set(`Không tìm thấy sản phẩm với mã "${value}"`);
      }
    } catch (e: any) {
      this.notFoundMsg.set(e?.message ?? 'Tra cứu thất bại');
    } finally {
      this.manualCode = '';
    }
  }

  createOrderWithProduct() {
    this.router.navigateByUrl('/order/add');
  }

  formatMoney(v: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(v ?? 0) + ' ₫';
  }
}
