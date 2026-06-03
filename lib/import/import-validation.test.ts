import { describe, expect, it } from 'vitest';
import { validateImportRow } from '@/lib/import/import-validation';

describe('import row validation', () => {
  it('blocks missing product name', () => {
    const result = validateImportRow({
      rowNumber: 2,
      name: '',
      sku: '',
      barcode: '',
      category: 'Drinks',
      sellingPricePence: 300,
      costPricePence: 220,
      quantity: 10,
      baseUnitName: 'Piece',
      packUnitName: '',
      packSize: 0,
      qtyInName: 'Piece',
      supplierName: '',
      reorderPoint: 0,
      storefrontPublished: false,
      imageUrl: '',
      notes: '',
    });
    expect(result.errors.some((e) => e.includes('Product name'))).toBe(true);
  });

  it('blocks invalid selling price', () => {
    const result = validateImportRow({
      rowNumber: 3,
      name: 'Awake Water',
      sku: '',
      barcode: '',
      category: '',
      sellingPricePence: -1,
      costPricePence: 200,
      quantity: 5,
      baseUnitName: 'Bottle',
      packUnitName: '',
      packSize: 0,
      qtyInName: 'Bottle',
      supplierName: '',
      reorderPoint: 0,
      storefrontPublished: false,
      imageUrl: '',
      notes: '',
    });
    expect(result.errors.some((e) => e.includes('Selling price'))).toBe(true);
  });

  it('warns when selling below cost', () => {
    const result = validateImportRow({
      rowNumber: 4,
      name: 'Promo Item',
      sku: '',
      barcode: '',
      category: '',
      sellingPricePence: 100,
      costPricePence: 200,
      quantity: 1,
      baseUnitName: 'Piece',
      packUnitName: '',
      packSize: 0,
      qtyInName: 'Piece',
      supplierName: '',
      reorderPoint: 0,
      storefrontPublished: false,
      imageUrl: '',
      notes: '',
    });
    expect(result.warnings.some((w) => w.includes('lower than cost'))).toBe(true);
  });

  it('detects duplicate barcode in catalogue', () => {
    const result = validateImportRow(
      {
        rowNumber: 5,
        name: 'New Product',
        sku: '',
        barcode: '600123',
        category: '',
        sellingPricePence: 500,
        costPricePence: 400,
        quantity: 1,
        baseUnitName: 'Piece',
        packUnitName: '',
        packSize: 0,
        qtyInName: 'Piece',
        supplierName: '',
        reorderPoint: 0,
        storefrontPublished: false,
        imageUrl: '',
        notes: '',
      },
      {
        productNames: new Set(),
        productNameToId: new Map(),
        barcodes: new Set(['600123']),
        barcodeToProductId: new Map([['600123', 'p1']]),
        skus: new Set(),
        categoryNames: new Set(),
        supplierNames: new Set(),
      }
    );
    expect(result.duplicateKind).toBe('barcode');
    expect(result.defaultDuplicateAction).toBe('skip');
  });

  it('suggests cleaned category names', () => {
    const result = validateImportRow({
      rowNumber: 6,
      name: 'Oreo',
      sku: '',
      barcode: '',
      category: 'biscuit',
      sellingPricePence: 500,
      costPricePence: 400,
      quantity: 12,
      baseUnitName: 'Pack',
      packUnitName: '',
      packSize: 0,
      qtyInName: 'Pack',
      supplierName: '',
      reorderPoint: 0,
      storefrontPublished: false,
      imageUrl: '',
      notes: '',
    });
    expect(result.suggestedCategory).toBe('Biscuits & snacks');
  });
});
