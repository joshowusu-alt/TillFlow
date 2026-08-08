/**
 * Source-neutral structural + semantic validation for Phase 1 CSV entity files.
 */

import {
  parseActiveFlag,
  parseAsOfDate,
  parseNonNegativeIntegerQuantity,
  parseOptionalActiveFlag,
  requiredHeadersForEntity,
  validateCsvHeaders,
} from '@/lib/migration/contract';
import {
  compareMigrationIssues,
  sanitiseMigrationIssue,
  type MigrationValidationIssue,
} from '@/lib/migration/issue-codes';
import {
  assertSourceStockValueMatches,
  parseDecimalCurrencyToMinorUnits,
  parseOpeningStockUnitCostToMinorUnits,
} from '@/lib/migration/money';
import type { MigrationEntityType } from '@/lib/migration/types';
import { MigrationContractError } from '@/lib/migration/errors';
import {
  parseMigrationCsvStream,
  type CsvParseResult,
} from '@/lib/services/migration/csv-parser';

export type EntityValidationInput = {
  entityType: MigrationEntityType;
  stream: ReadableStream<Uint8Array>;
  expectedChecksum: string;
};

export type EntityValidationOutput = {
  entityType: MigrationEntityType;
  checksum: string;
  expectedChecksum: string;
  checksumMatched: boolean;
  byteLength: number;
  rowCount: number;
  issues: MigrationValidationIssue[];
  /** NFC+lower identity keys collected for cross-file checks. */
  sourceKeys: Set<string>;
  /** Raw display keys (first occurrence) keyed by identity. */
  sourceKeyDisplay: Map<string, string>;
  skus: Map<string, number>;
  barcodes: Map<string, number>;
  defaultSupplierRefs: Array<{ rowNumber: number; identity: string; display: string }>;
  openingStockRefs: Array<{
    rowNumber: number;
    productIdentity: string;
    branchIdentity: string;
    branchDisplay: string;
  }>;
};

function identityKey(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase();
}

function issue(
  partial: Omit<MigrationValidationIssue, 'message'> & { message: string },
): MigrationValidationIssue {
  return sanitiseMigrationIssue(partial as MigrationValidationIssue);
}

function mapParseIssues(
  entityType: MigrationEntityType,
  parsed: CsvParseResult,
): MigrationValidationIssue[] {
  return parsed.issues.map((p) =>
    issue({
      code:
        p.code === 'EMPTY_FILE'
          ? 'EMPTY_FILE'
          : p.code === 'MALFORMED_QUOTING'
            ? 'MALFORMED_QUOTING'
            : p.code === 'TOO_MANY_COLUMNS'
              ? 'TOO_MANY_COLUMNS'
              : p.code === 'TOO_MANY_ROWS'
                ? 'TOO_MANY_ROWS'
                : p.code === 'FIELD_TOO_LONG'
                  ? 'FIELD_TOO_LONG'
                  : p.code === 'HEADER_TOO_LONG'
                    ? 'HEADER_TOO_LONG'
                    : p.code === 'ROW_WIDTH_MISMATCH'
                      ? 'ROW_WIDTH_MISMATCH'
                      : p.code === 'ENCODING_UNSUPPORTED'
                        ? 'ENCODING_UNSUPPORTED'
                        : 'MALFORMED_CSV',
      severity: p.message.includes('Blank') ? 'warning' : 'error',
      entityType,
      rowNumber: p.rowNumber,
      column: null,
      message: p.message,
    }),
  );
}

function cellMap(headers: string[], cells: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < headers.length; i += 1) {
    map.set(headers[i]!.toLowerCase(), cells[i] ?? '');
  }
  return map;
}

function checkFormula(
  entityType: MigrationEntityType,
  rowNumber: number,
  column: string,
  value: string,
  out: MigrationValidationIssue[],
): void {
  if (/^[=+\-@]/.test(value)) {
    out.push(
      issue({
        code: 'FORMULA_PREFIX_DETECTED',
        severity: 'warning',
        entityType,
        rowNumber,
        column,
        message: 'Cell begins with a spreadsheet-formula prefix; treated as inert text.',
      }),
    );
  }
}

