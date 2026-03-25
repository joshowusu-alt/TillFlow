import { describe, expect, it } from 'vitest';
import { buildBrandedCsv, buildBrandedPdf, respondWithExport, type ExportOptions } from '@/lib/exports/branded-export';

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

    expect(html).toContain('TillFlow export');
    expect(html).toContain('Rows exported');
    expect(html).toContain('Print-ready PDF view');
    expect(html).toContain('Powered by <strong>TillFlow</strong>');
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
