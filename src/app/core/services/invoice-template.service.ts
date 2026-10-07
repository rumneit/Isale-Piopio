import { Injectable } from '@angular/core';
import Handlebars from 'handlebars';
import { Order, OrderItem, Shop } from '../models/models';

export type InvoiceTemplateKind = 'invoice' | 'receipt';

export const DEFAULT_INVOICE_TEMPLATE = `{{!-- Mẫu hóa đơn khổ lớn --}}
{{#if shop.name}}
<header class="shop-head">
  {{#if shop.iconUrl}}<img class="shop-logo" src="{{shop.iconUrl}}" alt="Logo {{shop.name}}">{{/if}}
  <strong class="shop-name">{{shop.nameUpper}}</strong>
  {{#if shop.shortDescription}}<em>{{shop.shortDescription}}</em>{{/if}}
  <div class="shop-grid">
    <div>
      {{#if shop.phone}}<div>{{labels.shopPhone}} {{shop.phone}}</div>{{/if}}
      {{#if shop.email}}<div>{{labels.shopEmail}} {{shop.email}}</div>{{/if}}
      {{#if shop.facebook}}<div>{{labels.shopFacebook}} {{shop.facebook}}</div>{{/if}}
      {{#if shop.address}}<div>{{labels.shopAddress}} {{shop.address}}</div>{{/if}}
    </div>
    {{#if shop.bankName}}<div class="bank-block">
      <div><b>{{labels.bankName}}</b> {{shop.bankName}}</div>
      {{#if shop.bankAccountName}}<div>{{labels.bankAccountName}}: {{shop.bankAccountName}}</div>{{/if}}
      {{#if shop.bankAccountNumber}}<div>{{labels.bankAccountNumber}}: {{shop.bankAccountNumber}}</div>{{/if}}
    </div>{{/if}}
  </div>
</header>
{{/if}}
<section class="invoice-meta">
  <h1>{{labels.orderPrintTitle}}</h1>
  <div><b>{{labels.orderCode}}</b> {{order.orderCode}}</div>
  {{#if hasStaff}}<div>{{labels.staff}} {{staffDisplay}}</div>{{/if}}
  <div>{{labels.date}} {{order.createdAt}}</div>
  <div>{{labels.customer}} <span class="dot-line">{{customerName}}</span></div>
  <div>{{labels.phone}} <span class="dot-line">{{customerPhone}}</span></div>
  <div>{{labels.address}} <span class="dot-line">{{customerAddress}}</span></div>
</section>
<table class="invoice-table">
  <thead><tr><th>{{labels.headIndex}}</th><th>{{labels.headName}}</th><th>{{labels.headUnit}}</th><th>{{labels.headQty}}</th><th>{{labels.headPrice}}</th>{{#unless hideDiscountColumn}}<th>{{labels.headDiscount}}</th>{{/unless}}<th>{{labels.headAmount}}</th></tr></thead>
  <tbody>
    {{#each items}}<tr><td class="center">{{index}}</td><td>{{productName}}</td><td class="center">{{unit}}</td><td class="number">{{count}}</td><td class="number">{{priceFormatted}}</td>{{#unless ../hideDiscountColumn}}<td class="number">{{discountText}}</td>{{/unless}}<td class="number">{{totalFormatted}}</td></tr>{{/each}}
    {{#each emptyRows}}<tr><td class="center">{{inc this}}</td><td>&nbsp;</td><td></td><td></td><td></td>{{#unless ../hideDiscountColumn}}<td></td>{{/unless}}<td></td></tr>{{/each}}
    <tr><td colspan="3"><b>{{labels.totalAmount}}</b></td><td class="number">{{totalProductsQuantity}}</td>{{#unless hideDiscountColumn}}<td></td>{{/unless}}<td></td><td class="number">{{totalProductsAmountFormatted}}</td></tr>
    {{#if hasPromotionDiscount}}<tr><td colspan="{{totalColspan}}">{{labels.totalPromotionDiscount}}</td><td class="number">-{{order.totalPromotionDiscountFormatted}}</td></tr>{{/if}}
    {{#if hasDiscountOnTotal}}<tr><td colspan="{{totalColspan}}">{{labels.discount}}</td><td class="number">-{{order.discountOnTotalFormatted}}</td></tr>{{/if}}
    {{#if hasNetValueDiff}}<tr><td colspan="{{totalColspan}}">{{labels.netValue}}</td><td class="number">{{order.netValueFormatted}}</td></tr>{{/if}}
    {{#if hasPointPayment}}<tr><td colspan="{{totalColspan}}">{{labels.payByPoint}}</td><td class="number">-{{order.amountFromPointFormatted}}</td></tr>{{/if}}
    {{#if showTax}}<tr><td colspan="{{totalColspan}}">{{labels.tax}}</td><td class="number">+{{order.taxFormatted}}</td></tr>{{/if}}
    {{#if hasShipping}}<tr><td colspan="{{totalColspan}}">{{labels.shippingFee}}</td><td class="number">+{{order.shippingFeeFormatted}}</td></tr>{{/if}}
    <tr><td colspan="{{totalColspan}}"><b>{{labels.total}}</b></td><td class="number"><b>{{order.totalFormatted}}</b></td></tr>
    {{#if hasOldDebt}}<tr><td colspan="{{totalColspan}}">{{labels.oldDebt}}</td><td class="number">{{order.oldDebtFormatted}}</td></tr>{{/if}}
  </tbody>
</table>
<div class="written">{{labels.totalWritten}} <span class="dot-line">{{amountToText}}</span></div>
{{#if hasOrderNote}}<div>{{labels.note}} <span class="dot-line">{{order.note}}</span></div>{{/if}}
{{#if hasOrderPrintNote}}<p><em>{{orderPrintNote}}</em></p>{{/if}}
{{#if showQr}}<div class="qr"><img src="{{qrCodeUrl}}" alt="QR"><span>{{labels.qrPayment}}</span></div>{{/if}}
<footer class="signatures"><div><b>{{labels.customerTitle}}</b><br><small>({{labels.signHint}})</small></div><div><b>{{labels.buyer}}</b><br><small>({{labels.signHint}})</small>{{#if showStaffNameUnderSign}}<strong class="staff-sign">{{staffDisplay}}</strong>{{/if}}</div></footer>`;