function requireSourceKey(
  entityType: MigrationEntityType,
  rowNumber: number,
  column: string,
  raw: string,
  out: MigrationValidationIssue[],
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    out.push(
      issue({
        code: 'REQUIRED_FIELD_MISSING',
        severity: 'error',
        entityType,
        rowNumber,
        column,
        message: `${column} is required.`,
      }),
    );
    return null;
  }
  if (trimmed.length > 128) {
    out.push(
      issue({
        code: 'INVALID_SOURCE_KEY',
        severity: 'error',
        entityType,
        rowNumber,
        column,
        message: `${column} exceeds 128 characters.`,
      }),
    );
    return null;
  }
  checkFormula(entityType, rowNumber, column, trimmed, out);
  return trimmed.normalize('NFC');
}

export async function validateEntityFile(
  input: EntityValidationInput,
): Promise<EntityValidationOutput> {
  const issues: MigrationValidationIssue[] = [];
  let parsed: CsvParseResult;
  try {
    parsed = await parseMigrationCsvStream(input.stream);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    issues.push(
      issue({
        code: code === 'TOO_LARGE' ? 'TOO_MANY_ROWS' : 'STORAGE_READ_FAILED',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: null,
        column: null,
        message:
          code === 'TOO_LARGE'
            ? 'File exceeds the maximum upload size.'
            : 'Unable to read migration file contents.',
      }),
    );
    return {
      entityType: input.entityType,
      checksum: '',
      expectedChecksum: input.expectedChecksum.toLowerCase(),
      checksumMatched: false,
      byteLength: 0,
      rowCount: 0,
      issues,
      sourceKeys: new Set(),
      sourceKeyDisplay: new Map(),
      skus: new Map(),
      barcodes: new Map(),
      defaultSupplierRefs: [],
      openingStockRefs: [],
    };
  }

  issues.push(...mapParseIssues(input.entityType, parsed));

  const expected = input.expectedChecksum.toLowerCase();
  const actual = parsed.sha256Hex.toLowerCase();
  const checksumMatched = actual === expected && actual.length === 64;
  if (!checksumMatched) {
    issues.push(
      issue({
        code: 'CHECKSUM_MISMATCH',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: null,
        column: null,
        message: 'Streamed file checksum does not match the finalised upload checksum.',
      }),
    );
  }

  if (parsed.headers.length === 0) {
    issues.push(
      issue({
        code: 'EMPTY_FILE',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: null,
        column: null,
        message: 'File has no header row.',
      }),
    );
  }

  const headerResult = validateCsvHeaders(input.entityType, parsed.headers);
  for (const h of headerResult.missingRequired) {
    issues.push(
      issue({
        code: 'MISSING_REQUIRED_HEADER',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: 1,
        column: h,
        message: `Missing required header: ${h}.`,
      }),
    );
  }
  for (const h of headerResult.duplicateHeaders) {
    issues.push(
      issue({
        code: 'DUPLICATE_HEADER',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: 1,
        column: h,
        message: `Duplicate header: ${h}.`,
      }),
    );
  }
  for (const h of headerResult.unknownHeaders) {
    issues.push(
      issue({
        code: 'UNKNOWN_HEADER',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: 1,
        column: h,
        message: `Unknown header: ${h}.`,
      }),
    );
  }
  for (const h of headerResult.prohibitedHeaders) {
    issues.push(
      issue({
        code: 'PROHIBITED_HEADER',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: 1,
        column: h,
        message: `Prohibited Phase 1 field: ${h}.`,
      }),
    );
  }

  if (headerResult.ok && parsed.rows.length === 0) {
    issues.push(
      issue({
        code: 'HEADER_ONLY_FILE',
        severity: 'error',
        entityType: input.entityType,
        rowNumber: 1,
        column: null,
        message: 'File contains a header but no data rows.',
      }),
    );
  }

  const normalisedHeaders = headerResult.normalisedHeaders.map((h) => h.toLowerCase());
  const sourceKeys = new Set<string>();
  const sourceKeyDisplay = new Map<string, string>();
  const skus = new Map<string, number>();
  const barcodes = new Map<string, number>();
  const defaultSupplierRefs: EntityValidationOutput['defaultSupplierRefs'] = [];
  const openingStockRefs: EntityValidationOutput['openingStockRefs'] = [];
  const openingLineKeys = new Set<string>();

  // Only row-validate when headers are usable enough to map required columns.
  const required = requiredHeadersForEntity(input.entityType);
  const canRowValidate =
    headerResult.missingRequired.length === 0 && headerResult.duplicateHeaders.length === 0;

  if (canRowValidate) {
    for (let i = 0; i < parsed.rows.length; i += 1) {
      const rowNumber = parsed.rowNumbers[i] ?? i + 2;
      const cells = parsed.rows[i]!;
      const map = cellMap(normalisedHeaders, cells);

      for (const [col, val] of map.entries()) {
        if (val) checkFormula(input.entityType, rowNumber, col, val, issues);
      }

      if (input.entityType === 'SUPPLIERS') {
        const key = requireSourceKey(
          input.entityType,
          rowNumber,
          'sourceSupplierKey',
          map.get('sourcesupplierkey') ?? '',
          issues,
        );
        if (key) {
          const id = identityKey(key);
          if (sourceKeys.has(id)) {
            issues.push(
              issue({
                code: 'DUPLICATE_SOURCE_KEY',
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: 'sourceSupplierKey',
                message: 'Duplicate sourceSupplierKey in suppliers file.',
                sourceKey: key,
              }),
            );
          } else {
            sourceKeys.add(id);
            sourceKeyDisplay.set(id, key);
          }
        }
        const name = (map.get('suppliername') ?? '').trim();
        if (!name) {
          issues.push(
            issue({
              code: 'REQUIRED_FIELD_MISSING',
              severity: 'error',
              entityType: input.entityType,
              rowNumber,
              column: 'supplierName',
              message: 'supplierName is required.',
              sourceKey: key,
            }),
          );
        } else if (name.length > 200) {
          issues.push(
            issue({
              code: 'FIELD_TOO_LONG',
              severity: 'error',
              entityType: input.entityType,
              rowNumber,
              column: 'supplierName',
              message: 'supplierName exceeds 200 characters.',
              sourceKey: key,
            }),
          );
        }
        const activeRaw = map.get('active');
        if (activeRaw != null && activeRaw.trim() !== '') {
          try {
            parseOptionalActiveFlag(activeRaw);
          } catch {
            issues.push(
              issue({
                code: 'INVALID_ACTIVE_FLAG',
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: 'active',
                message: 'active must be true/false (or 1/0).',
                sourceKey: key,
              }),
            );
          }
        }
      }

      if (input.entityType === 'PRODUCTS') {
        const key = requireSourceKey(
          input.entityType,
          rowNumber,
          'sourceProductKey',
          map.get('sourceproductkey') ?? '',
          issues,
        );
        if (key) {
          const id = identityKey(key);
          if (sourceKeys.has(id)) {
            issues.push(
              issue({
                code: 'DUPLICATE_SOURCE_KEY',
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: 'sourceProductKey',
                message: 'Duplicate sourceProductKey in products file.',
                sourceKey: key,
              }),
            );
          } else {
            sourceKeys.add(id);
            sourceKeyDisplay.set(id, key);
          }
        }
        const name = (map.get('productname') ?? '').trim();
        if (!name) {
          issues.push(
            issue({
              code: 'REQUIRED_FIELD_MISSING',
              severity: 'error',
              entityType: input.entityType,
              rowNumber,
              column: 'productName',
              message: 'productName is required.',
              sourceKey: key,
            }),
          );
        }
        for (const moneyCol of ['costprice', 'sellingprice'] as const) {
          const label = moneyCol === 'costprice' ? 'costPrice' : 'sellingPrice';
          const raw = map.get(moneyCol) ?? '';
          try {
            const minor = parseDecimalCurrencyToMinorUnits(raw, label);
            if (minor < 0) {
              issues.push(
                issue({
                  code: 'NEGATIVE_VALUE_PROHIBITED',
                  severity: 'error',
                  entityType: input.entityType,
                  rowNumber,
                  column: label,
                  message: `${label} must not be negative.`,
                  sourceKey: key,
                }),
              );
            }
          } catch (err) {
            const msg = err instanceof MigrationContractError ? err.message : 'Invalid decimal.';
            const code = /decimal places/i.test(msg)
              ? 'INVALID_MONETARY_PRECISION'
              : 'INVALID_DECIMAL';
            issues.push(
              issue({
                code,
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: label,
                message: msg,
                sourceKey: key,
              }),
            );
          }
        }
        try {
          parseActiveFlag(map.get('active') ?? '', 'active');
        } catch {
          issues.push(
            issue({
              code: 'INVALID_ACTIVE_FLAG',
              severity: 'error',
              entityType: input.entityType,
              rowNumber,
              column: 'active',
              message: 'active must be true/false (or 1/0).',
              sourceKey: key,
            }),
          );
        }
        const sku = (map.get('sku') ?? '').trim();
        if (sku) {
          const skuId = identityKey(sku);
          if (skus.has(skuId)) {
            issues.push(
              issue({
                code: 'DUPLICATE_SKU',
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: 'sku',
                message: 'Duplicate sku within products file.',
                sourceKey: key,
              }),
            );
          } else {
            skus.set(skuId, rowNumber);
          }
        }
        const barcode = (map.get('barcode') ?? '').trim();
        if (!barcode) {
          issues.push(
            issue({
              code: 'MISSING_BARCODE',
              severity: 'warning',
              entityType: input.entityType,
              rowNumber,
              column: 'barcode',
              message: 'Barcode is missing; none will be generated.',
              sourceKey: key,
            }),
          );
        } else {
          const bcId = identityKey(barcode);
          if (barcodes.has(bcId)) {
            issues.push(
              issue({
                code: 'DUPLICATE_BARCODE',
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: 'barcode',
                message: 'Duplicate barcode within products file.',
                sourceKey: key,
              }),
            );
          } else {
            barcodes.set(bcId, rowNumber);
          }
        }
        const supplierRef = (map.get('defaultsuppliersourcekey') ?? '').trim();
        if (supplierRef) {
          defaultSupplierRefs.push({
            rowNumber,
            identity: identityKey(supplierRef),
            display: supplierRef.normalize('NFC'),
          });
        }
      }

      if (input.entityType === 'OPENING_STOCK') {
        const productKey = requireSourceKey(
          input.entityType,
          rowNumber,
          'sourceProductKey',
          map.get('sourceproductkey') ?? '',
          issues,
        );
        const branchKey = requireSourceKey(
          input.entityType,
          rowNumber,
          'sourceBranchKey',
          map.get('sourcebranchkey') ?? '',
          issues,
        );
        let quantity = -1;
        try {
          quantity = parseNonNegativeIntegerQuantity(map.get('quantity') ?? '');
        } catch (err) {
          issues.push(
            issue({
              code: 'INVALID_QUANTITY',
              severity: 'error',
              entityType: input.entityType,
              rowNumber,
              column: 'quantity',
              message:
                err instanceof MigrationContractError ? err.message : 'Invalid quantity.',
              sourceKey: productKey,
            }),
          );
        }
        let unitCostMinor = -1;
        try {
          unitCostMinor = parseOpeningStockUnitCostToMinorUnits(map.get('unitcost') ?? '');
        } catch (err) {
          const msg = err instanceof MigrationContractError ? err.message : 'Invalid unitCost.';
          issues.push(
            issue({
              code: /decimal places/i.test(msg)
                ? 'INVALID_MONETARY_PRECISION'
                : /negative/i.test(msg)
                  ? 'NEGATIVE_VALUE_PROHIBITED'
                  : 'INVALID_DECIMAL',
              severity: 'error',
              entityType: input.entityType,
              rowNumber,
              column: 'unitCost',
              message: msg,
              sourceKey: productKey,
            }),
          );
        }
        try {
          parseAsOfDate(map.get('asofdate') ?? '');
        } catch (err) {
          issues.push(
            issue({
              code: 'INVALID_DATE',
              severity: 'error',
              entityType: input.entityType,
              rowNumber,
              column: 'asOfDate',
              message: err instanceof MigrationContractError ? err.message : 'Invalid asOfDate.',
              sourceKey: productKey,
            }),
          );
        }
        if (quantity >= 0 && unitCostMinor >= 0) {
          try {
            assertSourceStockValueMatches({
              quantityBase: quantity,
              unitCostMinor,
              sourceStockValueRaw: map.get('sourcestockvalue') ?? '',
            });
          } catch (err) {
            issues.push(
              issue({
                code: 'STOCK_VALUE_MISMATCH',
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: 'sourceStockValue',
                message:
                  err instanceof MigrationContractError
                    ? err.message
                    : 'sourceStockValue mismatch.',
                sourceKey: productKey,
              }),
            );
          }
        }
        if (productKey && branchKey) {
          const lineId = `${identityKey(productKey)}|${identityKey(branchKey)}`;
          if (openingLineKeys.has(lineId)) {
            issues.push(
              issue({
                code: 'DUPLICATE_OPENING_STOCK_LINE',
                severity: 'error',
                entityType: input.entityType,
                rowNumber,
                column: 'sourceProductKey',
                message: 'Duplicate opening-stock line for product and branch.',
                sourceKey: productKey,
              }),
            );
          } else {
            openingLineKeys.add(lineId);
          }
          openingStockRefs.push({
            rowNumber,
            productIdentity: identityKey(productKey),
            branchIdentity: identityKey(branchKey),
            branchDisplay: branchKey,
          });
          sourceKeys.add(identityKey(productKey));
        }
      }
    }
  }

  // Silence unused required for lint in edge builds
  void required;

  issues.sort(compareMigrationIssues);
  return {
    entityType: input.entityType,
    checksum: actual,
    expectedChecksum: expected,
    checksumMatched,
    byteLength: parsed.byteLength,
    rowCount: parsed.rows.length,
    issues,
    sourceKeys,
    sourceKeyDisplay,
    skus,
    barcodes,
    defaultSupplierRefs,
    openingStockRefs,
  };
}

