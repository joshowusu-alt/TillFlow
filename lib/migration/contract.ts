/**
 * Source-neutral Phase 1 data contract (version 1).
 *
 * Provenance: field ideas adapted from historic lib/migration/contract.ts (0f6a917),
 * rewritten for package-oriented entity names (PRODUCTS not CATALOGUE), decimal
 * money, and prohibited Phase 1 balance/history fields.
 */

import { MigrationContractError } from '@/lib/migration/errors';
import {
  MIGRATION_CONTRACT_VERSION,
  PHASE1_PROHIBITED_FIELDS,
  type MigrationEntityType,
  type MigrationFieldSpec,
} from '@/lib/migration/types';

export { MIGRATION_CONTRACT_VERSION };

export const SUPPLIER_HEADERS = [
  'sourceSupplierKey',
  'supplierName',
  'phone',
  'email',
  'address',
  'taxRegistrationId',
  'active',
] as const;

export const PRODUCT_HEADERS = [
  'sourceProductKey',
  'productName',
  'costPrice',
  'sellingPrice',
  'active',
  'sku',
  'barcode',
  'category',
  'unit',
  'taxTreatment',
  'defaultSupplierSourceKey',
] as const;

export const OPENING_STOCK_HEADERS = [
  'sourceProductKey',
  'sourceBranchKey',
  'quantity',
  'unitCost',
  'asOfDate',
  'sourceStockValue',
] as const;

export const REQUIRED_SUPPLIER_HEADERS = ['sourceSupplierKey', 'supplierName'] as const;
export const REQUIRED_PRODUCT_HEADERS = [
  'sourceProductKey',
  'productName',
  'costPrice',
  'sellingPrice',
  'active',
] as const;
export const REQUIRED_OPENING_STOCK_HEADERS = [
  'sourceProductKey',
  'sourceBranchKey',
  'quantity',
  'unitCost',
  'asOfDate',
] as const;

export const SUPPLIER_FIELD_SPECS: MigrationFieldSpec[] = [
  {
    key: 'sourceSupplierKey',
    label: 'Source supplier key',
    requirement: 'required',
    validation: 'Required; unique within file; Unicode NFC',
    maxLength: 128,
    failureSeverity: 'blocking',
  },
  {
    key: 'supplierName',
    label: 'Supplier name',
    requirement: 'required',
    validation: 'Required; max 200 chars',
    maxLength: 200,
    failureSeverity: 'blocking',
  },
  {
    key: 'phone',
    label: 'Phone',
    requirement: 'optional',
    validation: 'Optional; max 40 chars',
    maxLength: 40,
    failureSeverity: 'blocking',
  },
  {
    key: 'email',
    label: 'Email',
    requirement: 'optional',
    validation: 'Optional; max 200 chars',
    maxLength: 200,
    failureSeverity: 'blocking',
  },
  {
    key: 'address',
    label: 'Address',
    requirement: 'optional',
    validation: 'Optional; max 500 chars',
    maxLength: 500,
    failureSeverity: 'blocking',
  },
  {
    key: 'taxRegistrationId',
    label: 'Tax / registration id',
    requirement: 'optional',
    validation: 'Optional; max 80 chars',
    maxLength: 80,
    failureSeverity: 'blocking',
  },
  {
    key: 'active',
    label: 'Active',
    requirement: 'optional',
    validation: 'Optional; true/false/1/0; default true',
    failureSeverity: 'blocking',
  },
];