export const DEFAULT_RECEIPT_TEMPLATE = `{{!-- Mẫu bill khổ nhỏ --}}
{{#if shop.name}}
<header class="receipt-head">
  {{#if shop.iconUrl}}<img class="receipt-logo" src="{{shop.iconUrl}}" alt="Logo {{shop.name}}">{{/if}}
  <b>{{shop.name}}</b>
  {{#if shop.shortDescription}}<em>{{shop.shortDescription}}</em>{{/if}}
  {{#if shop.phone}}<span>{{labels.shopPhone}} {{shop.phone}}</span>{{/if}}
  {{#if shop.email}}<span>{{labels.shopEmail}} {{shop.email}}</span>{{/if}}
  {{#if shop.facebook}}<span>{{labels.shopFacebook}} {{shop.facebook}}</span>{{/if}}
  {{#if shop.address}}<span>{{labels.shopAddress}} {{shop.address}}</span>{{/if}}
</header>
{{/if}}
<h1>{{labels.orderPrintTitle}}</h1>
<div class="receipt-meta">
  <div><b>{{labels.orderCode}}</b> {{order.orderCode}}</div>
  {{#if hasStaff}}<div>{{labels.staff}} {{staffDisplay}}</div>{{/if}}
  <div>{{labels.date}} {{order.createdAt}}</div>
  <div>{{labels.customer}} {{customerName}}{{#if customerPhone}} - {{customerPhone}}{{/if}}</div>
  {{#if customerAddress}}<div>{{labels.address}} {{customerAddress}}</div>{{/if}}
  {{#if hasOrderNote}}<div>{{labels.note}} {{order.note}}</div>{{/if}}
</div>
{{#if bank.name}}
<div class="receipt-bank">
  <div><b>{{labels.bankName}}</b> {{bank.name}}</div>
  {{#if bankAccount}}<div>{{labels.bankAccountName}}: {{bankAccount}}</div>{{/if}}
  {{#if bankNumber}}<div>{{labels.bankAccountNumber}}: {{bankNumber}}</div>{{/if}}
</div>
{{/if}}
<table class="receipt-items">
  <thead><tr><th>{{labels.headPriceShort}}</th><th>{{labels.headQtyShort}}</th>{{#unless receiptCompact}}<th>{{labels.headDiscountShort}}</th>{{/unless}}<th>{{labels.headAmountShort}}</th></tr></thead>
  <tbody>
    {{#each items}}
      <tr class="item-name"><td colspan="{{../receiptColspan}}">{{index}}. {{productName}}{{#if unit}} ({{unit}}){{/if}}</td></tr>
      <tr><td>{{priceFormatted}}</td><td class="number">× {{count}}</td>{{#unless ../receiptCompact}}<td class="number">{{discountText}}</td>{{/unless}}<td class="number">{{totalFormatted}}</td></tr>
    {{/each}}
    <tr class="subtotal"><td colspan="{{receiptSubtotalColspan}}"><b>{{labels.totalAmount}}</b></td><td class="number"><b>{{totalProductsAmountFormatted}}</b></td></tr>
  </tbody>
</table>
<table class="receipt-total">
  {{#if hasPromotionDiscount}}<tr><td>{{labels.totalPromotionDiscount}}:</td><td>-{{order.totalPromotionDiscountFormatted}}</td></tr>{{/if}}
  {{#if hasDiscountOnTotal}}<tr><td>{{labels.discount}}:</td><td>-{{order.discountOnTotalFormatted}}</td></tr>{{/if}}
  {{#if hasNetValueDiff}}<tr><td>{{labels.netValue}}:</td><td>{{order.netValueFormatted}}</td></tr>{{/if}}
  {{#if hasPointPayment}}<tr><td>{{labels.payByPoint}}:</td><td>-{{order.amountFromPointFormatted}}</td></tr>{{/if}}
  {{#if showTax}}<tr><td>{{labels.tax}}:</td><td>+{{order.taxFormatted}}</td></tr>{{/if}}
  {{#if hasShipping}}<tr><td>{{labels.shippingFee}}:</td><td>+{{order.shippingFeeFormatted}}</td></tr>{{/if}}
  <tr class="grand"><td>{{labels.total}}:</td><td>{{order.totalFormatted}}</td></tr>
  <tr><td>{{labels.cash}}:</td><td>{{order.paidFormatted}}</td></tr>
  <tr><td>{{labels.change}}:</td><td>{{order.changeFormatted}}</td></tr>
  {{#if hasOldDebt}}<tr><td>{{labels.oldDebt}}:</td><td>{{order.oldDebtFormatted}}</td></tr>{{/if}}
</table>
{{#if hasOrderPrintNote}}<p class="thanks"><em>{{orderPrintNote}}</em></p>{{/if}}
{{#if showQr}}<div class="qr"><img src="{{qrCodeUrl}}" alt="QR thanh toán"><span>{{bank.name}} {{bankNumber}}</span><strong>{{labels.paid}} {{totalWithCurrency}}</strong></div>{{/if}}`;

