import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Biểu đồ cột SVG thuần cho trang Báo cáo (thay ECharts ~380kB: dữ liệu đã
 * được aggregate server-side nên ≤ ~400 bucket — SVG đủ và giữ bundle nhẹ.
 * Nếu sau này cần vẽ lớn/animation nâng cao thì swap component này).
 *
 * - Tap/click cột -> emit bucket (YYYY-MM-DD) để drill-down.
 * - Cột đang chọn được highlight; label trục X tự rút gọn khi dày.
 */
export interface ReportChartDatum {
  bucket: string;
  label: string;
  value: number;
}

@Component({
  selector: 'app-report-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rc-wrap">
      @if (bars().length === 0) {
        <div class="rc-empty">Không có dữ liệu trong kỳ</div>
      } @else {
        <svg
          class="rc-svg"
          [attr.viewBox]="'0 0 ' + width() + ' ' + HEIGHT"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Biểu đồ cột"
        >
          <!-- gridlines + nhãn trục Y -->
          @for (g of grid(); track g.y) {
            <line class="rc-grid" [attr.x1]="PAD_L" [attr.y1]="g.y" [attr.x2]="width() - PAD_R" [attr.y2]="g.y" />
            <text class="rc-ylab" [attr.x]="width() - PAD_R" [attr.y]="g.y - 3">{{ g.label }}</text>
          }

          <!-- baseline -->
          <line class="rc-base" [attr.x1]="PAD_L" [attr.y1]="baseY()" [attr.x2]="width() - PAD_R" [attr.y2]="baseY()" />

          @for (b of bars(); track b.bucket) {
            <g class="rc-bar-g" [class.sel]="b.bucket === selected()" (click)="pick(b.bucket)">
              <rect class="rc-hit" [attr.x]="b.x" [attr.y]="TOP_PAD" [attr.width]="b.bw" [attr.height]="baseY() - TOP_PAD" />
              <rect
                class="rc-bar"
                [attr.x]="b.x"
                [attr.y]="b.y"
                [attr.width]="b.bw"
                [attr.height]="b.h"
                rx="3"
              >
                <title>{{ b.label }}: {{ full(b.raw) }}</title>
              </rect>
              @if (b.showValue) {
                <text class="rc-vlab" [attr.x]="b.x + b.bw / 2" [attr.y]="b.y - 4">{{ compact(b.raw) }}</text>
              }
              @if (b.showX) {
                <text class="rc-xlab" [attr.x]="b.x + b.bw / 2" [attr.y]="baseY() + 14">{{ b.shortLabel }}</text>
              }
            </g>
          }
        </svg>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; width: 100%; }
      .rc-wrap { width: 100%; }
      .rc-svg { width: 100%; height: 220px; display: block; }
      .rc-empty { height: 200px; display: flex; align-items: center; justify-content: center; color: var(--ion-color-medium); font-size: 13px; }
      .rc-grid { stroke: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.08); stroke-width: 1; }
      .rc-base { stroke: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.25); stroke-width: 1; }
      .rc-bar { fill: var(--ion-color-primary, #3880ff); opacity: 0.82; transition: opacity 0.15s; }
      .rc-bar-g:hover .rc-bar, .rc-bar-g.sel .rc-bar { opacity: 1; }
      .rc-bar-g.sel .rc-bar { fill: var(--ion-color-secondary, #5260ff); }
      .rc-hit { fill: transparent; cursor: pointer; }
      .rc-ylab { font-size: 9px; fill: var(--ion-color-medium, #8d8d8d); text-anchor: end; }
      .rc-xlab { font-size: 9px; fill: var(--ion-color-medium, #8d8d8d); text-anchor: middle; }
      .rc-vlab { font-size: 9px; fill: var(--ion-text-color, #000); text-anchor: middle; font-weight: 600; pointer-events: none; }
    `,
  ],
})
export class ReportChartComponent {
  protected readonly HEIGHT = 220;
  protected readonly TOP_PAD = 22;
  protected readonly PAD_L = 6;
  protected readonly PAD_R = 52;
  protected readonly PAD_B = 20;

  readonly points = input.required<ReportChartDatum[]>();
  readonly selected = input<string | null>(null);
  readonly bucketPick = output<string>();

  readonly width = computed(() => Math.max(this.points().length * 46 + this.PAD_L + this.PAD_R, 300));

  private readonly maxValue = computed(() => Math.max(...this.points().map((p) => p.value), 0));

  readonly baseY = computed(() => this.HEIGHT - this.PAD_B);

  readonly grid = computed(() => {
    const max = this.maxValue();
    const baseY = this.baseY();
    const lines: Array<{ y: number; label: string }> = [];
    for (let i = 1; i <= 3; i++) {
      const v = (max * i) / 3;
      lines.push({ y: baseY - (baseY - this.TOP_PAD) * (i / 3), label: this.compact(v) });
    }
    return lines;
  });

  readonly bars = computed(() => {
    const pts = this.points();
    const max = this.maxValue();
    const baseY = this.baseY();
    const inner = this.width() - this.PAD_L - this.PAD_R;
    const n = pts.length;
    const slot = inner / Math.max(n, 1);
    const bw = Math.min(Math.max(slot * 0.62, 3), 34);
    const labelEvery = Math.max(1, Math.ceil(n / 9));
    const sel = this.selected();
    const maxIdx = pts.reduce((best, p, i) => (p.value > (pts[best]?.value ?? -1) ? i : best), 0);
    return pts.map((p, i) => {
      const h = max > 0 ? Math.max((p.value / max) * (baseY - this.TOP_PAD), p.value > 0 ? 2 : 0) : 0;
      const x = this.PAD_L + slot * i + (slot - bw) / 2;
      return {
        bucket: p.bucket,
        raw: p.value,
        label: p.label,
        shortLabel: p.label,
        x,
        bw,
        h,
        y: baseY - h,
        showX: i % labelEvery === 0 || i === n - 1,
        showValue: (sel != null && p.bucket === sel) || i === maxIdx,
      };
    });
  });

  pick(bucket: string): void {
    this.bucketPick.emit(bucket);
  }

  /** 1.234.567 -> '1,2tr'; 1.234.567.890 -> '1,23 tỷ'; 45.000 -> '45k' */
  compact(v: number): string {
    const abs = Math.abs(v ?? 0);
    const one = (x: number) => x.toFixed(x >= 100 ? 0 : 1).replace('.', ',').replace(/,0$/, '');
    if (abs >= 1e9) return `${one(abs / 1e9)} tỷ`;
    if (abs >= 1e6) return `${one(abs / 1e6)}tr`;
    if (abs >= 1e3) return `${one(abs / 1e3)}k`;
    return String(Math.round(abs));
  }

  full(v: number): string {
    return new Intl.NumberFormat('vi-VN').format(Math.round(v ?? 0)) + ' ₫';
  }
}