export const PRODUCT_FIELD_SPECS: MigrationFieldSpec[] = [
  {
    key: 'sourceProductKey',
    label: 'Source product key',
    requirement: 'required',
    validation: 'Required; unique within file',
    maxLength: 128,
    failureSeverity: 'blocking',
  },
  {
    key: 'productName',
    label: 'Product name',
    requirement: 'required',
    validation: 'Required; max 200 chars',
    maxLength: 200,
    failureSeverity: 'blocking',
  },
  {
    key: 'costPrice',
    label: 'Cost price',
    requirement: 'required',
    validation: 'Required; decimal currency (major units); converted to minor units',
    failureSeverity: 'blocking',
  },
  {
    key: 'sellingPrice',
    label: 'Selling price',
    requirement: 'required',
    validation: 'Required; decimal currency (major units); converted to minor units',
    failureSeverity: 'blocking',
  },
  {
    key: 'active',
    label: 'Active',
    requirement: 'required',
    validation: 'Required; true/false/1/0',
    failureSeverity: 'blocking',
  },
  {
    key: 'sku',
    label: 'SKU',
    requirement: 'optional',
    validation: 'Optional; business-unique when present; conflicts blocking',
    maxLength: 64,
    failureSeverity: 'blocking',
  },
  {
    key: 'barcode',
    label: 'Barcode',
    requirement: 'optional',
    validation: 'Optional; conflicts blocking',
    maxLength: 64,
    failureSeverity: 'blocking',
  },
  {
    key: 'category',
    label: 'Category',
    requirement: 'optional',
    validation: 'Optional; max 100 chars',
    maxLength: 100,
    failureSeverity: 'blocking',
  },
  {
    key: 'unit',
    label: 'Unit',
    requirement: 'optional',
    validation: 'Optional; max 40 chars',
    maxLength: 40,
    failureSeverity: 'blocking',
  },
  {
    key: 'taxTreatment',
    label: 'Tax treatment',
    requirement: 'optional',
    validation: 'Optional; max 40 chars',
    maxLength: 40,
    failureSeverity: 'blocking',
  },
  {
    key: 'defaultSupplierSourceKey',
    label: 'Default supplier source key',
    requirement: 'optional',
    validation: 'Optional; must match a suppliers-file sourceSupplierKey when set',
    maxLength: 128,
    failureSeverity: 'blocking',
  },
];

export const OPENING_STOCK_FIELD_SPECS: MigrationFieldSpec[] = [
  {
    key: 'sourceProductKey',
    label: 'Source product key',
    requirement: 'required',
    validation: 'Required; must reference products file',
    maxLength: 128,
    failureSeverity: 'blocking',
  },
  {
    key: 'sourceBranchKey',
    label: 'Source branch key',
    requirement: 'required',
    validation: 'Required; must be mapped to a TillFlow store before approval',
    maxLength: 128,
    failureSeverity: 'blocking',
  },
  {
    key: 'quantity',
    label: 'Quantity',
    requirement: 'required',
    validation: 'Required; non-negative integer; zero allowed; negatives prohibited',
    failureSeverity: 'blocking',
  },
  {
    key: 'unitCost',
    label: 'Unit cost',
    requirement: 'required',
    validation: 'Required; decimal currency ≥ 0; negatives prohibited',
    failureSeverity: 'blocking',
  },
  {
    key: 'asOfDate',
    label: 'As-of date',
    requirement: 'required',
    validation: 'Required; YYYY-MM-DD',
    failureSeverity: 'blocking',
  },
  {
    key: 'sourceStockValue',
    label: 'Source stock value',
    requirement: 'optional',
    validation:
      'Optional reconciliation control; must equal quantity × unitCost after minor-unit conversion',
    failureSeverity: 'blocking',
  },
];

const HEADER_SETS: Record<MigrationEntityType, readonly string[]> = {
  SUPPLIERS: SUPPLIER_HEADERS,
  PRODUCTS: PRODUCT_HEADERS,
  OPENING_STOCK: OPENING_STOCK_HEADERS,
};

const REQUIRED_SETS: Record<MigrationEntityType, readonly string[]> = {
  SUPPLIERS: REQUIRED_SUPPLIER_HEADERS,
  PRODUCTS: REQUIRED_PRODUCT_HEADERS,
  OPENING_STOCK: REQUIRED_OPENING_STOCK_HEADERS,
};

export function headersForEntity(entityType: MigrationEntityType): readonly string[] {
  return HEADER_SETS[entityType];
}

export function requiredHeadersForEntity(entityType: MigrationEntityType): readonly string[] {
  return REQUIRED_SETS[entityType];
}

/** Normalise a CSV header cell: trim, NFC, collapse internal whitespace to single space, lowercase compare key. */
export function normaliseHeaderCell(raw: string): string {
  return raw.replace(/^\uFEFF/, '').trim().normalize('NFC').replace(/\s+/g, ' ');
}

export function headerCompareKey(raw: string): string {
  return normaliseHeaderCell(raw).toLowerCase();
}

export type HeaderValidationResult = {
  ok: boolean;
  normalisedHeaders: string[];
  missingRequired: string[];
  unknownHeaders: string[];
  duplicateHeaders: string[];
  prohibitedHeaders: string[];
};

