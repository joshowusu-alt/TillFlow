/**
 * Client-side file parser for the stock import feature.
 * Handles .csv files (RFC-4180 compliant) and .xlsx / .xls files (via SheetJS).
 * Returns a normalised array of ParsedImportRow — no DB calls here.
 */

import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatus = 'PAID' | 'UNPAID';

/**
 * One row as it comes out of the parser.
 * All money fields are already in pence.
 * Validation issues are collected in `errors` (blocking) and `warnings` (resolvable in preview).
 */
export type ParsedImportRow = {
  /** Unique stable key for React lists */
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  sellingPricePence: number;
  costPricePence: number;
  quantity: number;
  /** Name typed by the user in base_unit column */
  baseUnitName: string;
  /** Name typed by the user in pack_unit column — empty string means no packaging */
  packUnitName: string;
  /** How many base units per pack — 0 means not set */
  packSize: number;
  /** The unit name the quantity was counted in (defaults to packUnitName if set, else baseUnitName) */
  qtyInName: string;
  paymentStatus: PaymentStatus;
  /** Hard errors — row cannot be confirmed until file is re-uploaded with fixes */
  errors: string[];
  /** Soft warnings — resolvable in the preview UI without re-uploading */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _counter = 0;
function uniqueId() {
  return `row-${++_counter}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Parse a price string like "12.00" or "12,50" into pence. */
function parsePence(raw: string): number {
  const n = parseFloat(raw.replace(',', '.').trim());
  if (isNaN(n)) return -1; // sentinel for invalid
  return Math.round(n * 100);
}

function normalisePaymentStatus(raw: string): PaymentStatus {
  const v = raw.trim().toLowerCase();
  if (v === 'paid') return 'PAID';
  return 'UNPAID'; // blank, 'unpaid', or anything else → UNPAID
}

/** Minimal RFC-4180-compliant CSV line splitter (handles quoted fields). */
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
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

/** Convert a raw object (keyed by header name) into a ParsedImportRow. */
function buildRow(raw: Record<string, string>): ParsedImportRow {
  const g = (key: string) => (raw[key] ?? '').trim();

  const name = g('name');
  const sku = g('sku');
  const barcode = g('barcode');
  const category = g('category');
  const sellingPricePence = parsePence(g('selling_price'));
  const costPricePence = parsePence(g('cost_price'));
  // Blank or non-numeric quantity means no opening stock — treat as 0.
  // Spreadsheets commonly use "-", "N/A", "nil", "OOS" etc. for out-of-stock items.
  const qtyStr = g('quantity');
  const qtyRaw = parseFloat(qtyStr);
  const quantity = isNaN(qtyRaw) ? 0 : qtyRaw;
  const baseUnitName = g('base_unit');
  const packUnitName = g('pack_unit');
  const packSizeRaw = parseInt(g('pack_size'), 10);
  const packSize = isNaN(packSizeRaw) || packSizeRaw <= 1 ? 0 : packSizeRaw;
  const qtyInRaw = g('qty_in');
  const qtyInName = qtyInRaw || (packUnitName || baseUnitName);
  const paymentStatus = normalisePaymentStatus(g('payment_status'));

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name) errors.push('Product name is required');
  if (sellingPricePence < 0) errors.push('selling_price must be a number');
  if (costPricePence < 0) errors.push('cost_price must be a number');
  if (!baseUnitName) errors.push('base_unit is required');

  if (packUnitName && packSize === 0) {
    warnings.push('pack_unit is set but pack_size is missing or ≤ 1 — enter the conversion below');
  }

  return {
    _id: uniqueId(),
    name,
    sku,
    barcode,
    category,
    sellingPricePence: Math.max(0, sellingPricePence),
    costPricePence: Math.max(0, costPricePence),
    quantity: Math.max(0, quantity),
    baseUnitName,
    packUnitName,
    packSize,
    qtyInName,
    paymentStatus,
    errors,
    warnings,
  };
}

/** Parse a raw 2-D string array (header row + data rows) into ParsedImportRow[]. */
function parseMatrix(matrix: string[][]): ParsedImportRow[] {
  if (matrix.length < 2) return [];

  // Normalise header names: lowercase + trim
  const headers = matrix[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));

  return matrix
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== '')) // skip blank rows
    .map((row) => {
      const raw: Record<string, string> = {};
      headers.forEach((h, i) => {
        raw[h] = row[i] ?? '';
      });
      return buildRow(raw);
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Parse a .csv File and return normalised rows. */
async function parseCsv(file: File): Promise<ParsedImportRow[]> {
  const text = await file.text();
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
  const matrix = lines.map(splitCsvLine);
  return parseMatrix(matrix);
}

/** Parse a .xlsx / .xls File and return normalised rows via SheetJS. */
async function parseXlsx(file: File): Promise<ParsedImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  // raw: false → all cells returned as formatted strings, consistent with the CSV path
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  return parseMatrix(matrix as string[][]);
}

/**
 * Main entry point — CSV, XLSX and XLS.
 * Throws a descriptive Error if the format is unsupported.
 */
export async function parseStockFile(file: File): Promise<ParsedImportRow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseCsv(file);
  if (ext === 'xlsx' || ext === 'xls') return parseXlsx(file);
  throw new Error(`Unsupported file type ".${ext}". Please upload a .csv or .xlsx file.`);
}
