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
    expect(receipt).toContain('Công nợ hiện tại:');
    expect(receipt.indexOf('Công nợ hiện tại:')).toBeLessThan(receipt.indexOf('Tổng phải trả:'));
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

  it('derives the selected-unit price for every product when legacy unit_price is missing', () => {
    const order = {
      id: 'order-ht25', shop_id: 'shop-1', code: 'DH-HT25', customer_id: null,
      customer_name: 'Bún chả Hà Nội Q2', status: 'completed', total: 630_000,
      discount: 0, paid: false, note: null, created_at: '2026-10-27T06:10:00.000Z',
    };
    const items = [{
      id: 'item-ht25', order_id: 'order-ht25', product_id: 'ht25',
      name: 'Hộp nhựa đế đen HT25 4 ngăn JadeBox',
      price: 2_100, qty: 300, total: 630_000,
      unit: 'Thùng (300 hộp)', unit_qty: 1, unit_conversion: 300, unit_price: null,
    }];

    const context: any = service.context({ order, items, shop: null });

    expect(context.items[0].count).toBe(1);
    expect(context.items[0].priceFormatted).toBe('630.000');
    expect(context.items[0].price).toBe(630_000);
    expect(context.items[0].totalFormatted).toBe('630.000');

    const generic: any = service.context({
      order: { ...order, id: 'order-generic', code: 'DH-GENERIC', total: 288_000 },
      items: [{
        id: 'item-generic', order_id: 'order-generic', product_id: 'p-any',
        name: 'Sản phẩm bất kỳ', price: 12_000, qty: 24, total: 288_000,
        unit: 'Thùng (24 cái)', unit_conversion: 24, unit_price: null,
      }],
      shop: null,
    });
    expect(generic.items[0].priceFormatted).toBe('288.000');
  });

  it('places customer debt immediately before total payable on the large invoice', () => {
    const context: any = service.context({
      order: {
        id: 'order-debt', shop_id: 'shop-1', code: 'DH-DEBT', customer_id: 'customer-1',
        customer_name: 'Khách đang nợ', status: 'completed', total: 100_000,
        discount: 0, paid: true, note: null, created_at: '2026-10-28T08:00:00.000Z',
      },
      items: [{ id: 'i', order_id: 'order-debt', product_id: null, name: 'SP', price: 100_000, qty: 1, total: 100_000 }],
      shop: null,
      oldDebt: 250_000,
    });
    const html = service.render(service.defaultFor('invoice'), context);
    expect(html).toContain('Công nợ hiện tại');
    expect(html.indexOf('Công nợ hiện tại')).toBeLessThan(html.indexOf('Tổng phải trả'));
  });

  it('uses zero empty rows by default', () => {
    const context: any = service.previewContext(null);
    expect(context.emptyRows).toEqual([]);
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

  it('keeps unit cells on one line and writes the exact payable total in words', () => {
    const order = {
      id: 'order-bill', shop_id: 'shop-1', code: 'DH-BILL', customer_id: null,
      customer_name: 'Khách Bill', status: 'completed', total: 4_375_000,
      discount: 0, paid: true, note: null, ship_fee: 0, created_at: '2026-10-26T06:06:00.000Z',
    };
    const context: any = service.context({
      order,
      items: [{ id: 'item-bill', order_id: 'order-bill', product_id: null, name: 'Sản phẩm', price: 4_375_000, qty: 1, total: 4_375_000, unit: 'Thùng (4000 đôi)' }],
      shop: null,
    });

    expect(context.order.totalFormatted).toBe('4.375.000');
    expect(context.amountToText).toBe('bốn triệu ba trăm bảy mươi lăm nghìn đồng');

    const html = service.render(service.defaultFor('invoice'), context);
    expect(html).toContain('width: 20%;');
    expect(html).toContain('white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9em;">Thùng (4000 đôi)</td>');
    expect(html).toContain('text-align: center; vertical-align: middle; white-space: normal; word-break: break-word; overflow-wrap: anywhere;">\n                Sản phẩm');
    expect(html).toContain('text-align: center; vertical-align: middle;">4.375.000</td>');
    expect(html).toContain('bốn triệu ba trăm bảy mươi lăm nghìn đồng');
  });

  it('reads zero-padded lower number groups without padding the highest group', () => {
    const order = {
      id: 'order-words', shop_id: 'shop-1', code: 'DH-WORDS', customer_id: null,
      customer_name: 'Khách', status: 'completed', total: 1_005_000,
      discount: 0, paid: true, note: null, ship_fee: 0, created_at: '2026-10-26T06:06:00.000Z',
    };
    const context: any = service.context({ order, items: [], shop: null });

    expect(context.amountToText).toBe('một triệu không trăm lẻ năm nghìn đồng');
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

