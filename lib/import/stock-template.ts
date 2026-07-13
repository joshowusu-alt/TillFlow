/**
 * Mode-specific stock import templates — Ghana-friendly examples.
 */

import {
  type ImportMode,
  templateHeadersForMode,
  CATALOGUE_TEMPLATE_HEADERS,
  OPENING_STOCK_TEMPLATE_HEADERS,
  PURCHASE_TEMPLATE_HEADERS,
} from '@/lib/import/import-mode';

export { TEMPLATE_HEADERS } from '@/lib/import/import-columns';
export type { TemplateColumn } from '@/lib/import/import-columns';

const CATALOGUE_EXAMPLES: string[][] = [
  ['Awake Water 500ml', 'BEV-001', '6001001001001', 'Drinks', '3.00', '2.20', 'Piece', '', '', 'Aqua Pure Ltd', '12', 'yes', '', ''],
  ['Paracetamol 500mg', 'MED-010', '6002002002002', 'Medicines & health', '8.00', '5.50', 'Strip', '', '', 'Pharma Wholesalers', '5', 'no', '', '10 tablets per strip'],
  ['Milo 400g', 'DRK-015', '6005005005005', 'Drinks', '18.00', '14.50', 'Tin', 'Carton', '12', 'Nestlé GH', '8', 'yes', '', ''],
];

const OPENING_EXAMPLES: string[][] = [
  ['Awake Water 500ml', 'BEV-001', '6001001001001', 'Drinks', '3.00', '2.20', '48', 'Piece', '', '', '', 'Aqua Pure Ltd', '12', 'Already on shelf at cut-over'],
  ['Paracetamol 500mg', 'MED-010', '6002002002002', 'Medicines & health', '8.00', '', '20', 'Strip', '', '', '', 'Pharma Wholesalers', '5', 'Qty known; cost to confirm later'],
  ['Gino Tomato Paste 70g', 'GRO-020', '6004004004004', 'Cooking essentials', '5.50', '4.20', '10', 'Tin', 'Carton', '48', 'Carton', 'Gino Foods', '2', '10 cartons on hand'],
];

const PURCHASE_EXAMPLES: string[][] = [
  ['Awake Water 500ml', 'BEV-001', '6001001001001', 'Drinks', '3.00', '2.20', '48', 'Piece', '', '', '', 'Aqua Pure Ltd', '12', '', 'paid'],
  ['Paracetamol 500mg', 'MED-010', '6002002002002', 'Medicines & health', '8.00', '5.50', '20', 'Strip', '', '', '', 'Pharma Wholesalers', '5', '', 'unpaid'],
  ['Milo 400g', 'DRK-015', '6005005005005', 'Drinks', '18.00', '14.50', '36', 'Tin', 'Carton', '12', '', 'Nestlé GH', '8', '', 'paid'],
];

function guideLines(mode: ImportMode): string[] {
  const common = [
    `# TillFlow ${mode.toLowerCase().replace('_', ' ')} import guide (delete these lines before upload)`,
    '#',
    '# Unit types (base_unit): smallest unit you SELL — Piece, Bottle, Tin, Strip, Pack, kg',
    '# pack_unit + pack_size: optional larger box (e.g. Carton with 48 Tins per carton)',
  ];
  if (mode === 'CATALOGUE') {
    return [
      ...common,
      '# This template has NO quantity and NO payment_status — products only.',
      '#',
    ];
  }
  if (mode === 'OPENING_STOCK') {
    return [
      ...common,
      '# quantity + qty_in: stock you already had on the TillFlow start date',
      '# Leave cost_price blank when cost is unknown — quantity is recorded, value stays incomplete',
      '# Do NOT use payment_status here — opening stock does not reduce cash',
      '#',
    ];
  }
  return [
    ...common,
    '# quantity: stock you are buying now (genuine purchase)',
    '# payment_status: paid or unpaid (required for purchases)',
    '# unpaid rows need supplier_name — creates supplier debt',
    '#',
  ];
}

function buildCsv(rows: string[][]): string {
  const escape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

function examplesForMode(mode: ImportMode): string[][] {
  switch (mode) {
    case 'CATALOGUE':
      return CATALOGUE_EXAMPLES;
    case 'OPENING_STOCK':
      return OPENING_EXAMPLES;
    case 'PURCHASES':
      return PURCHASE_EXAMPLES;
  }
}

function fileNameForMode(mode: ImportMode): string {
  switch (mode) {
    case 'CATALOGUE':
      return 'tillflow-catalogue-import-template.csv';
    case 'OPENING_STOCK':
      return 'tillflow-opening-stock-import-template.csv';
    case 'PURCHASES':
      return 'tillflow-purchase-import-template.csv';
  }
}

/** Download the template for the selected import mode. */
export function downloadTemplateForMode(mode: ImportMode) {
  const headers = [...templateHeadersForMode(mode)];
  const guideRows = guideLines(mode).map((line) => [line]);
  const csv = buildCsv([...guideRows, headers, ...examplesForMode(mode)]);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameForMode(mode);
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated Prefer downloadTemplateForMode — kept for older call sites. */
export function downloadTemplate() {
  downloadTemplateForMode('OPENING_STOCK');
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
    'Opening stock: how many sellable units you had on your TillFlow start date (pieces, tins, or kg — match qty_in).',
} as const;

export {
  CATALOGUE_TEMPLATE_HEADERS,
  OPENING_STOCK_TEMPLATE_HEADERS,
  PURCHASE_TEMPLATE_HEADERS,
};
