/**
 * Slice 2B — stable public validation issue codes.
 * Codes are independent of internal exception wording.
 */

export const MIGRATION_ISSUE_SEVERITIES = ['error', 'warning'] as const;
export type MigrationIssueSeverity = (typeof MIGRATION_ISSUE_SEVERITIES)[number];

export const MIGRATION_ISSUE_CODES = [
  'FILE_MISSING',
  'FILE_NOT_FINALISED',
  'CHECKSUM_MISMATCH',
  'STORAGE_OBJECT_MISSING',
  'STORAGE_READ_FAILED',
  'EMPTY_FILE',
  'HEADER_ONLY_FILE',
  'MALFORMED_CSV',
  'MALFORMED_QUOTING',
  'ROW_WIDTH_MISMATCH',
  'TOO_MANY_COLUMNS',
  'TOO_MANY_ROWS',
  'FIELD_TOO_LONG',
  'HEADER_TOO_LONG',
  'MISSING_REQUIRED_HEADER',
  'DUPLICATE_HEADER',
  'UNKNOWN_HEADER',
  'PROHIBITED_HEADER',
  'BLANK_ROW',
  'INVALID_SOURCE_KEY',
  'DUPLICATE_SOURCE_KEY',
  'INVALID_DECIMAL',
  'INVALID_MONETARY_PRECISION',
  'NEGATIVE_VALUE_PROHIBITED',
  'INVALID_DATE',
  'INVALID_ACTIVE_FLAG',
  'REQUIRED_FIELD_MISSING',
  'INVALID_QUANTITY',
  'SUPPLIER_REFERENCE_MISSING',
  'PRODUCT_REFERENCE_MISSING',
  'DUPLICATE_SKU',
  'DUPLICATE_BARCODE',
  'MISSING_BARCODE',
  'STOCK_VALUE_MISMATCH',
  'BRANCH_KEY_UNMAPPED',
  'BRANCH_MAPPINGS_REQUIRED',
  'DUPLICATE_OPENING_STOCK_LINE',
  'FORMULA_PREFIX_DETECTED',
  'PACKAGE_INCOMPLETE',
  'ENCODING_UNSUPPORTED',
] as const;

export type MigrationIssueCode = (typeof MIGRATION_ISSUE_CODES)[number];

export type MigrationValidationIssue = {
  code: MigrationIssueCode;
  severity: MigrationIssueSeverity;
  entityType: 'SUPPLIERS' | 'PRODUCTS' | 'OPENING_STOCK' | 'PACKAGE';
  rowNumber: number | null;
  column: string | null;
  message: string;
  sourceKey?: string | null;
};

const CODE_SET = new Set<string>(MIGRATION_ISSUE_CODES);

export function isMigrationIssueCode(value: string): value is MigrationIssueCode {
  return CODE_SET.has(value);
}

/** Deterministic issue ordering for stable persistence and API responses. */
export function compareMigrationIssues(
  a: MigrationValidationIssue,
  b: MigrationValidationIssue,
): number {
  const entityOrder = { PACKAGE: 0, SUPPLIERS: 1, PRODUCTS: 2, OPENING_STOCK: 3 } as const;
  const ea = entityOrder[a.entityType] ?? 9;
  const eb = entityOrder[b.entityType] ?? 9;
  if (ea !== eb) return ea - eb;
  const ra = a.rowNumber ?? -1;
  const rb = b.rowNumber ?? -1;
  if (ra !== rb) return ra - rb;
  const ca = a.column ?? '';
  const cb = b.column ?? '';
  if (ca !== cb) return ca.localeCompare(cb);
  if (a.code !== b.code) return a.code.localeCompare(b.code);
  return a.message.localeCompare(b.message);
}

const MAX_MESSAGE = 240;
const MAX_SOURCE_KEY = 128;

/** Bound and neutralise issue fields for persistence / public responses. */
export function sanitiseMigrationIssue(
  issue: MigrationValidationIssue,
): MigrationValidationIssue {
  const message = String(issue.message ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_MESSAGE);
  const sourceKey =
    issue.sourceKey == null || issue.sourceKey === ''
      ? null
      : String(issue.sourceKey)
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim()
          .normalize('NFC')
          .slice(0, MAX_SOURCE_KEY);
  return {
    code: isMigrationIssueCode(issue.code) ? issue.code : 'MALFORMED_CSV',
    severity: issue.severity === 'warning' ? 'warning' : 'error',
    entityType: issue.entityType,
    rowNumber:
      typeof issue.rowNumber === 'number' && Number.isInteger(issue.rowNumber)
        ? issue.rowNumber
        : null,
    column: issue.column ? String(issue.column).slice(0, 64) : null,
    message: message || 'Validation issue.',
    sourceKey,
  };
}
