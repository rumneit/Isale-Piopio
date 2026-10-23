import { describe, expect, it } from 'vitest';
import { InvoiceTemplateService } from './invoice-template.service';

describe('InvoiceTemplateService', () => {
  const service = new InvoiceTemplateService();

  it('renders both system templates with sample data', () => {
    const context = service.previewContext({
      id: 'shop-1', name: 'Cửa hàng PioPio', owner_id: 'owner-1', phone: '0900000000', address: 'TP.HCM',
    });

    const invoice = service.render(service.defaultFor('invoice'), context);
    const receipt = service.render(service.defaultFor('receipt'), context);

    expect(invoice).toContain('DH-PREVIEW');
    expect(invoice).toContain('Sản phẩm mẫu A');
    expect(invoice).toContain('Nhân viên bán hàng');
    expect(receipt).toContain('900.900');
    expect(receipt).toContain('Khách hàng (mẫu)');
    expect(receipt).toContain('Thuế:');
  });

  it('renders every optional payment branch without inventing values', () => {
    const order = {
      id: 'order-1', shop_id: 'shop-1', code: 'DH-001', customer_id: null,
      customer_name: 'Nguyễn Văn A', status: 'completed', total: 126500,
      discount: 10000, paid: true, note: 'Giao giờ hành chính', ship_fee: 5000,
      created_at: '2026-10-08T08:00:00.000Z',
    };
    const context = service.context({
      order,
      items: [{ id: 'item-1', order_id: 'order-1', product_id: null, name: 'Sản phẩm', price: 150000, qty: 1, total: 150000 }],
      shop: { id: 'shop-1', name: 'PioPio', owner_id: 'owner-1', bank_name: 'MB Bank', bank_owner: 'PIOPIO', bank_account: '0123456789' },
      promotionDiscount: 12000,
      pointPayment: 6500,
      taxAmount: 0,
      showTax: true,
      oldDebt: 20000,
      staffDisplay: 'Thu ngân A',
      receiptCompact: false,
    });

    const receipt = service.render(service.defaultFor('receipt'), context);
    expect(receipt).toContain('Khuyến mại:');
    expect(receipt).toContain('Thanh toán bằng điểm:');
    expect(receipt).toContain('Thuế:');
    expect(receipt).toContain('Phí vận chuyển:');
    expect(receipt).toContain('Công nợ cũ:');
    expect(receipt).toContain('MB Bank');
    expect(receipt).toContain('C.khấu');
  });

  it('derives VAT and shipping fee from the stored order total (khách trả ship)', () => {
    const order = {
      id: 'order-2', shop_id: 'shop-1', code: 'DH-002', customer_id: null,
      customer_name: 'Khách B', status: 'completed', total: 1_100_000,
      discount: 0, paid: true, note: null, ship_fee: 30_000, ship_fee_by_customer: true,
      created_at: '2026-10-21T08:00:00.000Z',
    };
    const items = [{ id: 'item-1', order_id: 'order-2', product_id: null, name: 'Sản phẩm', price: 1_000_000, qty: 1, total: 1_000_000 }];

    const receipt: any = service.context({ order, items, shop: null, showTax: true });
    // total = tiền hàng − chiết khấu + VAT + ship ⇒ VAT = 1.100.000 − 1.000.000 − 30.000 = 70.000
    expect(receipt.order.taxFormatted).toBe('70.000');
    expect(receipt.order.shippingFeeFormatted).toBe('30.000');
    expect(receipt.hasShipping).toBe(true);

    const html = service.render(service.defaultFor('receipt'), receipt);
    expect(html).toContain('Thuế:');
    expect(html).toContain('70.000');
    expect(html).toContain('Phí vận chuyển:');
    expect(html).toContain('30.000');
    expect(html).toContain('1.100.000');
  });

  it('does not add shipping to the bill when the shop pays the fee', () => {
    const order = {
      id: 'order-3', shop_id: 'shop-1', code: 'DH-003', customer_id: null,
      customer_name: 'Khách C', status: 'completed', total: 1_070_000,
      discount: 0, paid: true, note: null, ship_fee: 30_000, ship_fee_by_customer: false,
      created_at: '2026-10-21T08:00:00.000Z',
    };
    const items = [{ id: 'item-1', order_id: 'order-3', product_id: null, name: 'Sản phẩm', price: 1_000_000, qty: 1, total: 1_000_000 }];

    const context: any = service.context({ order, items, shop: null, showTax: true });
    expect(context.order.shippingFeeFormatted).toBe('0');
    expect(context.order.taxFormatted).toBe('70.000');
    expect(context.hasShipping).toBe(false);
  });

  it('prints the selected unit, unit quantity and unit price on the invoice', () => {
    const order = {
      id: 'order-u1', shop_id: 'shop-1', code: 'DH-U1', customer_id: null,
      customer_name: 'Khách Thùng', status: 'completed', total: 4_500_000,
      discount: 0, paid: true, note: null, ship_fee: 0, created_at: '2026-10-23T08:00:00.000Z',
    };
    const items = [
      {
        id: 'item-u1', order_id: 'order-u1', product_id: 'p1', name: 'Nước mắm',
        price: 15_000, qty: 100, total: 1_500_000, unit: 'thùng', unit_qty: 1,
        unit_conversion: 100, unit_price: 1_500_000,
      },
      {
        id: 'item-u2', order_id: 'order-u1', product_id: 'p2', name: 'Nước mắm',
        price: 15_000, qty: 200, total: 3_000_000, unit: 'thùng', unit_qty: 2,
        unit_conversion: 100, unit_price: 1_500_000,
      },
    ];
    const context: any = service.context({ order, items, shop: null });

    expect(context.items[0].count).toBe(1);
    expect(context.items[0].unit).toBe('thùng');
    expect(context.items[0].priceFormatted).toBe('1.500.000');
    expect(context.totalProductsQuantity).toBe(3);
  });

  it('does not invent a total quantity when an order mixes units', () => {
    const order = {
      id: 'order-u2', shop_id: 'shop-1', code: 'DH-U2', customer_id: null,
      customer_name: 'Khách Hỗn Hợp', status: 'completed', total: 1_520_000,
      discount: 0, paid: true, note: null, ship_fee: 0, created_at: '2026-10-23T08:00:00.000Z',
    };
    const items = [
      {
        id: 'item-u3', order_id: 'order-u2', product_id: 'p1', name: 'Nước mắm',
        price: 15_000, qty: 100, total: 1_500_000, unit: 'thùng', unit_qty: 1,
        unit_conversion: 100, unit_price: 1_500_000,
      },
      {
        id: 'item-u4', order_id: 'order-u2', product_id: 'p1', name: 'Nước mắm',
        price: 20_000, qty: 1, total: 20_000, unit: 'Cái', unit_qty: 1,
        unit_conversion: 1, unit_price: 20_000,
      },
    ];
    const context: any = service.context({ order, items, shop: null });

    expect(context.totalProductsQuantity).toBe('—');
  });

  it('escapes business data supplied to a template', () => {
    const html = service.render('<p>{{customerName}}</p>', { customerName: '<img src=x onerror=alert(1)>' });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('rejects unsafe or malformed templates', () => {
    expect(service.validate('<script>alert(1)</script>')).toContain('không an toàn');
    expect(service.validate('<img src="javascript:alert(1)">')).toContain('không an toàn');
    expect(service.validate('{{#if value}}')).toContain('không hợp lệ');
  });

  it('removes unsafe URL protocols from rendered HTML', () => {
    const html = service.render('<a href="data:text/html,unsafe">Mở</a><p>OK</p>', {});
    expect(html).not.toContain('href=');
    expect(html).toContain('<p>OK</p>');
  });
});