export function validateCsvHeaders(
  entityType: MigrationEntityType,
  rawHeaders: string[],
): HeaderValidationResult {
  const normalisedHeaders = rawHeaders.map(normaliseHeaderCell);
  const compareKeys = normalisedHeaders.map((h) => h.toLowerCase());

  const duplicateHeaders: string[] = [];
  const seen = new Set<string>();
  for (const key of compareKeys) {
    if (!key) continue;
    if (seen.has(key)) duplicateHeaders.push(key);
    seen.add(key);
  }

  const allowed = new Set(HEADER_SETS[entityType].map((h) => h.toLowerCase()));
  const prohibited = new Set(PHASE1_PROHIBITED_FIELDS.map((h) => h.toLowerCase()));

  const prohibitedHeaders = compareKeys.filter((h) => h && prohibited.has(h));
  const unknownHeaders = compareKeys.filter(
    (h) => h && !allowed.has(h) && !prohibited.has(h),
  );

  const missingRequired = REQUIRED_SETS[entityType].filter(
    (req) => !seen.has(req.toLowerCase()),
  );

  const ok =
    duplicateHeaders.length === 0 &&
    prohibitedHeaders.length === 0 &&
    unknownHeaders.length === 0 &&
    missingRequired.length === 0;

  return {
    ok,
    normalisedHeaders,
    missingRequired,
    unknownHeaders,
    duplicateHeaders,
    prohibitedHeaders,
  };
}

export function assertValidCsvHeaders(
  entityType: MigrationEntityType,
  rawHeaders: string[],
): HeaderValidationResult {
  const result = validateCsvHeaders(entityType, rawHeaders);
  if (!result.ok) {
    const parts: string[] = [];
    if (result.duplicateHeaders.length) {
      parts.push(`duplicate headers: ${result.duplicateHeaders.join(', ')}`);
    }
    if (result.missingRequired.length) {
      parts.push(`missing required: ${result.missingRequired.join(', ')}`);
    }
    if (result.prohibitedHeaders.length) {
      parts.push(`prohibited Phase 1 fields: ${result.prohibitedHeaders.join(', ')}`);
    }
    if (result.unknownHeaders.length) {
      parts.push(`unknown headers: ${result.unknownHeaders.join(', ')}`);
    }
    throw new MigrationContractError(
      `${entityType} header validation failed (${parts.join('; ')}).`,
    );
  }
  return result;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAsOfDate(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new MigrationContractError('asOfDate is required (YYYY-MM-DD).');
  }
  const value = raw.trim();
  if (!ISO_DATE.test(value)) {
    throw new MigrationContractError('asOfDate must be YYYY-MM-DD.');
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m! - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new MigrationContractError('asOfDate is not a real calendar date.');
  }
  return value;
}

export function parseReportingCurrency(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new MigrationContractError('reportingCurrency is required (ISO 4217).');
  }
  const ccy = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(ccy)) {
    throw new MigrationContractError('reportingCurrency must be a 3-letter ISO 4217 code.');
  }
  return ccy;
}

export function parseActiveFlag(raw: unknown, fieldLabel = 'active'): boolean {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw new MigrationContractError(`${fieldLabel} is required.`);
  }
  const v = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(v)) return true;
  if (['false', '0', 'no', 'n'].includes(v)) return false;
  throw new MigrationContractError(`${fieldLabel} must be true/false (or 1/0).`);
}

export function parseOptionalActiveFlag(raw: unknown): boolean {
  if (raw === null || raw === undefined || String(raw).trim() === '') return true;
  return parseActiveFlag(raw, 'active');
}

export function parseNonNegativeIntegerQuantity(raw: unknown): number {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    throw new MigrationContractError('quantity is required.');
  }
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    throw new MigrationContractError('quantity must be a non-negative integer.');
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n)) {
    throw new MigrationContractError('quantity exceeds safe integer range.');
  }
  return n;
}

export function assertNoDuplicateSourceKeys(
  keys: string[],
  fieldLabel: string,
): void {
  const seen = new Set<string>();
  for (const raw of keys) {
    const key = raw.trim().normalize('NFC').toLowerCase();
    if (seen.has(key)) {
      throw new MigrationContractError(`Duplicate ${fieldLabel}: ${raw}`);
    }
    seen.add(key);
  }
}
