import { headersForTemplate, PHASE1_UNSUPPORTED_HEADERS } from '@/lib/migration/contract';
import type { MigrationTemplateKind } from '@/lib/migration/types';

export function normaliseHeaderKey(raw: string): string {
  return String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase())
    // convert snake to camel leftovers: legacy_product_id → already handled; ensure known aliases
    .replace(/^legacyproductid$/i, 'legacyProductId')
    .replace(/^productname$/i, 'productName')
    .replace(/^primarybarcode$/i, 'primaryBarcode')
    .replace(/^unitofmeasure$/i, 'unitOfMeasure')
    .replace(/^sellingprice$/i, 'sellingPrice')
    .replace(/^costprice$/i, 'costPrice')
    .replace(/^preferredsupplierlegacyid$/i, 'preferredSupplierLegacyId')
    .replace(/^reorderlevel$/i, 'reorderLevel')
    .replace(/^legacysupplierid$/i, 'legacySupplierId')
    .replace(/^suppliername$/i, 'supplierName')
    .replace(/^contactname$/i, 'contactName')
    .replace(/^branchcode$/i, 'branchCode')
    .replace(/^unitcost$/i, 'unitCost')
    .replace(/^effectiveat$/i, 'effectiveAt');
}

/** Map common alias headers to canonical camelCase keys. */
const HEADER_ALIASES: Record<string, string> = {
  legacy_product_id: 'legacyProductId',
  product_name: 'productName',
  primary_barcode: 'primaryBarcode',
  barcode: 'primaryBarcode',
  unit_of_measure: 'unitOfMeasure',
  uom: 'unitOfMeasure',
  selling_price: 'sellingPrice',
  cost_price: 'costPrice',
  preferred_supplier_legacy_id: 'preferredSupplierLegacyId',
  reorder_level: 'reorderLevel',
  legacy_supplier_id: 'legacySupplierId',
  supplier_name: 'supplierName',
  contact_name: 'contactName',
  branch_code: 'branchCode',
  unit_cost: 'unitCost',
  effective_at: 'effectiveAt',
  qty: 'quantity',
  name: 'productName',
};

export function canonicalHeader(raw: string): string {
  const trimmed = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  const snake = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  if (HEADER_ALIASES[snake]) return HEADER_ALIASES[snake];
  // camelCase passthrough for exact contract headers
  const camel = trimmed.replace(/[_\s-]+([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
  const lowerFirst = camel.charAt(0).toLowerCase() + camel.slice(1);
  return lowerFirst;
}

export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

export type ParsedMigrationMatrix = {
  headers: string[];
  rows: Array<{ rowNumber: number; raw: Record<string, string> }>;
  unsupportedHeaders: string[];
  missingRequiredHeaders: string[];
};

export function parseMigrationCsv(text: string, kind: MigrationTemplateKind): ParsedMigrationMatrix {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines
    .map((l, idx) => ({ line: l, idx }))
    .filter(({ line }) => line.trim() !== '' && !line.trim().startsWith('#'));

  if (nonEmpty.length < 2) {
    return {
      headers: [],
      rows: [],
      unsupportedHeaders: [],
      missingRequiredHeaders: [...headersForTemplate(kind)],
    };
  }

  const headerCells = splitCsvLine(nonEmpty[0].line).map(canonicalHeader);
  const expected = new Set(headersForTemplate(kind));
  const unsupportedHeaders = headerCells.filter(
    (h) =>
      (PHASE1_UNSUPPORTED_HEADERS as readonly string[]).some(
        (u) => u.toLowerCase() === h.toLowerCase(),
      ) ||
      (!expected.has(h as never) &&
        !(PHASE1_UNSUPPORTED_HEADERS as readonly string[]).includes(h as never) &&
        h !== ''),
  );
  // Only flag truly unsupported Phase-1 forbidden columns as blocking unsupported;
  // extra unknown columns are collected separately as unsupportedHeaders for warnings.
  const forbidden = headerCells.filter((h) =>
    (PHASE1_UNSUPPORTED_HEADERS as readonly string[]).some((u) => u.toLowerCase() === h.toLowerCase()),
  );

  const missingRequiredHeaders = [...expected].filter((h) => !headerCells.includes(h));

  const rows = nonEmpty.slice(1).map(({ line, idx }) => {
    const cells = splitCsvLine(line);
    const raw: Record<string, string> = {};
    headerCells.forEach((h, i) => {
      if (!h) return;
      raw[h] = String(cells[i] ?? '').trim();
    });
    return { rowNumber: idx + 1, raw };
  });

  return {
    headers: headerCells,
    rows,
    unsupportedHeaders: [...new Set([...unsupportedHeaders, ...forbidden])],
    missingRequiredHeaders,
  };
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
