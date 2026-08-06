/**
 * Strict decimal-currency → integer minor-unit parsing for migration CSVs.
 *
 * Prospects supply ordinary decimal notation (e.g. "12.50"). TillFlow stores
 * integer minor units. Parsing normalisation is separate from file checksums.
 *
 * CSV / file-boundary callers must pass string cell values. The `number`
 * overload remains for internal numeric literals in tests and helpers; do not
 * feed float-computed numbers from a spreadsheet path (float artefacts can
 * appear as excessive fractional digits). A string-only public boundary may be
 * introduced when P1 upload wiring lands.
 */

import { MigrationContractError } from '@/lib/migration/errors';

/** Maximum absolute minor units accepted (fits signed 32-bit inventory/money paths safely under Number.MAX_SAFE_INTEGER). */
export const MIGRATION_MAX_MINOR_UNITS = 9_000_000_000_000; // 90 billion major units * 100

/**
 * Parse a major-unit decimal currency string into integer minor units.
 *
 * Accepted:
 * - "12", "12.5", "12.50"
 * - optional leading +
 * - optional thousands grouping with commas only when groups are exactly three digits
 * - "0", "0.0", "0.00", "+0" → ordinary `0` (never JavaScript `-0`)
 *
 * Rejected:
 * - blank / non-string-or-number
 * - currency symbols or letters
 * - scientific notation
 * - more than 2 decimal places
 * - malformed grouping
 * - non-finite / overflow
 * - signed negative zero ("-0", "-0.0", "-0.00")
 */
export function parseDecimalCurrencyToMinorUnits(raw: unknown, fieldLabel = 'amount'): number {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new MigrationContractError(`${fieldLabel} must be a decimal currency value.`);
  }
  const original = String(raw).trim();
  if (!original) {
    throw new MigrationContractError(`${fieldLabel} is required.`);
  }
  if (/[eE]/.test(original)) {
    throw new MigrationContractError(`${fieldLabel} must not use scientific notation.`);
  }
  if (/[^\d+.\-,]/.test(original)) {
    throw new MigrationContractError(
      `${fieldLabel} must be plain decimal digits (no currency symbols).`,
    );
  }

  let signed = original;
  let negative = false;
  if (signed.startsWith('+')) signed = signed.slice(1);
  if (signed.startsWith('-')) {
    negative = true;
    signed = signed.slice(1);
  }
  if (!signed || signed.startsWith('-') || signed.startsWith('+')) {
    throw new MigrationContractError(`${fieldLabel} is malformed.`);
  }

  // Reject multiple dots.
  if ((signed.match(/\./g) ?? []).length > 1) {
    throw new MigrationContractError(`${fieldLabel} has too many decimal points.`);
  }

  const [intPartRaw, fracPartRaw] = signed.split('.');
  if (fracPartRaw !== undefined && fracPartRaw.length > 2) {
    throw new MigrationContractError(
      `${fieldLabel} must have at most 2 decimal places (got ${fracPartRaw.length}).`,
    );
  }
  if (fracPartRaw !== undefined && !/^\d{1,2}$/.test(fracPartRaw)) {
    throw new MigrationContractError(`${fieldLabel} has an invalid fractional part.`);
  }

  const intPart = stripThousandsGrouping(intPartRaw, fieldLabel);
  if (!/^\d+$/.test(intPart)) {
    throw new MigrationContractError(`${fieldLabel} has an invalid integer part.`);
  }

  const frac = (fracPartRaw ?? '').padEnd(2, '0').slice(0, 2);
  // Construct minor units without floating point.
  const major = BigInt(intPart);
  const minor = major * 100n + BigInt(frac || '0');
  if (minor > BigInt(MIGRATION_MAX_MINOR_UNITS)) {
    throw new MigrationContractError(`${fieldLabel} exceeds the maximum supported amount.`);
  }
  // Reject textual signed zero before producing JavaScript -0.
  if (negative && minor === 0n) {
    throw new MigrationContractError(`${fieldLabel} must not be signed negative zero.`);
  }
  const asNumber = Number(minor);
  if (!Number.isFinite(asNumber)) {
    throw new MigrationContractError(`${fieldLabel} is not a finite number.`);
  }
  const result = negative ? -asNumber : asNumber;
  if (Object.is(result, -0)) {
    throw new MigrationContractError(`${fieldLabel} must not be signed negative zero.`);
  }
  return result;
}

function stripThousandsGrouping(intPartRaw: string, fieldLabel: string): string {
  if (!intPartRaw.includes(',')) {
    if (intPartRaw === '') {
      throw new MigrationContractError(`${fieldLabel} is missing an integer part.`);
    }
    return intPartRaw;
  }
  const parts = intPartRaw.split(',');
  if (parts[0] === '' || !/^\d{1,3}$/.test(parts[0]!)) {
    throw new MigrationContractError(`${fieldLabel} has malformed thousands grouping.`);
  }
  for (let i = 1; i < parts.length; i += 1) {
    if (!/^\d{3}$/.test(parts[i]!)) {
      throw new MigrationContractError(`${fieldLabel} has malformed thousands grouping.`);
    }
  }
  return parts.join('');
}

/**
 * Authoritative stock value in minor units: quantity (base units) × unit cost (minor units).
 * Uses integer arithmetic only. Zero quantity yields zero value.
 */

/** Opening-stock unit costs must be ≥ 0 after minor-unit conversion. */
export function assertNonNegativeUnitCostMinor(unitCostMinor: number): void {
  if (!Number.isInteger(unitCostMinor) || unitCostMinor < 0 || Object.is(unitCostMinor, -0)) {
    throw new MigrationContractError('unitCost must not be negative.');
  }
}

export function parseOpeningStockUnitCostToMinorUnits(raw: unknown): number {
  const minor = parseDecimalCurrencyToMinorUnits(raw, 'unitCost');
  assertNonNegativeUnitCostMinor(minor);
  return minor;
}

export function calculateOpeningStockValueMinor(
  quantityBase: number,
  unitCostMinor: number,
): number {
  if (!Number.isInteger(quantityBase) || quantityBase < 0) {
    throw new MigrationContractError('quantity must be a non-negative integer.');
  }
  assertNonNegativeUnitCostMinor(unitCostMinor);
  const product = BigInt(quantityBase) * BigInt(unitCostMinor);
  if (product > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MigrationContractError('stock value overflows safe integer range.');
  }
  return Number(product);
}

/**
 * Compare optional sourceStockValue control against calculated value.
 * Phase 1 permitted tolerance: exact match after both sides are parsed to minor units.
 */
export function assertSourceStockValueMatches(input: {
  quantityBase: number;
  unitCostMinor: number;
  sourceStockValueRaw: string | null | undefined;
  fieldLabel?: string;
}): number {
  const calculated = calculateOpeningStockValueMinor(input.quantityBase, input.unitCostMinor);
  if (input.sourceStockValueRaw == null || String(input.sourceStockValueRaw).trim() === '') {
    return calculated;
  }
  const provided = parseDecimalCurrencyToMinorUnits(
    String(input.sourceStockValueRaw),
    input.fieldLabel ?? 'sourceStockValue',
  );
  if (provided !== calculated) {
    throw new MigrationContractError(
      `sourceStockValue (${provided}) does not match quantity × unitCost (${calculated}).`,
      'STOCK_VALUE_MISMATCH',
    );
  }
  return calculated;
}
