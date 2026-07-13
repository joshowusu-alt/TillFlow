/**
 * Client-side file parser for stock import (.csv / .xlsx).
 */

import * as XLSX from 'xlsx';
import { normaliseHeaderKey } from '@/lib/import/import-columns';
import { spreadsheetHasPaymentStatusColumn } from '@/lib/import/import-mode';
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
  suggestedCategory: string;
  sellingPricePence: number;
  costPricePence: number;
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
  duplicateKind: DuplicateKind;
  duplicateAction: DuplicateAction;
  confirmBelowCost: boolean;
  errors: string[];
  warnings: string[];
};

let _counter = 0;
function uniqueId() {
  return `row-${++_counter}-${Math.random().toString(36).slice(2, 6)}`;
}

function parsePence(raw: string): number {
  const cleaned = raw.replace(/,/g, '').replace(/\s/g, '').trim();
  if (!cleaned) return 0; // blank = unknown / zero (opening stock may omit cost)
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return -1;
  return Math.round(n * 100);
}

function parseQuantity(raw: string): number {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned || ['-', 'n/a', 'na', 'nil', 'none', 'oos', 'out'].includes(cleaned)) return 0;
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isNaN(n) ? -1 : n;
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

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
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
  const packSizeRaw = parseInt(g('pack_size'), 10);
  const packSize = Number.isNaN(packSizeRaw) || packSizeRaw <= 1 ? 0 : packSizeRaw;
  const qtyInRaw = g('qty_in');
  const qtyInName = qtyInRaw || baseUnitName;
  const supplierName = g('supplier_name');
  const reorderRaw = parseInt(g('reorder_point'), 10);
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
    rowNumber,
    name,
    sku,
    barcode,
    category,
    suggestedCategory: validation.suggestedCategory || category,
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
    duplicateKind: validation.duplicateKind,
    duplicateAction: validation.defaultDuplicateAction,
    confirmBelowCost: false,
    errors: validation.errors,
    warnings: validation.warnings,
  } satisfies ParsedImportRow;
}

function parseMatrix(matrix: string[][]): { rows: ParsedImportRow[]; headers: string[] } {
  const dataRows = matrix.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  if (dataRows.length < 2) return { rows: [], headers: [] };

  let headerIdx = 0;
  while (headerIdx < dataRows.length) {
    const first = String(dataRows[headerIdx][0] ?? '').trim();
    if (!first.startsWith('#')) break;
    headerIdx++;
  }
  if (headerIdx >= dataRows.length - 1) return { rows: [], headers: [] };

  const headers = dataRows[headerIdx].map((h) => normaliseHeaderKey(String(h ?? '')));
  const seen = { names: new Set<string>(), barcodes: new Set<string>() };

  const rows = dataRows.slice(headerIdx + 1).map((row, index) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => {
      raw[h] = String(row[i] ?? '');
    });
    return buildRow(raw, headerIdx + index + 2, seen);
  });
  return { rows, headers };
}

async function parseCsv(file: File): Promise<{ rows: ParsedImportRow[]; headers: string[] }> {
  const text = await file.text();
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return parseMatrix(lines.map(splitCsvLine));
}

async function parseXlsx(file: File): Promise<{ rows: ParsedImportRow[]; headers: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
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

export async function parseStockFileDetailed(file: File): Promise<ParseStockFileResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  let parsed: { rows: ParsedImportRow[]; headers: string[] };
  if (ext === 'csv') parsed = await parseCsv(file);
  else if (ext === 'xlsx' || ext === 'xls') parsed = await parseXlsx(file);
  else throw new Error('Please upload a .csv or .xlsx file.');
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

    return {
      ...row,
      suggestedCategory: validation.suggestedCategory || row.suggestedCategory,
      duplicateKind: validation.duplicateKind,
      duplicateAction: row.duplicateAction === 'create' && validation.duplicateKind === 'barcode'
        ? 'skip'
        : validation.defaultDuplicateAction,
      errors: [...new Set([...row.errors, ...validation.errors])],
      warnings: [...new Set([...row.warnings, ...validation.warnings])],
    };
  });
}
