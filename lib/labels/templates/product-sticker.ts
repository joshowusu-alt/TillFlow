import { generateBarcodeDataUrl } from '../barcode-generator';
import type { LabelData } from '../types';

function escapeHtml(value: string | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUnit(unit: string | undefined): string {
  if (!unit) {
    return '';
  }

  return unit.startsWith('/') ? unit : `/${unit}`;
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  return value;
}

async function getBarcodeMarkup(data: LabelData): Promise<string> {
  if (!data.barcode) {
    return '<div style="height:14mm;"></div>';
  }

  const format = data.barcodeFormat ?? 'code128';
  const isQrCode = format === 'qrcode';
  const barcodeDataUrl = await generateBarcodeDataUrl({
    value: data.barcode,
    format,
    width: isQrCode ? 22 : 46,
    height: isQrCode ? 22 : 14,
    includeText: false,
  });

  const imageStyle = isQrCode
    ? 'display:block;width:22mm;height:22mm;object-fit:contain;'
    : 'display:block;width:46mm;height:14mm;object-fit:contain;';

  return `<img src="${barcodeDataUrl}" alt="Barcode for ${escapeHtml(data.productName)}" style="${imageStyle}" />`;
}

export async function renderProductStickerFragment(data: LabelData): Promise<string> {
  const category = data.category?.trim();
  const sku = data.sku?.trim();
  const unit = formatUnit(data.unit);
  const barcodeMarkup = await getBarcodeMarkup(data);

  return `<article data-template="product-sticker" style="box-sizing:border-box;width:60mm;height:40mm;padding:2.5mm;border:0.3mm dashed #9ca3af;border-radius:1mm;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;break-inside:avoid;page-break-inside:avoid;">
  <div style="display:flex;justify-content:flex-start;min-height:5mm;">
    ${category ? `<span style="display:inline-flex;align-items:center;max-width:100%;padding:0.6mm 1.8mm;border-radius:999px;background:#e0f2fe;color:#075985;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(category)}</span>` : '<span></span>'}
  </div>
  <div style="font-size:11pt;font-weight:700;line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-overflow:ellipsis;min-height:calc(11pt * 1.2 * 2);max-height:calc(11pt * 1.2 * 2);word-break:break-word;">
    ${escapeHtml(data.productName)}
  </div>
  <div style="display:flex;align-items:center;justify-content:center;min-height:14mm;margin:1mm 0 0.5mm;">
    ${barcodeMarkup}
  </div>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:2mm;">
    <div style="display:flex;align-items:flex-end;gap:1.5mm;min-width:0;">
      <span style="font-size:12pt;font-weight:700;line-height:1;">${escapeHtml(data.price)}</span>
      ${unit ? `<span style="font-size:8pt;font-weight:400;line-height:1.1;">${escapeHtml(unit)}</span>` : ''}
    </div>
  </div>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:2mm;font-size:7.5pt;color:#4b5563;line-height:1.2;">
    <span>${escapeHtml(formatDate(data.date))}</span>
    <span>${sku ? `SKU: ${escapeHtml(sku)}` : '&nbsp;'}</span>
  </div>
</article>`;
}

/**
 * Generate HTML for a product sticker (60mm × 40mm).
 * More detail than shelf tag — includes category and date.
 */
export async function renderProductSticker(data: LabelData): Promise<string> {
  const fragment = await renderProductStickerFragment(data);

  return `<section data-template-wrapper="product-sticker">
  <style>
    @media print {
      @page { size: 60mm 40mm; margin: 0; }
      [data-template-wrapper="product-sticker"] article { width: 60mm !important; height: 40mm !important; }
    }
  </style>
  ${fragment}
</section>`;
}
