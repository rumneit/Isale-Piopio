import { Shipment } from '../../core/models/models';

/**
 * In template A6 (10×15cm) tự render — dùng khi chưa có labelUrl của hãng.
 * Bố cục theo chuẩn vận đơn VN: người gửi → người nhận → mã vận đơn → bảng COD/KL.
 */
export function printShipmentA6Label(opts: {
  shipment: Shipment;
  shopName: string;
  providerLabel: string;
  formatWeight: (g: number | null | undefined) => string;
  formatMoney: (v: number | null | undefined) => string;
}): { ok: boolean; reason?: string } {
  const { shipment: s, shopName, providerLabel, formatWeight, formatMoney } = opts;
  const esc = (v: unknown) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cod = Number(s.cod_amount ?? 0);
  // Phần đầu trước dấu "·" của to_address là tên người nhận (form tạo ghép "tên · SĐT · địa chỉ")
  const toName = s.to_address ? s.to_address.split('·')[0].trim() || '—' : '—';
  const dims = [s.length_cm, s.width_cm, s.height_cm].filter(Boolean).join('×');

  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>Vận đơn ${esc(s.tracking_code)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 100mm 150mm; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; width: 100mm; padding: 6mm; }
  .sender { font-size: 11px; border-bottom: 1px solid #000; padding-bottom: 4px; }
  .receiver { padding: 8px 0; border-bottom: 2px solid #000; }
  .receiver .label { font-size: 10px; font-weight: bold; letter-spacing: 1px; }
  .receiver .name { font-size: 16px; font-weight: bold; margin-top: 2px; }
  .receiver .addr { font-size: 13px; margin-top: 3px; }
  .code { text-align: center; padding: 10px 0 4px; }
  .code .tracking { font-family: 'Courier New', monospace; font-size: 22px; font-weight: bold; letter-spacing: 2px; }
  .code .provider { font-size: 11px; margin-top: 2px; }
  .meta { width: 100%; border-collapse: collapse; font-size: 12px; }
  .meta td { border: 1px solid #000; padding: 4px 6px; }
  .cod { font-size: 14px; font-weight: bold; }
  @media print { body { width: 100%; } }
</style></head>
<body>
  <div class="sender"><b>${esc(shopName)}</b>${s.from_address ? ' — ' + esc(s.from_address) : ''}</div>
  <div class="receiver">
    <div class="label">NGƯỜI NHẬN</div>
    <div class="name">${esc(toName)}</div>
    <div class="addr">${esc(s.to_address ?? '')}</div>
  </div>
  <div class="code">
    <div class="tracking">${esc(s.tracking_code)}</div>
    <div class="provider">${esc(providerLabel)}${s.partner_name ? ' · ' + esc(s.partner_name) : ''}</div>
  </div>
  <table class="meta">
    <tr>
      <td>COD: <span class="cod">${cod > 0 ? esc(formatMoney(cod)) : 'Không'}</span></td>
      <td>KL: ${esc(formatWeight(s.weight_g))}${dims ? ' · ' + esc(dims) + 'cm' : ''}</td>
    </tr>
    <tr><td colspan="2">Đơn hàng: ${esc(s.order_code ?? '—')}</td></tr>
    ${s.note ? `<tr><td colspan="2">Ghi chú: ${esc(s.note)}</td></tr>` : ''}
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return { ok: false, reason: 'Trình chặn popup đang bật. Hãy cho phép popup để in.' };
  w.document.write(html);
  w.document.close();
  return { ok: true };
}
