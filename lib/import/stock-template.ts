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

/**
 * Three illustrative example rows included in the downloaded template.
 *
 * Row 1 – Simple single-unit product: leave qty_in blank (defaults to base unit).
 * Row 2 – Dual-unit product, quantity entered in base units (Tins): leave qty_in blank.
 * Row 3 – Same dual-unit product, quantity entered in Cartons: set qty_in=Carton.
 *         system converts 5 Cartons × 12 = 60 Tins automatically.
 */
const EXAMPLE_ROWS = [
  // Simple single-unit product (Piece), paid — qty_in left blank → defaults to Piece
  ['Biro Pen', '', '', 'Stationery', '2.50', '1.80', '200', 'Piece', '', '', '', 'paid'],
  // Dual-unit product: quantity is 60 Tins — leave qty_in blank → system counts in Tins
  ['Milo 500g', '', '6001234567', 'Drinks', '12.00', '9.50', '60', 'Tin', 'Carton', '12', '', 'unpaid'],
  // Alternative: same product but enter qty as 5 Cartons — set qty_in=Carton; 5×12=60 Tins
  ['Tin Tomatoes 400g', '', '', 'Canned Goods', '5.50', '3.80', '5', 'Tin', 'Carton', '24', 'Carton', 'unpaid'],
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
