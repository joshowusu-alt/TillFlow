import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** Store-scoped eviction: new helper or catalog wrapper with a second storeId arg. */
const STORE_SCOPED_REVALIDATE =
  /revalidatePosInventory\(|revalidatePosCatalog\([^)\n]+,\s*[^)\n]+\)/;

function assertNoGlobalInventoryTag(source: string, file: string) {
  expect(source, file).not.toMatch(/revalidateTag\(\s*['"]pos-inventory['"]\s*\)/);
  expect(source, file).not.toMatch(/pos-inventory(?!:)/);
}

describe('POS inventory writer source map', () => {
  it('read-only qty writers already pass storeId (do not edit)', () => {
    const sales = read('app/actions/sales.ts');
    expect(sales).toContain('revalidatePosCatalog(businessId, storeId)');
    expect(sales).toContain('revalidatePosCatalog(businessId, data.storeId)');
    expect(sales).toContain('revalidatePosCatalog(businessId, amendedInvoice?.storeId)');
    assertNoGlobalInventoryTag(sales, 'sales.ts');

    const returns = read('app/actions/returns.ts');
    expect(returns).toMatch(/revalidatePosCatalog\(businessId,\s*salesReturn\.storeId/);
    expect(returns).toMatch(/revalidatePosCatalog\(businessId,\s*purchaseInvoice\?\.storeId/);

    const transfers = read('app/actions/transfers.ts');
    expect(transfers).toContain('revalidatePosCatalog(businessId, transfer.fromStoreId)');
    expect(transfers).toContain('revalidatePosCatalog(businessId, transfer.toStoreId)');

    expect(read('app/actions/import-stock.ts')).toContain('revalidatePosCatalog(businessId, store.id)');
    expect(read('app/actions/opening-stock.ts')).toContain('revalidatePosCatalog(businessId, store.id)');
    expect(read('app/actions/inventory.ts')).toMatch(/revalidatePosCatalog\(businessId,\s*storeId\)/);
    expect(read('app/actions/stocktake.ts')).toMatch(/revalidatePosCatalog\(businessId,\s*storeId\)/);
  });

  it('repair inventory qty paths use store-scoped invalidation', () => {
    const repair = read('app/actions/repair.ts');
    expect(repair).toContain('revalidatePosInventory(businessId, storeId)');
    expect(repair).toContain('revalidatePosInventory(businessId, invoice.storeId)');
    expect(repair).toMatch(/repairInventoryAverageCostsAction[\s\S]*revalidatePosInventory\(businessId, storeId\)/);
    expect(repair).toMatch(/ownerVoidSaleAction[\s\S]*revalidatePosInventory\(businessId, invoice\.storeId\)/);
    expect(repair).not.toMatch(/revalidatePosCatalog\(businessId\);\s*\n\s*revalidatePath\('\/inventory'\)/);
    expect(repair).not.toMatch(/revalidatePosCatalog\(businessId\);\s*\n\s*revalidateTag\('reports'\)/);
    assertNoGlobalInventoryTag(repair, 'repair.ts');
  });

  it('reset-purchase-data invalidates each store, not a global inventory tag', () => {
    const reset = read('app/actions/reset-purchase-data.ts');
    expect(reset).toContain('revalidatePosInventory(businessId, store.id)');
    expect(reset).toMatch(/store\.findMany/);
    expect(reset).not.toMatch(/revalidateTag\(\s*['"]pos-inventory['"]\s*\)/);
    assertNoGlobalInventoryTag(reset, 'reset-purchase-data.ts');
  });

  it('products opening-stock path passes storeId; other sites stay product-only', () => {
    const products = read('app/actions/products.ts');
    expect(products).toContain('revalidatePosInventory(businessId, openingStockStoreId)');
    expect(products).toMatch(/createPurchase\([\s\S]*storeId: store\.id[\s\S]*revalidatePosInventory\(businessId, openingStockStoreId\)/);
    expect(products).toContain('revalidatePosCatalog(businessId)');
    assertNoGlobalInventoryTag(products, 'products.ts');
  });

  it('reorder does not write inventory qty; products tag is enough', () => {
    const reorder = read('app/actions/reorder.ts');
    expect(reorder).not.toMatch(/inventoryBalance|createPurchase|upsertInventory|qtyOnHandBase/);
    expect(reorder).toContain('revalidatePosCatalog(businessId)');
    expect(reorder).not.toMatch(STORE_SCOPED_REVALIDATE);
    assertNoGlobalInventoryTag(reorder, 'reorder.ts');
  });
});