export interface InvoiceTemplateInput {
  order: Order;
  items: OrderItem[];
  shop: Shop | null;
  qrCodeUrl?: string;
  printNote?: string;
  emptyRows?: number;
  hideDiscountColumn?: boolean;
  staffDisplay?: string;
  paidAmount?: number;
  promotionDiscount?: number;
  pointPayment?: number;
  taxAmount?: number;
  oldDebt?: number;
  showTax?: boolean;
  showStaffNameUnderSign?: boolean;
  receiptCompact?: boolean;
}

@Injectable({ providedIn: 'root' })
export class InvoiceTemplateService {
  readonly maxTemplateBytes = 200 * 1024;
  private readonly engine = Handlebars.create();

  constructor() {
    this.engine.registerHelper('inc', (value: number) => Number(value) + 1);
  }

  defaultFor(kind: InvoiceTemplateKind): string {
    return kind === 'invoice' ? DEFAULT_INVOICE_TEMPLATE : DEFAULT_RECEIPT_TEMPLATE;
  }

  filenameFor(kind: InvoiceTemplateKind): string {
    return kind === 'invoice' ? 'order-invoice.hbs' : 'order-receipt.hbs';
  }

  validate(template: string): string | null {
    if (!template.trim()) return 'Template không được để trống.';
    if (new TextEncoder().encode(template).byteLength > this.maxTemplateBytes) {
      return 'Template vượt quá giới hạn 200 KB.';
    }
    if (/<\s*(script|iframe|object|embed|form|meta|base)\b/i.test(template) || /\bon\w+\s*=/i.test(template) || /javascript\s*:/i.test(template)) {
      return 'Template chứa thẻ, sự kiện hoặc URL không an toàn.';
    }
    try {
      this.engine.precompile(template);
      return null;
    } catch (error: any) {
      return `Cú pháp Handlebars không hợp lệ: ${error?.message ?? 'không xác định'}`;
    }
  }

