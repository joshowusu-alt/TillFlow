import { describe, expect, it } from 'vitest';
import { reconcileCatalogue, reconcileOpeningStock } from '@/lib/migration/reconcile';
import type { CatalogueRow, OpeningStockRow } from '@/lib/migration/types';

describe('migration reconciliation', () => {
  it('summarises catalogue control totals', () => {
    const rows: CatalogueRow[] = [
      {
        rowNumber: 2,
        legacyProductId: 'P1',
        productName: 'A',
        description: '',
        category: 'Food',
        sku: '',
        primaryBarcode: '1',
        unitOfMeasure: 'Each',
        sellingPrice: 1000,
        costPrice: 400,
        preferredSupplierLegacyId: 'S1',
        active: true,
        reorderLevel: 0,
        raw: {},
      },
      {
        rowNumber: 3,
        legacyProductId: 'P2',
        productName: 'B',
        description: '',
        category: 'Food',
        sku: '',
        primaryBarcode: '',
        unitOfMeasure: 'Each',
        sellingPrice: 2000,
        costPrice: 0,
        preferredSupplierLegacyId: '',
        active: false,
        reorderLevel: 0,
        raw: {},
      },
    ];
    const r = reconcileCatalogue(rows);
    expect(r.rowsValid).toBe(2);
    expect(r.distinctCategories).toBe(1);
    expect(r.withBarcode).toBe(1);
    expect(r.withCost).toBe(1);
    expect(r.sumSellingPrice).toBe(3000);
    expect(r.inactiveCount).toBe(1);
  });

  it('summarises opening-stock value without inventing cost', () => {
    const rows: OpeningStockRow[] = [
      {
        rowNumber: 2,
        legacyProductId: 'P1',
        branchCode: 'MAIN',
        quantity: 10,
        unitCost: 100,
        effectiveAt: '',
        reference: '',
        raw: {},
      },
      {
        rowNumber: 3,
        legacyProductId: 'P2',
        branchCode: 'MAIN',
        quantity: 5,
        unitCost: null,
        effectiveAt: '',
        reference: '',
        raw: {},
      },
    ];
    const r = reconcileOpeningStock(rows);
    expect(r.totalQuantity).toBe(15);
    expect(r.valuedLines).toBe(1);
    expect(r.unvaluedLines).toBe(1);
    expect(r.totalStockValue).toBe(1000);
    expect(r.distinctBranchCodes).toBe(1);
  });
});
