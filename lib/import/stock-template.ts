/**
 * Mode-specific stock import templates — Ghana-friendly examples.
 */

import * as XLSX from 'xlsx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  importModeLabel,
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

export type TemplateFormat = 'xlsx' | 'csv';

const COLUMN_HELP: Record<string, string> = {
  name: 'Required. Product name as you want it shown in TillFlow.',
  sku: 'Optional product code. Keep as text, including any leading zeros.',
  barcode: 'Optional. Enter the full barcode as text. Excel cells are already formatted as Text.',
  category: 'Optional. Leave blank if you do not classify products. New names are created automatically.',
  division: 'Optional. If used, include category on the same row.',
  group: 'Optional. If used, include category and division on the same row.',
  selling_price: 'Required. Selling price of ONE base unit, as a number without a currency symbol.',
  cost_price: 'Cost of ONE base unit. For opening stock, leave blank if unknown; do not enter zero unless the cost is truly zero.',
  quantity: 'Number of units to record. Count in base_unit unless qty_in names the pack_unit.',
  base_unit: 'Required. Smallest unit you sell: Piece, Bottle, Tin, Strip, Pack or kg.',
  pack_unit: 'Optional larger unit, such as Carton. Supply pack_size too.',
  pack_size: 'Number of base units in ONE pack. Example: 48 Tins in a Carton means 48.',
  qty_in: 'Blank means base_unit. To count cartons, enter your pack_unit name; quantity then counts cartons.',
  supplier_name: 'Supplier name. Required for unpaid purchases. Opening-stock supplier credit is confirmed in the app.',
  reorder_point: 'Optional low-stock threshold, counted in base units.',
  production_date: 'Optional. Date the goods were produced, as YYYY-MM-DD or DD/MM/YYYY. Leave blank if unknown.',
  expiry_date: 'Optional. Date the goods expire, as YYYY-MM-DD or DD/MM/YYYY. Must be on or after the production date when both are filled.',
  storefront_published: 'Optional: yes or no. Blank keeps the existing setting when updating a product.',
  image_url: 'Optional public product-image URL.',
  notes: 'Optional notes about this product or stock record.',
  payment_status: 'Optional for purchases: defaults to unpaid. Unpaid purchases create supplier debt.',
};
const NUMBER_COLUMNS = new Set(['selling_price', 'cost_price', 'quantity', 'pack_size', 'reorder_point']);

/** Empty CSV with a UTF-8 BOM so Excel reads names and punctuation correctly. */
export function buildTemplateCsv(mode: ImportMode): string {
  return '\uFEFF' + buildCsv([[...templateHeadersForMode(mode)]]) + '\r\n';
}

/** Reference rows stay on an ignored sheet, so downloading and uploading cannot import sample products. */
export function templateExamples(mode: ImportMode): (string | number)[][] {
  const headers = templateHeadersForMode(mode);
  const source = examplesForMode(mode);
  return [source[0], source[1], source[2], [...source[0]]].map((values, index) => {
    const row: Record<string, string> = {};
    headers.forEach((key, i) => { row[key] = values[i] ?? ''; });
    row.category = index === 0 ? '' : index === 3 ? 'Drinks' : row.category;
    row.division = index >= 2 ? (index === 2 ? 'Pantry' : 'Water') : '';
    row.group = index === 3 ? 'Bottled water' : '';
    if (index === 3) { row.name = 'Awake Water 1.5L'; row.sku = 'BEV-002'; row.barcode = '0012345678905'; }
    return headers.map(key => NUMBER_COLUMNS.has(key) && row[key] !== '' ? Number(row[key]) : row[key]);
  });
}