  render(template: string, context: Record<string, unknown>): string {
    const error = this.validate(template);
    if (error) throw new Error(error);
    return this.sanitize(this.engine.compile(template, { noEscape: false })(context));
  }

  context(input: InvoiceTemplateInput): Record<string, unknown> {
    const money = (value: number | null | undefined) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(value ?? 0)));
    const amount = (value: number | null | undefined) => {
      const parsed = Number(value ?? 0);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };
    const order = input.order;
    const itemRows = input.items.map((item, index) => ({
      index: index + 1,
      productName: item.name,
      unit: (item as any).unit ?? '',
      count: item.qty,
      priceFormatted: money(item.price),
      totalFormatted: money(item.total),
      discountText: '',
    }));
    const totalQty = input.items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0);
    const merchandise = input.items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
    const paid = amount(input.paidAmount ?? (order.paid ? order.total : 0));
    const shipping = amount(order.ship_fee);
    const discount = amount(order.discount);
    const promotionDiscount = amount(input.promotionDiscount);
    const pointPayment = amount(input.pointPayment);
    const tax = amount(input.taxAmount);
    const oldDebt = amount(input.oldDebt);
    const netValue = Math.max(0, merchandise - promotionDiscount - discount - pointPayment);
    const receiptCompact = input.receiptCompact ?? true;
    const createdAt = this.dateTime(order.created_at);
    const shop = input.shop;
    const emptyCount = Math.max(0, Math.min(20, Number(input.emptyRows ?? 0)));
    const labels = {
      shopPhone: 'Điện thoại:', shopEmail: 'Email:', shopFacebook: 'Facebook:', shopAddress: 'Địa chỉ:',
      bankName: 'Ngân hàng:', bankAccountName: 'Tên tài khoản', bankAccountNumber: 'Số tài khoản',
      orderPrintTitle: 'HÓA ĐƠN BÁN HÀNG', orderCode: 'Mã đơn:', staff: 'Nhân viên:', date: 'Ngày tạo:',
      customer: 'Khách hàng:', phone: 'Điện thoại:', address: 'Địa chỉ:', headIndex: 'STT', headName: 'Sản phẩm',
      headUnit: 'Đơn vị', headQty: 'Số lượng', headPrice: 'Đơn giá', headDiscount: 'Chiết khấu', headAmount: 'Thành tiền',
      headPriceShort: 'Đ.giá', headQtyShort: 'S.lượng', headDiscountShort: 'C.khấu', headAmountShort: 'T.tiền', totalAmount: 'Tổng tiền hàng',
      totalPromotionDiscount: 'Khuyến mại', discount: 'Chiết khấu', payByPoint: 'Thanh toán bằng điểm', tax: 'Thuế',
      shippingFee: 'Phí vận chuyển', netValue: 'Tạm tính', total: 'Tổng phải trả', oldDebt: 'Công nợ cũ',
      cash: 'Khách đưa', change: 'Tiền thừa', totalWritten: 'Tổng phải trả (viết bằng chữ):', note: 'Ghi chú:',
      customerTitle: 'KHÁCH HÀNG', buyer: 'NGƯỜI BÁN HÀNG', signHint: 'Ký và ghi rõ họ tên', qrPayment: 'Quét mã để thanh toán', paid: 'Thanh toán:',
    };
    return {
      shop: {
        name: shop?.name ?? '', nameUpper: (shop?.name ?? '').toUpperCase(), shortDescription: shop?.description ?? '',
        phone: shop?.phone ?? '', email: '', facebook: shop?.website ?? '', address: shop?.address ?? '', iconUrl: shop?.logo_url ?? '',
        bankName: shop?.bank_name ?? '', bankAccountName: shop?.bank_owner ?? '', bankAccountNumber: shop?.bank_account ?? '',
      },
      labels,
      order: {
        ...order, orderCode: order.code, createdAt, totalFormatted: money(order.total), netValueFormatted: money(netValue),
        totalPromotionDiscountFormatted: money(promotionDiscount), discountOnTotalFormatted: money(discount),
        amountFromPointFormatted: money(pointPayment), taxFormatted: money(tax), shippingFeeFormatted: money(shipping),
        paidFormatted: money(paid), changeFormatted: money(Math.max(0, paid - Number(order.total ?? 0))), oldDebtFormatted: money(oldDebt),
      },
      items: itemRows,
      emptyRows: Array.from({ length: emptyCount }, (_, i) => itemRows.length + i),
      totalProductsQuantity: totalQty,
      totalProductsAmountFormatted: money(merchandise),
      customerName: order.customer_name || 'Khách lẻ', customerPhone: order.customer_phone ?? '', customerAddress: order.customer_address ?? order.shipping_address ?? '',
      hasStaff: !!input.staffDisplay, staffDisplay: input.staffDisplay ?? '', hideDiscountColumn: !!input.hideDiscountColumn,
      showStaffNameUnderSign: !!input.showStaffNameUnderSign,
      totalColspan: input.hideDiscountColumn ? 5 : 6,
      hasPromotionDiscount: promotionDiscount > 0, hasDiscountOnTotal: discount > 0,
      hasNetValueDiff: promotionDiscount > 0 || discount > 0 || pointPayment > 0,
      hasPointPayment: pointPayment > 0, showTax: !!input.showTax || tax > 0, hasTax: tax > 0,
      hasShipping: shipping > 0, hasOldDebt: oldDebt > 0,
      hasOrderNote: !!order.note, hasOrderPrintNote: !!input.printNote, orderPrintNote: input.printNote ?? '',
      showQr: !!input.qrCodeUrl, qrCodeUrl: input.qrCodeUrl ?? '', amountToText: this.amountToVietnamese(Number(order.total ?? 0)),
      totalWithCurrency: `${money(order.total)} ₫`, receiptCompact,
      receiptColspan: receiptCompact ? 3 : 4, receiptSubtotalColspan: receiptCompact ? 2 : 3,
      bank: { name: shop?.bank_name ?? '' }, bankAccount: shop?.bank_owner ?? '', bankNumber: shop?.bank_account ?? '',
    };
  }

  previewContext(shop: Shop | null, printNote = '', emptyRows = 2): Record<string, unknown> {
    const sampleOrder: Order = {
      id: 'preview', shop_id: shop?.id ?? 'preview', code: 'DH-PREVIEW', customer_id: null,
      customer_name: 'Khách hàng (mẫu)', customer_phone: '0901234567', customer_address: 'Địa chỉ giao hàng (mẫu)',
      status: 'completed', total: 900900, discount: 0, paid: true, note: null, created_at: new Date().toISOString(),
    };
    const sampleItems: OrderItem[] = [
      { id: '1', order_id: 'preview', product_id: null, name: 'Sản phẩm mẫu A', price: 150000, qty: 2, total: 300000 },
      { id: '2', order_id: 'preview', product_id: null, name: 'Sản phẩm mẫu B', price: 200300, qty: 3, total: 600900 },
    ];
    return this.context({
      order: sampleOrder,
      items: sampleItems,
      shop,
      printNote,
      emptyRows,
      paidAmount: 1000000,
      showTax: true,
      staffDisplay: 'Nhân viên bán hàng',
    });
  }

  document(rendered: string, kind: InvoiceTemplateKind, autoPrint = false): string {
    const width = kind === 'receipt' ? '80mm' : '210mm';
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hóa đơn bán hàng</title><style>${this.baseCss(kind, width)}</style></head><body>${rendered}${autoPrint ? '<script>window.onload=()=>window.print()<\/script>' : ''}</body></html>`;
  }

  openPrint(template: string, kind: InvoiceTemplateKind, context: Record<string, unknown>): boolean {
    const rendered = this.render(template, context);
    const popup = window.open('', '_blank', kind === 'receipt' ? 'width=420,height=720' : 'width=900,height=760');
    if (!popup) return false;
    popup.document.open();
    popup.document.write(this.document(rendered, kind, true));
    popup.document.close();
    return true;
  }

  private sanitize(html: string): string {
    const doc = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
    for (const el of Array.from(doc.querySelectorAll('script,iframe,object,embed,form,input,button,meta,base,link'))) el.remove();
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>('*'))) {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith('on') || (name === 'style' && /url\s*\(|expression\s*\(/i.test(value))) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && value && !/^(https?:|data:image\/|\/)/i.test(value)) el.removeAttribute(attr.name);
      }
    }
    return doc.querySelector('main')?.innerHTML ?? '';
  }

  private dateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  private amountToVietnamese(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return 'không đồng';
    const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const units = ['', ' nghìn', ' triệu', ' tỷ'];
    const readBlock = (n: number, full: boolean) => {
      const hundred = Math.floor(n / 100), ten = Math.floor((n % 100) / 10), one = n % 10;
      const out: string[] = [];
      if (hundred || full) out.push(`${digits[hundred]} trăm`);
      if (ten > 1) out.push(`${digits[ten]} mươi`); else if (ten === 1) out.push('mười'); else if (one && (hundred || full)) out.push('lẻ');
      if (one) out.push(one === 1 && ten > 1 ? 'mốt' : one === 5 && ten > 0 ? 'lăm' : digits[one]);
      return out.join(' ');
    };
    let n = Math.round(value), group = 0;
    const parts: string[] = [];
    while (n > 0 && group < units.length) {
      const block = n % 1000;
      if (block) parts.unshift(readBlock(block, group > 0 && block < 100) + units[group]);
      n = Math.floor(n / 1000); group++;
    }
    return `${parts.join(' ').replace(/\s+/g, ' ').trim()} đồng`;
  }

  private baseCss(kind: InvoiceTemplateKind, width: string): string {
    return `*{box-sizing:border-box}body{margin:0 auto;padding:${kind === 'receipt' ? '10px 8px' : '18px'};width:${width};max-width:100%;background:#fff;color:#111;font:13px Arial,sans-serif;line-height:1.35}h1{text-align:center;font-size:18px;margin:14px 0}.shop-head{text-align:center;border-bottom:1px solid #111;padding-bottom:8px}.shop-head em,.receipt-head>*{display:block}.shop-logo,.receipt-logo{display:block;max-width:90px;max-height:64px;object-fit:contain;margin:0 auto 5px}.receipt-logo{max-width:70px;max-height:52px}.shop-name{font-size:15px}.shop-grid{display:grid;grid-template-columns:1fr 1fr;text-align:left;gap:20px;margin-top:8px}.bank-block{border-left:1px dotted #999;padding-left:20px}.invoice-meta>div,.receipt-meta>div,.receipt-bank>div{margin:2px 0}.receipt-bank{padding:6px 0;border-top:1px dashed #777;border-bottom:1px dashed #777}.dot-line{display:inline-block;min-width:180px;border-bottom:1px dotted #333}.invoice-table,.receipt-items,.receipt-total{width:100%;border-collapse:collapse;margin-top:10px}.invoice-table th,.invoice-table td{border:1px solid #111;padding:5px}.center{text-align:center}.number{text-align:right;white-space:nowrap}.written{margin-top:10px}.signatures{display:grid;grid-template-columns:1fr 1fr;text-align:center;margin-top:28px;min-height:90px}.staff-sign{display:block;margin-top:45px}.receipt-head{text-align:center;line-height:1.35}.receipt-meta{margin:8px 0}.receipt-items{border-top:1px dashed #777;border-bottom:1px dashed #777}.receipt-items th,.receipt-items td{padding:4px 2px;border-bottom:1px solid #bbb}.receipt-items .item-name td{padding-top:7px;border-bottom:0;font-weight:600}.receipt-items .subtotal td{border-bottom:0;border-top:1px dashed #777;padding-top:7px}.receipt-total td{padding:3px 2px}.receipt-total td:last-child{text-align:right;white-space:nowrap}.grand{font-weight:700;font-size:15px}.qr{display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:10px;text-align:center}.qr img{max-width:${kind === 'receipt' ? '180px' : '90px'}}.thanks{text-align:center}@page{margin:8mm;size:${kind === 'receipt' ? '80mm auto' : 'A4'}}@media print{body{width:100%;padding:0}}`;
  }
}
