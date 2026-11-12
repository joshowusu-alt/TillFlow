import { describe, expect, it } from 'vitest';
import { validateImportRow, type CatalogContext, type ValidatedImportRowInput } from '@/lib/import/import-validation';

function importRow(patch: Partial<ValidatedImportRowInput> = {}): ValidatedImportRowInput {
  return {
    rowNumber: 2,
    name: 'PAINTING CANVAS',
    sku: '',
    barcode: '',
    category: '',
    sellingPricePence: 2400,
    costPricePence: 1200,
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
    ...patch,
  };
}

function catalog(patch: Partial<CatalogContext> = {}): CatalogContext {
  return {
    productNames: new Set(['painting canvas']),
    productNameToId: new Map(),
    barcodes: new Set(['6615116820189']),
    barcodeToProductId: new Map(),
    skus: new Set<string>(),
    categoryNames: new Set(),
    supplierNames: new Set(),
    ...patch,
  };
}

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

  it('preserves the business category name', () => {
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
    expect(result.suggestedCategory).toBe('biscuit');
  });

  it('does not match a different barcode or SKU by product name', () => {
    const seen = { names: new Set<string>(), barcodes: new Set<string>() };
    const options = { seenNamesInFile: seen.names, seenBarcodesInFile: seen.barcodes };
    const first = validateImportRow(importRow({ barcode: '6615116820196' }), catalog(), options);
    const second = validateImportRow(importRow({ barcode: '6615116820257', rowNumber: 3 }), catalog(), options);
    expect(first).toMatchObject({ duplicateKind: 'none', defaultDuplicateAction: 'create' });
    expect(second).toMatchObject({ duplicateKind: 'none', defaultDuplicateAction: 'create' });
    expect(`${first.warnings} ${second.warnings}`).not.toMatch(/appears again|already exists|similar/);

    const matched = validateImportRow(importRow({ barcode: '6615116820189' }), catalog());
    expect(matched).toMatchObject({ duplicateKind: 'barcode', defaultDuplicateAction: 'skip' });

    const newSku = validateImportRow(importRow({ sku: 'NEW-SKU' }), catalog());
    expect(newSku).toMatchObject({ duplicateKind: 'none', defaultDuplicateAction: 'create' });
    const knownSku = validateImportRow(importRow({ sku: 'canvas-a', name: 'Other title' }), catalog({ skus: new Set(['canvas-a']) }));
    expect(knownSku).toMatchObject({ duplicateKind: 'sku', defaultDuplicateAction: 'update' });
  });

  it('still skips a repeated name when the row has no barcode or SKU', () => {
    const seen = { names: new Set<string>(), barcodes: new Set<string>() };
    const options = { seenNamesInFile: seen.names, seenBarcodesInFile: seen.barcodes };
    validateImportRow(importRow({ name: 'Zip Binder' }), null, options);
    const repeated = validateImportRow(importRow({ name: 'Zip Binder', rowNumber: 3 }), null, options);
    expect(repeated.defaultDuplicateAction).toBe('skip');
    expect(repeated.warnings.join(' ')).toContain('appears again');

    const named = validateImportRow(importRow({ name: 'Zip Binder' }), catalog({ productNames: new Set(['zip binder']), barcodes: new Set() }));
    expect(named).toMatchObject({ duplicateKind: 'name_exact', defaultDuplicateAction: 'update' });

    const identified = { names: new Set<string>(), barcodes: new Set<string>() };
    validateImportRow(importRow({ barcode: '111' }), null, { seenNamesInFile: identified.names, seenBarcodesInFile: identified.barcodes });
    const bareAfterBarcode = validateImportRow(importRow({ barcode: '' }), null, { seenNamesInFile: identified.names, seenBarcodesInFile: identified.barcodes });
    expect(bareAfterBarcode.defaultDuplicateAction).toBe('skip');

    const similar = validateImportRow(
      importRow({ name: 'painting canvas pad', barcode: '999' }),
      catalog(),
    );
    expect(similar).toMatchObject({ duplicateKind: 'none', defaultDuplicateAction: 'create' });
    expect(similar.warnings.join(' ')).not.toContain('similar');
  });

  it('still rejects the same barcode twice in one file', () => {
    const seen = { names: new Set<string>(), barcodes: new Set<string>() };
    const options = { seenNamesInFile: seen.names, seenBarcodesInFile: seen.barcodes };
    validateImportRow(importRow({ name: 'First', barcode: '111' }), null, options);
    const duplicate = validateImportRow(importRow({ name: 'Second', barcode: '111', rowNumber: 3 }), null, options);
    expect(duplicate.errors).toContain('Barcode is duplicated in this file.');
    expect(duplicate.defaultDuplicateAction).toBe('skip');
  });
});
