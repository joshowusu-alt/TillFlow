/**
 * Client-side file parser for stock import (.csv / .xlsx).
 */

import * as XLSX from 'xlsx';
import { importClassificationErrors, matchImportProduct, type ImportMatchProduct } from '@/lib/import/import-reliability';
import { normaliseHeaderKey } from '@/lib/import/import-columns';
import { type ImportMode, spreadsheetHasPaymentStatusColumn } from '@/lib/import/import-mode';
import {
  validateImportRow,
  type DuplicateAction,
  type DuplicateKind,
} from '@/lib/import/import-validation';

export type PaymentStatus = 'PAID' | 'UNPAID';

export type ParsedImportRow = {
  _id: string;
  rowNumber: number;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  division?: string;
  group?: string;
  suggestedCategory: string;
  sellingPricePence: number;
  costPricePence: number;
  costPriceProvided?: boolean;
  storefrontPublishedProvided?: boolean;
  reorderPointProvided?: boolean;
  quantity: number;
  baseUnitName: string;
  packUnitName: string;
  packSize: number;
  qtyInName: string;
  supplierName: string;
  reorderPoint: number;
  storefrontPublished: boolean;
  imageUrl: string;
  notes: string;
  paymentStatus: PaymentStatus;
  paymentStatusRaw?: string;
  duplicateKind: DuplicateKind;
  duplicateAction: DuplicateAction;
  confirmBelowCost: boolean;
  errors: string[];
  warnings: string[];
};

let _counter = 0;
const hierarchyErrors = importClassificationErrors;
function uniqueId() {
  return `row-${++_counter}-${Math.random().toString(36).slice(2, 6)}`;
}

function parseNumber(raw: string, integer = false): number {
  const value = raw.trim();
  if (!value) return 0;
  const pattern = integer ? /^(?:\d+|\d{1,3}(?:,\d{3})+)$/ : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
  if (!pattern.test(value)) return -1;
  const number = Number(value.replace(/,/g, ''));
  return Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER ? number : -1;
}

function parsePence(raw: string): number {
  const number = parseNumber(raw);
  return number < 0 || !Number.isSafeInteger(Math.round(number * 100)) ? -1 : Math.round(number * 100);
}

function parseQuantity(raw: string): number {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned || ['-', 'n/a', 'na', 'nil', 'none', 'oos', 'out'].includes(cleaned)) return 0;
  return parseNumber(cleaned);
}

function normalisePaymentStatus(raw: string): PaymentStatus {
  const v = raw.trim().toLowerCase();
  if (v === 'paid' || v === 'yes') return 'PAID';
  return 'UNPAID';
}

function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'yes' || v === 'true' || v === '1' || v === 'y';
}

function csvMatrix(text: string): { matrix: string[][]; rowNumbers: number[] } {
  const matrix: string[][] = [], rowNumbers: number[] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  let line = 1, recordLine = 1;
  const pushRow = () => { row.push(field); matrix.push(row); rowNumbers.push(recordLine); row = []; field = ''; closed = false; };
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else { field += ch; if (ch === '\n') line++; }
    } else if (ch === ',' || ch === '\n') {
      if (ch === ',') { row.push(field); field = ''; closed = false; }
      else { pushRow(); line++; recordLine = line; }
    } else if (ch === '"' && field === '' && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error(`Invalid CSV quoting on row ${line}.`);
      field += ch;
    }
  }
  if (quoted) throw new Error(`Unclosed quoted cell on row ${recordLine}.`);
  if (field || row.length) pushRow();
  return { matrix, rowNumbers };
}

