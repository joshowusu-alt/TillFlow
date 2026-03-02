/**
 * Stock import template — defines the canonical column layout and provides
 * a client-side CSV download helper.
 */

export const TEMPLATE_HEADERS = [
  'name',
  'sku',
  'barcode',
  'category',
  'selling_price',
  'cost_price',
  'quantity',
  'base_unit',
  'pack_unit',
  'pack_size',
  'qty_in',
  'payment_status',
] as const;

export type TemplateColumn = (typeof TEMPLATE_HEADERS)[number];

/** Two illustrative example rows included in the downloaded template. */
const EXAMPLE_ROWS = [
  // Dual-unit product (Tin / Carton ×12), unpaid
  ['Milo 500g', '', '6001234567', 'Drinks', '12.00', '9.50', '5', 'Tin', 'Carton', '12', 'Carton', 'unpaid'],
  // Single-unit product (Piece), paid
  ['Biro Pen', '', '', 'Stationery', '2.50', '1.80', '200', 'Piece', '', '', 'Piece', 'paid'],
];

function buildCsv(rows: string[][]): string {
  const escape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((row) => row.map(escape).join(','));
  return lines.join('\r\n');
}

/**
 * Triggers a browser download of the stock import CSV template.
 * Safe to call only in a browser context (uses `document`).
 */
export function downloadTemplate() {
  const csv = buildCsv([[...TEMPLATE_HEADERS], ...EXAMPLE_ROWS]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tillflow-stock-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
