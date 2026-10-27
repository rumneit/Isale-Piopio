import { Injectable } from '@angular/core';
import Handlebars from 'handlebars';
import { Order, OrderItem, Shop } from '../models/models';

export type InvoiceTemplateKind = 'invoice' | 'receipt';
export type InvoicePaperSize = 'A4' | 'A5';

export const DEFAULT_INVOICE_TEMPLATE = `{{!-- Mẫu hóa đơn khổ lớn --}}
{{#if shop.name}}
<div style="border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 4px;">
    <div style="width: 100%; text-align: center; margin-top: 5px;">
        <strong style="font-size: 1.1em;">{{shop.nameUpper}}</strong><br>
        {{#if shop.shortDescription}}<i style="font-size: 0.9em;">{{shop.shortDescription}}</i>{{/if}}
    </div>
    <table style="border: none; width: 100%; margin-top: 6px; table-layout: fixed;">
        <tr>
            {{#if shop.iconUrl}}
            <td style="width: 20%; vertical-align: top; padding: 0;">
                <img src="{{shop.iconUrl}}" style="max-width: 44px; max-height: 44px;" />
            </td>
            {{/if}}
            <td style="vertical-align: top; padding: 0 8px 0 0;{{#if shop.bankName}}{{#if shop.iconUrl}} width: 40%;{{else}} width: 60%;{{/if}}{{else}}{{#if shop.iconUrl}} width: 80%;{{else}} width: 100%;{{/if}}{{/if}}">
                <table style="border: none; border-spacing: 0; width: 100%; font-size: 0.9em;">
                    {{#if shop.phone}}
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 1px 0;">{{{labels.shopPhone}}}</td>
                        <td style="padding: 1px 0 1px 5px;" nowrap>{{shop.phone}}</td>
                    </tr>
                    {{/if}}
                    {{#if shop.email}}
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 1px 0;">{{{labels.shopEmail}}}</td>
                        <td style="padding: 1px 0 1px 5px;" nowrap>{{shop.email}}</td>
                    </tr>
                    {{/if}}
                    {{#if shop.facebook}}
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 1px 0;">{{{labels.shopFacebook}}}</td>
                        <td style="padding: 1px 0 1px 5px;" nowrap>{{shop.facebook}}</td>
                    </tr>
                    {{/if}}
                    {{#if shop.address}}
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 1px 0; vertical-align: top;">{{{labels.shopAddress}}}</td>
                        <td style="padding: 1px 0 1px 5px;">{{shop.address}}</td>
                    </tr>
                    {{/if}}
                </table>
            </td>
            {{#if shop.bankName}}
            <td style="width: 40%; vertical-align: top; padding: 0 0 0 20px; border-left: 1px dotted #999;">
                <table style="border: none; width: 100%; font-size: 0.9em; table-layout: fixed;">
                    <tr>
                        <td style="width: 38%; white-space: nowrap; padding: 1px 0; vertical-align: top;"><strong>{{{labels.bankName}}}</strong></td>
                        <td style="padding: 1px 0 1px 5px; vertical-align: top; word-break: break-word;">{{shop.bankName}}</td>
                    </tr>
                    {{#if shop.bankAccountName}}
                    <tr>
                        <td style="white-space: nowrap; padding: 1px 0; vertical-align: top;">{{{labels.bankAccountName}}}:</td>
                        <td style="padding: 1px 0 1px 5px; vertical-align: top; word-break: break-word;">{{shop.bankAccountName}}</td>
                    </tr>
                    {{/if}}
                    {{#if shop.bankAccountNumber}}
                    <tr>
                        <td style="white-space: nowrap; padding: 1px 0; vertical-align: top;">{{{labels.bankAccountNumber}}}:</td>
                        <td style="padding: 1px 0 1px 5px; vertical-align: top; word-break: break-word;">{{shop.bankAccountNumber}}</td>
                    </tr>
                    {{/if}}
                </table>
            </td>
            {{/if}}
        </tr>
    </table>
</div>
{{/if}}

<div>
    <table style="border: none; width: 100%; margin-top: 4px; border-collapse: collapse;">
        <tr>
            <td style="vertical-align: top; padding: 0;">
                <div style="text-align: center;">
                    <h2 style="font-size: 18px; text-transform: uppercase; font-weight: bold; margin: 8px 0 10px;">{{labels.orderPrintTitle}}</h2>
                </div>
                <table style="border: none; width: 100%;">
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 0;"><strong>{{{labels.orderCode}}}</strong></td>
                        <td style="padding: 0 0 0 5px;">{{order.orderCode}}</td>
                    </tr>
                    {{#if hasStaff}}
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 0;">{{{labels.staff}}}</td>
                        <td style="padding: 0 0 0 5px;">{{staffDisplay}}</td>
                    </tr>
                    {{/if}}
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 0;">{{{labels.date}}}</td>
                        <td style="padding: 0 0 0 5px;">{{order.createdAt}}</td>
                    </tr>
                </table>
                <table style="border: none; width: 100%; margin-top: 4px;">
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 0; vertical-align: top;">{{{labels.customer}}}</td>
                        <td style="padding: 0 0 0 5px;"><strong>{{customerName}}</strong></td>
                    </tr>
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 0; vertical-align: top;">{{{labels.phone}}}</td>
                        <td style="padding: 0 0 0 5px;">{{customerPhone}}</td>
                    </tr>
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 0; vertical-align: top;">{{{labels.address}}}</td>
                        <td style="padding: 0 0 0 5px;">{{customerAddress}}</td>
                    </tr>
                </table>
            </td>
            {{#if showQr}}
            <td style="width: 90px; vertical-align: top; text-align: center; padding: 0 0 0 8px;">
                <img src="{{qrCodeUrl}}" style="width: 72px; max-width: 72px; height: auto; display: block; margin: 8px auto 2px;" alt="QR">
                <div style="font-size: 0.75em; line-height: 1.2;">{{labels.qrPayment}}</div>
            </td>
            {{/if}}
        </tr>
    </table>
</div>

<div style="padding-left: 5px; padding-right: 5px;">
    <table style="margin-top: 10px; margin-bottom: 10px; width: 100%; border-collapse: collapse; table-layout: fixed;">
        <colgroup>
            <col style="width: 6%;">
            <col style="width: {{#if hideDiscountColumn}}44%{{else}}36%{{/if}};">
            <col style="width: 11%;">
            <col style="width: 8%;">
            <col style="width: 14%;">
            {{#unless hideDiscountColumn}}<col style="width: 8%;">{{/unless}}
            <col style="width: 17%;">
        </colgroup>
        <tr>
            <td style="border-top: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center;"><b>{{labels.headIndex}}</b></td>
            <td style="border-top: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;"><b>{{labels.headName}}</b></td>
            <td style="border-top: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle; white-space: nowrap;"><b>{{labels.headUnit}}</b></td>
            <td style="border-top: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;"><b>{{labels.headQty}}</b></td>
            <td style="border-top: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;"><b>{{labels.headPrice}}</b></td>
            {{#unless hideDiscountColumn}}
            <td style="border-top: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;"><b>{{labels.headDiscount}}</b></td>
            {{/unless}}
            <td style="border-right: 1px solid #000; border-top: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;"><b>{{labels.headAmount}}</b></td>
        </tr>
        {{#each items}}
        <tr>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center;">{{index}}</td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle; white-space: normal; word-break: break-word; overflow-wrap: anywhere;">
                {{productName}}{{{extrasHtml}}}
            </td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle; white-space: nowrap;">{{unit}}</td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;">{{count}}</td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;">{{priceFormatted}}</td>
            {{#unless ../hideDiscountColumn}}
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;">{{discountText}}</td>
            {{/unless}}
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center; vertical-align: middle;">
                {{totalFormatted}}{{#if ../hideDiscountColumn}}{{#if discountText}}<br><span style="font-size: 0.8em;">{{discountText}}</span>{{/if}}{{/if}}
            </td>
        </tr>
        {{/each}}
        {{#each emptyRows}}
        <tr>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: center;">{{inc this}}</td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
            {{#unless ../hideDiscountColumn}}
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
            {{/unless}}
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
        </tr>
        {{/each}}
        <tr>
            <td colspan="3" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;"><strong>{{labels.totalAmount}}</strong></td>
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;">{{totalProductsQuantity}}</td>
            {{#unless hideDiscountColumn}}
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
            {{/unless}}
            <td style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">&nbsp;</td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;">{{totalProductsAmountFormatted}}</td>
        </tr>
        {{#if hasPromotionDiscount}}
        <tr>
            <td colspan="{{totalColspan}}" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">{{labels.totalPromotionDiscount}}</td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;">-{{order.totalPromotionDiscountFormatted}}</td>
        </tr>
        {{/if}}
        {{#if hasDiscountOnTotal}}
        <tr>
            <td colspan="{{totalColspan}}" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">{{labels.discount}}</td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;">-{{order.discountOnTotalFormatted}}</td>
        </tr>
        {{/if}}
        {{#if hasPointPayment}}
        <tr>
            <td colspan="{{totalColspan}}" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">{{labels.payByPoint}}</td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;">-{{order.amountFromPointFormatted}}</td>
        </tr>
        {{/if}}
        {{#if hasTax}}
        <tr>
            <td colspan="{{totalColspan}}" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">{{labels.tax}}</td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;">+{{order.taxFormatted}}</td>
        </tr>
        {{/if}}
        {{#if hasShipping}}
        <tr>
            <td colspan="{{totalColspan}}" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;">{{labels.shippingFee}}</td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;">+{{order.shippingFeeFormatted}}</td>
        </tr>
        {{/if}}
        <tr>
            <td colspan="{{totalColspan}}" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px;"><strong>{{labels.total}}</strong></td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right;"><strong>{{order.totalFormatted}}</strong></td>
        </tr>
        {{#if hasOldDebt}}
        <tr>
            <td colspan="{{totalColspan}}" style="border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; background-color: #fff3e0;"><strong style="color: #dc3545;">{{labels.oldDebt}}</strong></td>
            <td style="border-right: 1px solid #000; border-left: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; text-align: right; background-color: #fff3e0;"><strong style="color: #dc3545;">{{oldDebtFormatted}}</strong></td>
        </tr>
        {{/if}}
    </table>
</div>

<div>
    <table style="width: 100%; border: none;" cellpadding="0" cellspacing="0">
        <tr>
            <td style="width: 1px; white-space: nowrap;">{{{labels.totalWritten}}}</td>
            <td>&nbsp;{{amountToText}}</td>
            <td colspan="2">&nbsp;</td>
        </tr>
        {{#if hasOrderNote}}
        <tr>
            <td colspan="2" style="padding: 0;">
                <table style="width: 100%;">
                    <tr>
                        <td style="width: 1px; white-space: nowrap; padding: 0;">{{{labels.note}}}</td>
                        <td style="border-bottom: 1px dotted #000; padding: 0 0 0 5px;">{{order.note}}</td>
                    </tr>
                </table>
            </td>
        </tr>
        {{/if}}
    </table>
</div>
{{#if hasOrderPrintNote}}
<div style="padding-top: 8px;"><i>{{orderPrintNote}}</i></div>
{{/if}}

<div>
    <table style="border: none; width: 100%; margin-bottom: 20px; margin-top: 20px;">
        <tr>
            <td style="width: 50%; text-align: center; vertical-align: top;">
                <table style="border: none; margin: 0 auto;">
                    <tr>
                        <td>
                            <strong style="text-transform: uppercase;">{{labels.customerTitle}}</strong><br>
                            ({{labels.signHint}})
                        </td>
                    </tr>
                </table>
            </td>
            <td style="width: 50%; text-align: center; vertical-align: top;">
                <table style="border: none; margin: 0 auto;">
                    <tr>
                        <td>
                            <strong style="text-transform: uppercase;">{{labels.buyer}}</strong><br>
                            ({{labels.signHint}})
                        </td>
                    </tr>
                    <tr><td>&nbsp;</td></tr>
                    <tr><td>&nbsp;</td></tr>
                    <tr><td>&nbsp;</td></tr>
                    {{#if showStaffNameUnderSign}}
                    {{#if hasStaff}}
                    <tr><td><span>{{staffDisplay}}</span></td></tr>
                    {{/if}}
                    {{/if}}
                </table>
            </td>
        </tr>
    </table>
</div>`;

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
    // Dùng cùng một giá trị đã chuẩn hóa cho cả số và chữ để hai dòng trên bill
    // không thể lệch nhau vì null, NaN, số âm hoặc phần thập phân.
    const payableTotal = Math.round(amount(order.total));
    const itemRows = input.items.map((item, index) => ({
      index: index + 1,
      productName: item.name,
      unit: item.unit ?? '',
      // Đơn vị khách đã chọn (Thùng/Lốc...) nếu có; đơn cũ vẫn hiển thị đơn vị gốc.
      count: item.unit_qty ?? item.qty,
      priceFormatted: money(item.unit_price ?? item.price),
      totalFormatted: money(Number(item.total ?? Number(item.price) * Number(item.qty))),
      discountText: '',
    }));
    // Tổng số lượng chỉ có nghĩa khi mọi dòng cùng một đơn vị. Nếu đơn có
    // nhiều đơn vị (1 Thùng + 1 Cái), cộng số lượng sẽ sai; hiển thị "—".
    const unitKeys = new Set(
      input.items.map((item) => (item.unit ?? '').trim().toLocaleLowerCase('vi') || '__base__')
    );
    const totalQty =
      unitKeys.size <= 1
        ? input.items.reduce((sum, item) => sum + Number(item.unit_qty ?? item.qty ?? 0), 0)
        : '—';
    const merchandise = input.items.reduce(
      (sum, item) => sum + Number(item.total ?? Number(item.price) * Number(item.qty)),
      0
    );
    const paid = amount(input.paidAmount ?? (order.paid ? order.total : 0));
    /** Phí ship chỉ vào bill khi khách trả (nếu shop chịu phí thì không nằm trong tổng đơn) */
    const shipping = order.ship_fee_by_customer === false ? 0 : amount(order.ship_fee);
    const discount = amount(order.discount);
    const promotionDiscount = amount(input.promotionDiscount);
    const pointPayment = amount(input.pointPayment);
    const oldDebt = amount(input.oldDebt);
    const netValue = Math.max(0, merchandise - promotionDiscount - discount - pointPayment);
    /**
     * VAT không lưu riêng trong DB: suy ra từ tổng đơn
     * tổng = tiền hàng − chiết khấu − khuyến mại − điểm + VAT + phí ship
     */
    const tax =
      input.taxAmount != null
        ? amount(input.taxAmount)
        : Math.max(0, Math.round(Number(order.total ?? 0) - netValue - shipping));
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
        ...order, orderCode: order.code, createdAt, totalFormatted: money(payableTotal), netValueFormatted: money(netValue),
        totalPromotionDiscountFormatted: money(promotionDiscount), discountOnTotalFormatted: money(discount),
        amountFromPointFormatted: money(pointPayment), taxFormatted: money(tax), shippingFeeFormatted: money(shipping),
        paidFormatted: money(paid), changeFormatted: money(Math.max(0, paid - payableTotal)), oldDebtFormatted: money(oldDebt),
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
      showQr: !!input.qrCodeUrl, qrCodeUrl: input.qrCodeUrl ?? '', amountToText: this.amountToVietnamese(payableTotal),
      totalWithCurrency: `${money(payableTotal)} ₫`, receiptCompact,
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

  /** Chuẩn hóa khổ giấy hóa đơn — mặc định A5 theo mẫu Hóa đơn khổ lớn */
  normalizePaperSize(value: unknown): InvoicePaperSize {
    return value === 'A4' ? 'A4' : 'A5';
  }

  document(
    rendered: string,
    kind: InvoiceTemplateKind,
    autoPrint = false,
    paperSize: InvoicePaperSize = 'A5'
  ): string {
    const size = this.normalizePaperSize(paperSize);
    const width = kind === 'receipt' ? '80mm' : size === 'A5' ? '148mm' : '210mm';
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hóa đơn bán hàng</title><style>${this.baseCss(kind, width, size)}</style></head><body>${rendered}${autoPrint ? '<script>window.onload=()=>window.print()<\/script>' : ''}</body></html>`;
  }

  openPrint(
    template: string,
    kind: InvoiceTemplateKind,
    context: Record<string, unknown>,
    paperSize: InvoicePaperSize = 'A5'
  ): boolean {
    const size = this.normalizePaperSize(paperSize);
    const rendered = this.render(template, context);
    const popup = window.open(
      '',
      '_blank',
      kind === 'receipt' ? 'width=420,height=720' : size === 'A5' ? 'width=700,height=820' : 'width=900,height=900'
    );
    if (!popup) return false;
    popup.document.open();
    popup.document.write(this.document(rendered, kind, true, size));
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
    // Đơn hàng cho phép tới < 10.000 tỷ (1e13) nên phải đủ nhóm đơn vị;
    // trước đây dừng ở 'tỷ' nên số từ 1.000 tỷ trở lên bị đọc thiếu.
    const units = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];
    const readBlock = (n: number, full: boolean) => {
      const hundred = Math.floor(n / 100), ten = Math.floor((n % 100) / 10), one = n % 10;
      const out: string[] = [];
      if (hundred || full) out.push(`${digits[hundred]} trăm`);
      if (ten > 1) out.push(`${digits[ten]} mươi`); else if (ten === 1) out.push('mười'); else if (one && (hundred || full)) out.push('lẻ');
      if (one) out.push(one === 1 && ten > 1 ? 'mốt' : one === 5 && ten > 0 ? 'lăm' : digits[one]);
      return out.join(' ');
    };
    let n = Math.round(value);
    const blocks: number[] = [];
    while (n > 0 && blocks.length < units.length) {
      blocks.push(n % 1000);
      n = Math.floor(n / 1000);
    }
    const highestGroup = blocks.length - 1;
    const parts: string[] = [];
    for (let group = highestGroup; group >= 0; group--) {
      const block = blocks[group];
      if (block) {
        // Chỉ đọc đủ hàng trăm ở nhóm thấp hơn một nhóm có nghĩa. Nhóm cao
        // nhất của 4.375.000 phải là “bốn triệu”, không phải “không trăm lẻ bốn triệu”.
        const full = group < highestGroup && block < 100;
        parts.push(readBlock(block, full) + units[group]);
      }
    }
    return `${parts.join(' ').replace(/\s+/g, ' ').trim()} đồng`;
  }

  private baseCss(kind: InvoiceTemplateKind, width: string, paperSize: InvoicePaperSize): string {
    const screenPadding = kind === 'receipt' ? '10px 8px' : '18px 18px 18px 28px';
    const pageMargin = kind === 'receipt' ? '8mm' : '8mm 8mm 8mm 12mm';
    const base = `*{box-sizing:border-box}body{margin:0 auto;padding:${screenPadding};width:${width};max-width:100%;background:#fff;color:#111;font:13px Arial,sans-serif;line-height:1.35}h1{text-align:center;font-size:18px;margin:14px 0}.shop-head{text-align:center;border-bottom:1px solid #111;padding-bottom:8px}.shop-head em,.receipt-head>*{display:block}.shop-logo,.receipt-logo{display:block;max-width:90px;max-height:64px;object-fit:contain;margin:0 auto 5px}.receipt-logo{max-width:70px;max-height:52px}.shop-name{font-size:15px}.shop-grid{display:grid;grid-template-columns:1fr 1fr;text-align:left;gap:20px;margin-top:8px}.bank-block{border-left:1px dotted #999;padding-left:20px}.invoice-meta>div,.receipt-meta>div,.receipt-bank>div{margin:2px 0}.receipt-bank{padding:6px 0;border-top:1px dashed #777;border-bottom:1px dashed #777}.dot-line{display:inline-block;min-width:180px;border-bottom:1px dotted #333}.invoice-table,.receipt-items,.receipt-total{width:100%;border-collapse:collapse;margin-top:10px}.invoice-table th,.invoice-table td{border:1px solid #111;padding:5px}.center{text-align:center}.number{text-align:right;white-space:nowrap}.written{margin-top:10px}.signatures{display:grid;grid-template-columns:1fr 1fr;text-align:center;margin-top:28px;min-height:90px}.staff-sign{display:block;margin-top:45px}.receipt-head{text-align:center;line-height:1.35}.receipt-meta{margin:8px 0}.receipt-items{border-top:1px dashed #777;border-bottom:1px dashed #777}.receipt-items th,.receipt-items td{padding:4px 2px;border-bottom:1px solid #bbb}.receipt-items .item-name td{padding-top:7px;border-bottom:0;font-weight:600}.receipt-items .subtotal td{border-bottom:0;border-top:1px dashed #777;padding-top:7px}.receipt-total td{padding:3px 2px}.receipt-total td:last-child{text-align:right;white-space:nowrap}.grand{font-weight:700;font-size:15px}.qr{display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:10px;text-align:center}.qr img{max-width:${kind === 'receipt' ? '180px' : '90px'}}.thanks{text-align:center}@page{margin:${pageMargin};size:${kind === 'receipt' ? '80mm auto' : 'A4'}}@media print{body{width:100%;padding:0}}`;
    // Cột "Sản phẩm" rộng + được xuống dòng để hiện đủ tên hàng trong kho
    const nameColumn =
      kind === 'invoice'
        ? `.invoice-table{table-layout:fixed}` +
          `.invoice-table th:nth-child(1),.invoice-table td:nth-child(1){width:6%}` +
          `.invoice-table th:nth-child(2),.invoice-table td:nth-child(2){width:40%;white-space:normal;word-break:break-word;overflow-wrap:anywhere}` +
          `.invoice-table th:nth-child(3),.invoice-table td:nth-child(3){width:8%}` +
          `.invoice-table th:nth-child(4),.invoice-table td:nth-child(4){width:8%}` +
          `.invoice-table th:nth-child(5),.invoice-table td:nth-child(5){width:12%}` +
          `.invoice-table th:last-child,.invoice-table td:last-child{width:16%}`
        : `.receipt-items .item-name td{white-space:normal;word-break:break-word;overflow-wrap:anywhere}`;
    if (kind !== 'invoice' || paperSize !== 'A5') return base + nameColumn;
    // Hóa đơn khổ lớn A5: thu gọn chữ/bảng để vừa 148mm
    return base + nameColumn + `body{width:148mm;padding:6mm 6mm 6mm 9mm;font-size:10.5px}h1{font-size:15px;margin:10px 0}.shop-name{font-size:13px}.shop-grid{gap:10px}.bank-block{padding-left:10px}.shop-logo{max-width:64px;max-height:46px}.dot-line{min-width:120px}.invoice-table th,.invoice-table td{padding:3px;font-size:10px}.written{margin-top:6px}.signatures{margin-top:18px;min-height:70px}.staff-sign{margin-top:30px}.qr img{max-width:70px}@page{margin:5mm 5mm 5mm 8mm;size:A5}@media print{body{width:100%;padding:0}}`;
  }
}

