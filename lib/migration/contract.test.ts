/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  assertValidCsvHeaders,
  validateCsvHeaders,
  parseAsOfDate,
  parseReportingCurrency,
  parseNonNegativeIntegerQuantity,
  assertNoDuplicateSourceKeys,
  normaliseHeaderCell,
} from '@/lib/migration/contract';
import {
  parseDecimalCurrencyToMinorUnits,
  parseOpeningStockUnitCostToMinorUnits,
  assertSourceStockValueMatches,
  calculateOpeningStockValueMinor,
} from '@/lib/migration/money';
import { normaliseSourceSystemKey, normaliseSourceBusinessKey } from '@/lib/migration/source-system-key';
import { MigrationContractError } from '@/lib/migration/errors';
import { sanitizeCsvCell } from '@/lib/migration/limits';

describe('migration data contract v1', () => {
  it('requires Phase 1 headers and rejects duplicates / unknown / prohibited fields', () => {
    expect(
      validateCsvHeaders('SUPPLIERS', ['sourceSupplierKey', 'supplierName', 'phone']).ok,
    ).toBe(true);

    const dup = validateCsvHeaders('PRODUCTS', [
      'sourceProductKey',
      'productName',
      'costPrice',
      'sellingPrice',
      'active',
      'sku',
      'SKU',
    ]);
    expect(dup.ok).toBe(false);
    expect(dup.duplicateHeaders).toContain('sku');

    const prohibited = validateCsvHeaders('SUPPLIERS', [
      'sourceSupplierKey',
      'supplierName',
      'supplierBalance',
    ]);
    expect(prohibited.prohibitedHeaders).toContain('supplierbalance');

    expect(() =>
      assertValidCsvHeaders('OPENING_STOCK', ['sourceProductKey', 'quantity']),
    ).toThrow(MigrationContractError);
  });

  it('normalises headers with Unicode NFC and BOM stripping', () => {
    expect(normaliseHeaderCell('\uFEFFsourceSupplierKey')).toBe('sourceSupplierKey');
    expect(normaliseHeaderCell('  product   Name ')).toBe('product Name');
  });

  it('rejects duplicate source keys', () => {
    expect(() => assertNoDuplicateSourceKeys(['A', 'a'], 'sourceSupplierKey')).toThrow(
      /Duplicate/,
    );
  });

  it('parses decimal currency into minor units and rejects unsafe forms', () => {
    expect(parseDecimalCurrencyToMinorUnits('12.50')).toBe(1250);
    expect(parseDecimalCurrencyToMinorUnits('12.5')).toBe(1250);
    expect(parseDecimalCurrencyToMinorUnits('1,234.56')).toBe(123456);
    expect(parseDecimalCurrencyToMinorUnits(0)).toBe(0);

    expect(() => parseDecimalCurrencyToMinorUnits('12.505')).toThrow(/2 decimal/);
    expect(() => parseDecimalCurrencyToMinorUnits('1e2')).toThrow(/scientific/);
    expect(() => parseDecimalCurrencyToMinorUnits('GH₵12.50')).toThrow(/currency symbols/);
    expect(() => parseDecimalCurrencyToMinorUnits('1,23.45')).toThrow(/grouping/);
    expect(() => parseDecimalCurrencyToMinorUnits('')).toThrow(MigrationContractError);
  });

  it('calculates stock value and blocks sourceStockValue mismatch', () => {
    expect(calculateOpeningStockValueMinor(10, 1250)).toBe(12500);
    expect(
      assertSourceStockValueMatches({
        quantityBase: 10,
        unitCostMinor: 1250,
        sourceStockValueRaw: '125.00',
      }),
    ).toBe(12500);
    expect(() =>
      assertSourceStockValueMatches({
        quantityBase: 10,
        unitCostMinor: 1250,
        sourceStockValueRaw: '100.00',
      }),
    ).toThrow(/does not match/);
  });

  it('allows zero quantity and rejects negatives', () => {
    expect(parseNonNegativeIntegerQuantity('0')).toBe(0);
    expect(() => parseNonNegativeIntegerQuantity('-1')).toThrow(/non-negative/);
    expect(() => parseOpeningStockUnitCostToMinorUnits('-1.00')).toThrow(/must not be negative/);
    expect(() => calculateOpeningStockValueMinor(1, -1)).toThrow(/must not be negative/);
    expect(() => calculateOpeningStockValueMinor(-1, 100)).toThrow(/non-negative/);
  });

  it('rejects signed negative zero and returns ordinary zero for valid zeros', () => {
    for (const z of ['0', '0.0', '0.00', '+0'] as const) {
      const v = parseDecimalCurrencyToMinorUnits(z);
      expect(v).toBe(0);
      expect(Object.is(v, -0)).toBe(false);
    }
    for (const nz of ['-0', '-0.0', '-0.00'] as const) {
      expect(() => parseDecimalCurrencyToMinorUnits(nz)).toThrow(/signed negative zero/);
      expect(() => parseOpeningStockUnitCostToMinorUnits(nz)).toThrow();
    }
  });

  it('validates dates, currency, and source keys', () => {
    expect(parseAsOfDate('2026-09-01')).toBe('2026-09-01');
    expect(() => parseAsOfDate('2026-13-01')).toThrow();
    expect(parseReportingCurrency('ghs')).toBe('GHS');
    expect(() => parseReportingCurrency('cedi')).toThrow();
    expect(normaliseSourceSystemKey('Legacy-POS')).toBe('legacy-pos');
    expect(() => normaliseSourceSystemKey('')).toThrow();
    expect(normaliseSourceBusinessKey(' HQ-001 ')).toBe('HQ-001');
  });

  it('sanitises CSV injection on export cells only', () => {
    expect(sanitizeCsvCell('=cmd')).toBe("'=cmd");
    expect(sanitizeCsvCell('plain')).toBe('plain');
  });
});
