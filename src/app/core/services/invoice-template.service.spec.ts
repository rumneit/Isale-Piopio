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
