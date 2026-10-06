import { describe, expect, it } from 'vitest';
import { autoMapCustomerHeaders, normalizePhoneInput, parseCustomerRows, parseVCard } from './customer-tools';

describe('customer tools', () => {
  it('maps Vietnamese headers and preserves leading-zero phone text', () => {
    const mapping = autoMapCustomerHeaders(['Họ tên', 'SĐT', 'Email']);
    expect(mapping.name).toBe(0); expect(mapping.phone).toBe(1); expect(mapping.email).toBe(2);
    expect(normalizePhoneInput('0912 345 678')).toBe('0912345678');
    expect(normalizePhoneInput('+84 912 345 678')).toBe('0912345678');
    expect(normalizePhoneInput(912345678)).toBe('0912345678');
  });

  it('reports exact row errors and duplicate phones in one file', () => {
    const mapping = autoMapCustomerHeaders(['Họ tên', 'SĐT']);
    const result = parseCustomerRows([
      ['Họ tên', 'SĐT'], ['An Nguyễn', '0912345678'], ['Bình', '+84 912 345 678'], ['', '123'],
    ], 0, mapping, () => null);
    expect(result.rows).toHaveLength(1);
    expect(result.errors.some((error) => error.row === 3 && error.message.includes('Trùng'))).toBe(true);
    expect(result.errors.some((error) => error.row === 4 && error.field === 'name')).toBe(true);
  });

  it('parses only contacts explicitly present in a vCard', () => {
    const contacts = parseVCard('BEGIN:VCARD\nFN:Nguyễn An\nTEL:+84 912 345 678\nEMAIL:AN@EXAMPLE.COM\nEND:VCARD');
    expect(contacts).toEqual([{ name: 'Nguyễn An', phone: '0912345678', phones: ['0912345678'], email: 'an@example.com', selected: true }]);
  });

  it('preserves all phone choices from a vCard', () => {
    const contacts = parseVCard('BEGIN:VCARD\nFN:Nguyễn An\nTEL:0912345678\nTEL:0987654321\nEND:VCARD');
    expect(contacts[0].phones).toEqual(['0912345678', '0987654321']);
  });
});