export function applyCrossFileSemantics(input: {
  suppliers: EntityValidationOutput;
  products: EntityValidationOutput;
  openingStock: EntityValidationOutput;
  branchMappings: Array<{ sourceBranchKey: string }>;
}): MigrationValidationIssue[] {
  const issues: MigrationValidationIssue[] = [];
  for (const ref of input.products.defaultSupplierRefs) {
    if (!input.suppliers.sourceKeys.has(ref.identity)) {
      issues.push(
        issue({
          code: 'SUPPLIER_REFERENCE_MISSING',
          severity: 'error',
          entityType: 'PRODUCTS',
          rowNumber: ref.rowNumber,
          column: 'defaultSupplierSourceKey',
          message: 'defaultSupplierSourceKey does not match any suppliers-file sourceSupplierKey.',
          sourceKey: ref.display,
        }),
      );
    }
  }
  for (const ref of input.openingStock.openingStockRefs) {
    if (!input.products.sourceKeys.has(ref.productIdentity)) {
      issues.push(
        issue({
          code: 'PRODUCT_REFERENCE_MISSING',
          severity: 'error',
          entityType: 'OPENING_STOCK',
          rowNumber: ref.rowNumber,
          column: 'sourceProductKey',
          message: 'sourceProductKey does not match any products-file sourceProductKey.',
        }),
      );
    }
  }

  const mapped = new Set(
    input.branchMappings.map((m) => identityKey(m.sourceBranchKey)),
  );
  const distinctBranches = new Set(
    input.openingStock.openingStockRefs.map((r) => r.branchIdentity),
  );
  if (distinctBranches.size > 0 && mapped.size === 0) {
    issues.push(
      issue({
        code: 'BRANCH_MAPPINGS_REQUIRED',
        severity: 'error',
        entityType: 'PACKAGE',
        rowNumber: null,
        column: null,
        message: 'Opening stock requires package branch mappings before validation can succeed.',
      }),
    );
  } else {
    for (const ref of input.openingStock.openingStockRefs) {
      if (!mapped.has(ref.branchIdentity)) {
        issues.push(
          issue({
            code: 'BRANCH_KEY_UNMAPPED',
            severity: 'error',
            entityType: 'OPENING_STOCK',
            rowNumber: ref.rowNumber,
            column: 'sourceBranchKey',
            message: 'sourceBranchKey is not mapped to a store on this package.',
            sourceKey: ref.branchDisplay,
          }),
        );
      }
    }
  }

  issues.sort(compareMigrationIssues);
  return issues;
}

export function summariseIssues(issues: MigrationValidationIssue[]): {
  errorCount: number;
  warningCount: number;
} {
  let errorCount = 0;
  let warningCount = 0;
  for (const i of issues) {
    if (i.severity === 'error') errorCount += 1;
    else warningCount += 1;
  }
  return { errorCount, warningCount };
}
