/**
 * Mã chứng từ (đơn hàng / phiếu nhập / phiếu trả).
 *
 * Trước đây mã dùng Math.random().toString(36).slice(2, 6) — chỉ 4 ký tự
 * base36 (~1,68 triệu tổ hợp mỗi ngày). Với 1.000 đơn/ngày, xác suất có ít
 * nhất một mã trùng trong ngày xấp xỉ 26%. Mã trùng làm hóa đơn/tìm kiếm/đối
 * soát không còn xác định duy nhất. Dùng 4 byte ngẫu nhiên mật mã (8 ký tự
 * hex ≈ 4,3 tỷ tổ hợp) để hạ xác suất này xuống không đáng kể.
 */
export function newDocumentCode(prefix: 'DH' | 'PN' | 'TH', date: Date = new Date()): string {
  const ymd = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate()
  ).padStart(2, '0')}`;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${prefix}-${ymd}-${suffix}`;
}