/** Native Excel styling and frozen headers; SheetJS owns all values and number formats. */
function styleWorkbook(bytes: Uint8Array, headers: string[]): Uint8Array {
  const files = unzipSync(bytes);
  let styles = strFromU8(files['xl/styles.xml']);
  const fontId = Number(styles.match(/<fonts count="(\d+)"/)![1]);
  const fillId = Number(styles.match(/<fills count="(\d+)"/)![1]);
  const styleId = Number(styles.match(/<cellXfs count="(\d+)"/)![1]);
  styles = styles.replace(/<fonts count="\d+"/, '<fonts count="' + (fontId + 1) + '"').replace('</fonts>', '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>');
  const colors = ['142B50', '245BD6', '35705A'];
  styles = styles.replace(/<fills count="\d+"/, '<fills count="' + (fillId + colors.length) + '"').replace('</fills>', colors.map(color => '<fill><patternFill patternType="solid"><fgColor rgb="FF' + color + '"/><bgColor indexed="64"/></patternFill></fill>').join('') + '</fills>');
  styles = styles.replace(/<cellXfs count="\d+"/, '<cellXfs count="' + (styleId + colors.length + 1) + '"').replace('</cellXfs>', colors.map((_, i) => '<xf numFmtId="0" fontId="' + fontId + '" fillId="' + (fillId + i) + '" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>').join('') + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>');
  files['xl/styles.xml'] = strToU8(styles);
  for (const sheet of [1, 2, 3]) {
    const file = 'xl/worksheets/sheet' + sheet + '.xml';
    let xml = strFromU8(files[file]);
    if (sheet === 1) xml = xml.replace(/<col\b([^>]*)\/>/g, (tag, attrs: string) => {
      const column = Number(attrs.match(/min="(\d+)"/)?.[1]);
      const address = XLSX.utils.encode_col(column - 1) + '2';
      const cellStyle = xml.match(new RegExp('<c[^>]*r="' + address + '"[^>]*s="(\\d+)"'))?.[1];
      return cellStyle ? '<col' + attrs + ' style="' + cellStyle + '"/>' : tag;
    });
    if (sheet !== 2) xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B2" sqref="B2"/></sheetView></sheetViews>');
    if (sheet === 2) xml = xml.replace(/<c\b([^>]*)>/g, (_, attrs: string) => '<c' + attrs.replace(/\s+s="\d+"/, '') + ' s="' + (styleId + 3) + '">');
    xml = xml.replace(/<c\b([^>]*\br="([A-Z]+)1"[^>]*)>/g, (_, attrs: string, column: string) => {
      const key = headers[XLSX.utils.decode_col(column)];
      const headerStyle = sheet === 2 ? styleId : ['category', 'division', 'group'].includes(key) ? styleId + 2 : ['name', 'selling_price', 'base_unit', 'quantity', 'payment_status'].includes(key) ? styleId + 1 : styleId;
      return '<c' + attrs.replace(/\s+s="\d+"/, '') + ' s="' + headerStyle + '">';
    });
    files[file] = strToU8(xml);
  }
  return zipSync(files, { level: 6 });
}

export function buildExcelTemplate(mode: ImportMode): Uint8Array {
  const headers = [...templateHeadersForMode(mode)];
  const workbook = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([headers]);
  const examples = XLSX.utils.aoa_to_sheet([headers, ...templateExamples(mode)]);
  for (const sheet of [data, examples]) {
    sheet['!cols'] = headers.map(key => ({ wch: key === 'name' ? 30 : key === 'notes' || key === 'image_url' ? 38 : key === 'barcode' ? 22 : key === 'supplier_name' ? 26 : Math.max(16, key.length + 3) }));
    sheet['!rows'] = [{ hpt: 32 }];
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet === data ? 500 : 4, c: headers.length - 1 } }) };
    headers.forEach((key, c) => {
      for (let r = 1; r <= (sheet === data ? 500 : 4); r++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[address] ?? { t: 's', v: '' };
        cell.z = NUMBER_COLUMNS.has(key) ? key.endsWith('_price') ? '0.00' : '0' : '@';
        sheet[address] = cell;
      }
    });
    if (sheet === data) sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 500, c: headers.length - 1 } });
  }
  const instructions = XLSX.utils.aoa_to_sheet([
    ['TillFlow | ' + importModeLabel(mode), 'How to prepare your import'],
    ['1. Fill the Import sheet', 'Start on row 2. Keep column names in row 1. Examples are reference only and are never imported.'],
    ['2. Use the fields you need', 'Classification is optional. Leave category, division and group blank or remove those columns. Deeper levels need parent names in the same row.'],
    ['3. Preserve product codes', 'SKU and barcode cells use Text format to retain leading zeros and full digits. Prefer Excel over CSV when editing codes.'],
    ['4. Review before importing', 'Save as .xlsx, upload using the matching purpose, and check quantities, units and duplicates in TillFlow before confirming.'],
    ['Purpose', mode === 'CATALOGUE' ? 'Products only. No stock quantities or payment entries.' : mode === 'OPENING_STOCK' ? 'Stock already held when starting TillFlow. No cash payment. Unknown cost may stay blank.' : 'New purchases. Choose paid or unpaid on every row. Unpaid rows need a supplier.'],
    ['Prices and packs', 'Prices are always per ONE base unit. Carton of 48 Tins: base_unit=Tin, pack_unit=Carton, pack_size=48. quantity=10 and qty_in=Carton records 480 Tins.'],
    ['CSV alternative', 'CSV cannot store widths, styles or text formats. In Excel use Data > From Text/CSV and set barcode and SKU to Text before loading.'],
    ['Column', 'What to enter'],
    ...headers.map(key => [key, COLUMN_HELP[key]]),
  ]);
  instructions['!cols'] = [{ wch: 28 }, { wch: 105 }];
  instructions['!rows'] = Array.from({ length: headers.length + 9 }, (_, i) => ({ hpt: i === 0 ? 32 : 44 }));
  XLSX.utils.book_append_sheet(workbook, data, 'Import');
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, examples, 'Examples');
  return styleWorkbook(new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true })), headers);
}

/** Excel is recommended; CSV remains available for other systems. */
export function downloadTemplateForMode(mode: ImportMode, format: TemplateFormat = 'xlsx') {
  const contents = format === 'xlsx' ? buildExcelTemplate(mode) : buildTemplateCsv(mode);
  const blob = new Blob([contents as BlobPart], { type: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tillflow-' + (mode === 'PURCHASES' ? 'purchase' : mode.toLowerCase().replace('_', '-')) + '-import-template.' + format;
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
