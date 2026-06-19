import { describe, expect, it } from 'vitest';
import {
  buildBrandedCsv,
  buildBrandedPdf,
  fmtDateTime,
  respondWithExport,
  type ExportOptions,
} from '@/lib/exports/branded-export';

const exportOptions: ExportOptions = {
  businessName: 'Accra Market Hub',
  reportTitle: 'Sales Report — Product Detail',
  dateRange: {
    from: new Date('2026-03-01T00:00:00.000Z'),
    to: new Date('2026-03-31T23:59:59.999Z'),
  },
  currency: 'GHS',
  columns: [
    { header: 'Product', key: 'product' },
    { header: 'Total', key: 'total' },
  ],
  rows: [
    { product: 'Milo 400g', total: '55.00' },
  ],
};

describe('branded export helpers', () => {
  it('wraps CSV bodies with TillFlow branding metadata', () => {
    const csv = buildBrandedCsv(exportOptions, 'Product,Total\nMilo 400g,55.00');

    expect(csv).toContain('Accra Market Hub');
    expect(csv).toContain('Sales Report — Product Detail');
    expect(csv).toContain('Currency: GHS');
    expect(csv).toContain('Product,Total');
    expect(csv).toContain('Powered by TillFlow');
  });

  it('renders a richer print-ready PDF view', () => {
    const html = buildBrandedPdf(exportOptions);

    expect(html).toContain('class="tillflow-export-logo"');
    expect(html).toContain('src="/brand/tillflow-logo-white.png"');
    expect(html).toContain('alt="TillFlow"');
    expect(html).toContain('<div class="eyebrow">Export</div>');
    expect(html).toContain('Rows exported');
    expect(html).toContain('Print-ready PDF view');
    expect(html).toContain('Powered by <strong>TillFlow</strong>');
  });

  it('uses custom summaryCards when provided', () => {
    const html = buildBrandedPdf({
      ...exportOptions,
      summaryCards: [
        { label: 'Expected Cash', value: 'GH₵865.50' },
        { label: 'Counted Cash', value: 'GH₵800.00' },
        { label: 'Variance', value: '-GH₵65.50' },
        { label: 'Shifts exported', value: '3' },
      ],
    });

    expect(html).toContain('Expected Cash');
    expect(html).toContain('GH₵865.50');
    expect(html).toContain('Shifts exported');
    expect(html).not.toContain('Print-ready PDF view');
  });

  it('renders sections when provided', () => {
    const html = buildBrandedPdf({
      ...exportOptions,
      sections: [
        {
          title: 'Cash movement breakdown',
          rows: [
            { label: 'Opening float', value: 'GH₵0.00' },
            { label: 'Cash sales', value: 'GH₵865.50' },
            { label: 'Supplier payments', value: '-GH₵6,769.00' },
          ],
          note: 'Open shifts have not been counted yet, so variance is shown as pending.',
        },
      ],
    });

    expect(html).toContain('Cash movement breakdown');
    expect(html).toContain('Opening float');
    expect(html).toContain('GH₵865.50');
    expect(html).toContain('Supplier payments');
    expect(html).toContain('Open shifts have not been counted yet');
  });

  it('renders no sections block when sections array is empty', () => {
    const html = buildBrandedPdf({ ...exportOptions, sections: [] });
    expect(html).not.toContain('<div class="sections-outer">');
  });

  it('fmtDateTime formats a Date as owner-friendly string', () => {
    const d = new Date('2026-06-17T07:44:00.000Z');
    const result = fmtDateTime(d);
    expect(result).toContain('17');
    expect(result).toContain('Jun');
    expect(result).toContain('2026');
    expect(result).toContain('07:44');
  });

  it('returns branded CSV responses with utf-8 content', async () => {
    const response = respondWithExport({
      format: 'csv',
      csv: 'Product,Total\nMilo 400g,55.00',
      filename: 'sales',
      exportOptions,
    });

    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toContain('sales.csv');

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const body = new TextDecoder('utf-8').decode(bytes);
    expect(body).toContain('Accra Market Hub');
    expect(body).toContain('Powered by TillFlow');
  });
});
