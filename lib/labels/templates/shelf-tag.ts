import { generateBarcodeDataUrl } from '../barcode-generator';
import type { LabelData } from '../types';

interface ShelfTagOptions {
  widthMm?: number;
  heightMm?: number;
  paddingMm?: number;
  borderStyle?: string;
}

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

async function getBarcodeMarkup(data: LabelData): Promise<string> {
  if (!data.barcode) {
    return '<div style="height:12mm;"></div>';
  }

  const format = data.barcodeFormat ?? 'code128';
  const isQrCode = format === 'qrcode';
  const barcodeDataUrl = await generateBarcodeDataUrl({
    value: data.barcode,
    format,
    width: isQrCode ? 20 : 40,
    height: isQrCode ? 20 : 12,
    includeText: false,
  });

  const imageStyle = isQrCode
    ? 'display:block;width:20mm;height:20mm;object-fit:contain;'
    : 'display:block;width:40mm;height:12mm;object-fit:contain;';

  return `<img src="${barcodeDataUrl}" alt="Barcode for ${escapeHtml(data.productName)}" style="${imageStyle}" />`;
}

export async function renderShelfTagFragment(
  data: LabelData,
  options: ShelfTagOptions = {},
): Promise<string> {
  const widthMm = options.widthMm ?? 50;
  const heightMm = options.heightMm ?? 30;
  const paddingMm = options.paddingMm ?? 2;
  const borderStyle = options.borderStyle ?? '0.3mm dashed #9ca3af';
  const barcodeMarkup = await getBarcodeMarkup(data);
  const unit = formatUnit(data.unit);

  return `<article data-template="shelf-tag" style="box-sizing:border-box;width:${widthMm}mm;height:${heightMm}mm;padding:${paddingMm}mm;border:${borderStyle};border-radius:1mm;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;break-inside:avoid;page-break-inside:avoid;">
  <div style="font-size:10pt;font-weight:700;line-height:1.2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-overflow:ellipsis;min-height:calc(10pt * 1.2 * 2);max-height:calc(10pt * 1.2 * 2);word-break:break-word;">
    ${escapeHtml(data.productName)}
  </div>
  <div style="display:flex;align-items:center;justify-content:center;min-height:12mm;margin:1mm 0 0.5mm;">
    ${barcodeMarkup}
  </div>
  <div style="display:flex;align-items:flex-end;justify-content:flex-start;gap:1.5mm;">
    <span style="font-size:12pt;font-weight:700;line-height:1;">${escapeHtml(data.price)}</span>
    ${unit ? `<span style="font-size:8pt;font-weight:400;line-height:1.1;">${escapeHtml(unit)}</span>` : ''}
  </div>
</article>`;
}

/**
 * Generate HTML for a single shelf tag label (50mm × 30mm).
 * Designed for browser printing on adhesive label sheets or cut paper.
 */
export async function renderShelfTag(data: LabelData): Promise<string> {
  const fragment = await renderShelfTagFragment(data);

  return `<section data-template-wrapper="shelf-tag">
  <style>
    @media print {
      @page { size: 50mm 30mm; margin: 0; }
      [data-template-wrapper="shelf-tag"] article { width: 50mm !important; height: 30mm !important; }
    }
  </style>
  ${fragment}
</section>`;
}