function buildRow(raw: Record<string, string>, rowNumber: number, seen: { names: Set<string>; barcodes: Set<string> }) {
  const g = (key: string) => (raw[key] ?? '').trim();

  const name = g('name');
  const sku = g('sku');
  const barcode = g('barcode');
  const category = g('category');
  const sellingPricePence = parsePence(g('selling_price'));
  const costPricePence = parsePence(g('cost_price'));
  const quantity = parseQuantity(g('quantity'));
  const baseUnitName = g('base_unit');
  const packUnitName = g('pack_unit');
  const packSizeRaw = parseNumber(g('pack_size'), true);
  const packSize = Number.isNaN(packSizeRaw) || packSizeRaw <= 1 ? 0 : packSizeRaw;
  const qtyInRaw = g('qty_in');
  const qtyInName = qtyInRaw || baseUnitName;
  const supplierName = g('supplier_name');
  const reorderRaw = parseNumber(g('reorder_point'), true);
  const reorderPoint = Number.isNaN(reorderRaw) || reorderRaw < 0 ? 0 : reorderRaw;
  const storefrontPublished = parseBool(g('storefront_published'));
  const imageUrl = g('image_url');
  const notes = g('notes');
  const paymentStatus = normalisePaymentStatus(g('payment_status'));

  const validation = validateImportRow(
    {
      rowNumber,
      name,
      sku,
      barcode,
      category,
      sellingPricePence,
      costPricePence,
      quantity: quantity < 0 ? -1 : quantity,
      baseUnitName,
      packUnitName,
      packSize,
      qtyInName,
      supplierName,
      reorderPoint,
      storefrontPublished,
      imageUrl,
      notes,
    },
    null,
    { seenNamesInFile: seen.names, seenBarcodesInFile: seen.barcodes }
  );

  return {
    _id: uniqueId(),
    costPriceProvided: g('cost_price') !== '',
    storefrontPublishedProvided: g('storefront_published') !== '',
    reorderPointProvided: g('reorder_point') !== '',
    rowNumber,
    name,
    sku,
    barcode,
    category,
    suggestedCategory: validation.suggestedCategory || category,
    division: g('division'),
    group: g('group'),
    sellingPricePence: sellingPricePence < 0 ? 0 : sellingPricePence,
    costPricePence: costPricePence < 0 ? 0 : costPricePence,
    quantity: quantity < 0 ? 0 : Math.max(0, quantity),
    baseUnitName,
    packUnitName,
    packSize,
    qtyInName,
    supplierName,
    reorderPoint,
    storefrontPublished,
    imageUrl,
    notes,
    paymentStatus,
    paymentStatusRaw: g('payment_status'),
    duplicateKind: validation.duplicateKind,
    duplicateAction: validation.defaultDuplicateAction,
    confirmBelowCost: false,
    errors: [...validation.errors,
      ...(packSizeRaw < 0 ? ['pack_size must be a whole number.'] : []),
      ...(reorderRaw < 0 ? ['reorder_point must be a non-negative whole number.'] : []),
      ...(g('storefront_published') && !['yes','true','1','y','no','false','0','n'].includes(g('storefront_published').toLowerCase()) ? ['storefront_published must be yes or no.'] : []),
      ...hierarchyErrors({ category, division:g('division'), group:g('group') })],
    warnings: validation.warnings,
  } satisfies ParsedImportRow;
}

function parseMatrix(matrix: string[][], rowNumbers = matrix.map((_, index) => index + 1)): { rows: ParsedImportRow[]; headers: string[] } {
  const records = matrix.map((row, index) => ({ row, rowNumber: rowNumbers[index] })).filter(({ row }) => row.some((cell) => String(cell ?? '').trim() !== ''));
  const dataRows = records.map(record => record.row);
  if (dataRows.length < 2) return { rows: [], headers: [] };

  let headerIdx = 0;
  while (headerIdx < dataRows.length) {
    const first = String(dataRows[headerIdx][0] ?? '').trim();
    if (!first.startsWith('#')) break;
    headerIdx++;
  }
  if (headerIdx >= dataRows.length - 1) return { rows: [], headers: [] };

  const headers = dataRows[headerIdx].map((h) => normaliseHeaderKey(String(h ?? '')));
  const nonemptyHeaders = headers.filter(Boolean);
  if (new Set(nonemptyHeaders).size !== nonemptyHeaders.length) throw new Error('Duplicate column names found. Keep only one column for each field.');
  for (const required of ['name', 'selling_price', 'base_unit']) {
    if (!headers.includes(required)) throw new Error(`Missing required column: ${required}.`);
  }
  const seen = { names: new Set<string>(), barcodes: new Set<string>() };

  const rows = dataRows.slice(headerIdx + 1).map((row, index) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = String(row[i] ?? '');
    });
    return buildRow(raw, records[headerIdx + index + 1].rowNumber, seen);
  });
  return { rows, headers };
}

async function parseCsv(file: File): Promise<{ rows: ParsedImportRow[]; headers: string[] }> {
  const text = await file.text();
  const { matrix, rowNumbers } = csvMatrix(text);
  return parseMatrix(matrix, rowNumbers);
}

