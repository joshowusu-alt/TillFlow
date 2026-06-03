/**
 * Stock import template — canonical columns and Ghana-friendly examples.
 */

import { TEMPLATE_HEADERS } from '@/lib/import/import-columns';

export { TEMPLATE_HEADERS };
export type TemplateColumn = (typeof TEMPLATE_HEADERS)[number];

/**
 * Example rows: piece, strip (medicine), bottle, carton, and weighed (kg).
 */
const EXAMPLE_ROWS: string[][] = [
  // Piece — simple stationery
  ['Awake Water 500ml', 'BEV-001', '6001001001001', 'Drinks', '3.00', '2.20', '48', 'Piece', '', '', '', 'Aqua Pure Ltd', '12', 'yes', '', '', 'paid'],
  // Strip — pharmacy
  ['Paracetamol 500mg', 'MED-010', '6002002002002', 'Medicines & health', '8.00', '5.50', '20', 'Strip', '', '', '', 'Pharma Wholesalers', '5', 'no', '', '10 tablets per strip', 'unpaid'],
  // Bottle
  ['Dettol Antiseptic 500ml', 'HLTH-003', '6003003003003', 'Wellness', '28.00', '22.00', '24', 'Bottle', '', '', '', 'Unilever GH', '6', 'yes', '', '', 'paid'],
  // Carton — qty counted in cartons (qty_in = Carton)
  ['Gino Tomato Paste 70g', 'GRO-020', '6004004004004', 'Cooking essentials', '5.50', '4.20', '10', 'Tin', 'Carton', '48', 'Carton', 'Gino Foods', '2', 'yes', '', 'Cost is per Tin; 10 cartons on hand', 'unpaid'],
  // Piece with pack option shown (qty in pieces)
  ['Milo 400g', 'DRK-015', '6005005005005', 'Drinks', '18.00', '14.50', '36', 'Tin', 'Carton', '12', '', 'Nestlé GH', '8', 'yes', '', '', 'paid'],
  // Weighed — kg base unit
  ["Mama's Best Rice 5kg", 'RICE-01', '', 'Rice & staples', '65.00', '58.00', '25', 'kg', '', '', '', 'Local mill', '5', 'no', '', 'Sold by kg; opening stock in kg', 'unpaid'],
  // Sachet / piece grocery
  ['Indomie Onion Chicken', 'NOOD-007', '6006006006006', 'Pasta & noodles', '3.50', '2.80', '120', 'Piece', 'Carton', '40', '', 'Indofood', '24', 'yes', '', '', 'paid'],
  // Baby — piece count
  ['Baby Diapers Size 3 (8s)', 'BABY-02', '6007007007007', 'Diapers & wipes', '45.00', '38.00', '15', 'Pack', '', '', '', 'Pampers distributor', '4', 'yes', '', '', 'unpaid'],
];

const UNIT_GUIDE_LINES = [
  '# TillFlow product import guide (delete these lines before upload)',
  '#',
  '# Unit types (base_unit): smallest unit you SELL — Piece, Bottle, Tin, Strip, Pack, kg',
  '# pack_unit + pack_size: optional larger box (e.g. Carton with 48 Tins per carton)',
  '# quantity + qty_in: how much stock you have NOW',
  '#   - Leave qty_in blank → quantity is in base units (pieces, tins, kg)',
  '#   - Set qty_in to Carton → quantity is number of cartons (system converts)',
  '# opening stock = sellable units on your shelf today (not cartons unless qty_in says Carton)',
  '#',
];

function buildCsv(rows: string[][]): string {
  const escape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

/**
 * Triggers a browser download of the stock import CSV template.
 */
export function downloadTemplate() {
  const guideRows = UNIT_GUIDE_LINES.map((line) => [line]);
  const csv = buildCsv([...guideRows, [...TEMPLATE_HEADERS], ...EXAMPLE_ROWS]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tillflow-product-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export const UNIT_HELPER_COPY = {
  piece: 'Piece: one single item sold to a customer (e.g. one sachet, one pen).',
  pack: 'Pack: a grouped item sold as one pack (e.g. pack of 6 diapers).',
  carton: 'Carton: a larger box — set pack_unit to Carton and pack_size to pieces per carton.',
  strip: 'Strip: common for medicines (tablets in a strip).',
  bottle: 'Bottle: liquids sold per bottle.',
  tin: 'Tin / tin: canned goods counted per tin.',
  sachet: 'Sachet: small single-serve packs.',
  kg: 'kg: weighed goods — cost and selling price are per kilogram.',
  openingStock:
    'Opening stock: how many sellable units you have right now (pieces, tins, or kg — match qty_in).',
} as const;
