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
    expect(receipt).toContain('900.900');
    expect(receipt).toContain('Khách hàng (mẫu)');
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
