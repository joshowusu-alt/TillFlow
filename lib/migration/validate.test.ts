import { describe, expect, it } from 'vitest';
import { emptyValidationState, validateRawRow } from '@/lib/migration/validate';
import { templateCsv } from '@/lib/migration/contract';
import { parseMigrationCsv } from '@/lib/migration/parse';

describe('migration row validation', () => {
  it('accepts a valid catalogue row', () => {
    const state = emptyValidationState();
    const result = validateRawRow(
      'CATALOGUE',
      2,
      {
        legacyProductId: 'P1',
        productName: 'Rice 5kg',
        description: '',
        category: 'Groceries',
        sku: 'SKU1',
        primaryBarcode: '123',
        unitOfMeasure: 'Each',
        sellingPrice: '10.00',
        costPrice: '6.00',
        preferredSupplierLegacyId: 'S1',
        active: 'true',
        reorderLevel: '2',
      },
      state,
    );
    expect(result.ok).toBe(true);
    expect(result.row).toMatchObject({
      legacyProductId: 'P1',
      sellingPrice: 1000,
      costPrice: 600,
    });
  });

  it('rejects missing selling price and duplicate legacy ids', () => {
    const state = emptyValidationState();
    const first = validateRawRow(
      'CATALOGUE',
      2,
      {
        legacyProductId: 'P1',
        productName: 'A',
        unitOfMeasure: 'Each',
        sellingPrice: '1',
        costPrice: '',
        primaryBarcode: '',
        category: '',
        sku: '',
        description: '',
        preferredSupplierLegacyId: '',
        active: '',
        reorderLevel: '',
      },
      state,
    );
    expect(first.ok).toBe(true);

    const dup = validateRawRow(
      'CATALOGUE',
      3,
      {
        legacyProductId: 'P1',
        productName: 'B',
        unitOfMeasure: 'Each',
        sellingPrice: '',
        costPrice: '',
        primaryBarcode: '',
        category: '',
        sku: '',
        description: '',
        preferredSupplierLegacyId: '',
        active: '',
        reorderLevel: '',
      },
      state,
    );
    expect(dup.ok).toBe(false);
    expect(dup.exceptions.some((e) => e.code === 'DUPLICATE_LEGACY_PRODUCT_ID')).toBe(true);
    expect(dup.exceptions.some((e) => e.code === 'MISSING_SELLING_PRICE')).toBe(true);
  });

  it('requires explicit zero for opening stock quantity', () => {
    const state = emptyValidationState();
    const missing = validateRawRow(
      'OPENING_STOCK',
      2,
      {
        legacyProductId: 'P1',
        branchCode: 'MAIN',
        unitCost: '1',
        effectiveAt: '',
        reference: '',
      },
      state,
    );
    expect(missing.ok).toBe(false);
    expect(missing.exceptions.some((e) => e.code === 'MISSING_QUANTITY')).toBe(true);

    const zero = validateRawRow(
      'OPENING_STOCK',
      3,
      {
        legacyProductId: 'P2',
        branchCode: 'MAIN',
        quantity: '0',
        unitCost: '',
        effectiveAt: '',
        reference: '',
      },
      state,
    );
    expect(zero.ok).toBe(true);
    expect(zero.row).toMatchObject({ quantity: 0, unitCost: null });
  });

  it('marks supplier active as unsupported warning', () => {
    const state = emptyValidationState();
    const result = validateRawRow(
      'SUPPLIERS',
      2,
      {
        legacySupplierId: 'S1',
        supplierName: 'Acme',
        contactName: '',
        phone: '',
        email: '',
        address: '',
        active: 'false',
      },
      state,
    );
    expect(result.ok).toBe(true);
    expect(result.exceptions.some((e) => e.code === 'SUPPLIER_ACTIVE_UNSUPPORTED')).toBe(true);
  });

  it('parses the published template example rows', () => {
    for (const kind of ['CATALOGUE', 'SUPPLIERS', 'OPENING_STOCK'] as const) {
      const parsed = parseMigrationCsv(templateCsv(kind), kind);
      expect(parsed.missingRequiredHeaders).toEqual([]);
      const state = emptyValidationState();
      const result = validateRawRow(kind, parsed.rows[0].rowNumber, parsed.rows[0].raw, state);
      expect(result.ok, kind).toBe(true);
    }
  });
});