async function parseXlsx(file: File): Promise<{ rows: ParsedImportRow[]; headers: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const dataSheets = workbook.SheetNames.filter(name => !['instructions', 'guide', 'examples'].includes(name.toLowerCase()));
  if (dataSheets.length > 1) throw new Error('This workbook has multiple data sheets. Upload a workbook with one data sheet.');
  const sheetName = dataSheets[0];
  if (!sheetName) return { rows: [], headers: [] };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  return parseMatrix(matrix as string[][]);
}

export type ParseStockFileResult = {
  rows: ParsedImportRow[];
  headers: string[];
  hasPaymentStatusColumn: boolean;
};

export async function parseStockFileDetailed(file: File, mode?: ImportMode): Promise<ParseStockFileResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  let parsed: { rows: ParsedImportRow[]; headers: string[] };
  if (ext === 'csv') parsed = await parseCsv(file);
  else if (ext === 'xlsx' || ext === 'xls') parsed = await parseXlsx(file);
  else throw new Error('Please upload a .csv or .xlsx file.');
  if (mode === 'PURCHASES') {
    for (const row of parsed.rows) {
      if (!['paid', 'unpaid', 'yes', 'no'].includes((row.paymentStatusRaw ?? '').toLowerCase())) row.errors.push('payment_status is required: enter paid or unpaid.');
    }
  }
  return {
    ...parsed,
    hasPaymentStatusColumn: spreadsheetHasPaymentStatusColumn(parsed.headers),
  };
}

export async function parseStockFile(file: File): Promise<ParsedImportRow[]> {
  const detailed = await parseStockFileDetailed(file);
  return detailed.rows;
}

export function enrichRowsWithCatalog(
  rows: ParsedImportRow[],
  catalog: {
    productNames: string[];
    barcodes: string[];
    skus: string[];
    products?: ImportMatchProduct[];
  }
): ParsedImportRow[] {
  const ctx = {
    productNames: new Set(catalog.productNames.map((n) => n.toLowerCase())),
    productNameToId: new Map<string, string>(),
    barcodes: new Set(catalog.barcodes.filter(Boolean)),
    barcodeToProductId: new Map<string, string>(),
    skus: new Set(catalog.skus.filter(Boolean).map((s) => s.toLowerCase())),
    categoryNames: new Set<string>(),
    supplierNames: new Set<string>(),
  };

  const seen = { names: new Set<string>(), barcodes: new Set<string>() };

  return rows.map((row) => {
    const validation = validateImportRow(
      {
        rowNumber: row.rowNumber,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        category: row.category,
        sellingPricePence: row.sellingPricePence,
        costPricePence: row.costPricePence,
        quantity: row.quantity,
        baseUnitName: row.baseUnitName,
        packUnitName: row.packUnitName,
        packSize: row.packSize,
        qtyInName: row.qtyInName,
        supplierName: row.supplierName,
        reorderPoint: row.reorderPoint,
        storefrontPublished: row.storefrontPublished,
        imageUrl: row.imageUrl,
        notes: row.notes,
        confirmBelowCost: row.confirmBelowCost,
      },
      ctx,
      { seenNamesInFile: seen.names, seenBarcodesInFile: seen.barcodes }
    );

    if (row.name.trim()) seen.names.add(row.name.trim().toLowerCase());
    if (row.barcode) seen.barcodes.add(row.barcode);

    let matchErrors: string[] = [];
    let matched = false;
    if (catalog.products) {
      try { matched = Boolean(matchImportProduct(row, catalog.products)); }
      catch (error) { matchErrors = [error instanceof Error ? error.message : 'Product match failed.']; }
    }
    return {
      ...row,
      suggestedCategory: validation.suggestedCategory || row.suggestedCategory,
      duplicateKind: validation.duplicateKind,
      duplicateAction: matched ? 'update' : row.duplicateAction === 'create' && validation.duplicateKind === 'barcode'
        ? 'skip'
        : validation.defaultDuplicateAction,
      errors: [...new Set([...row.errors, ...validation.errors, ...matchErrors, ...hierarchyErrors(row)])],
      warnings: [...new Set([...row.warnings, ...validation.warnings])],
    };
  });
}
