import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkoutContextTag,
  posCategoriesTag,
  posCustomersTag,
  posInventoryTag,
  posProductsTag,
  posShiftsTag,
  posTillsTag,
} from '@/lib/cache/pos-tags';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('tenant-scoped POS cache tags', () => {
  it('scopes products and inventory per business/store', () => {
    expect(posProductsTag('biz-a')).toBe('pos-products:biz-a');
    expect(posProductsTag('biz-a')).not.toBe(posProductsTag('biz-b'));
    expect(posInventoryTag('biz-a', 'store-1')).toBe('pos-inventory:biz-a:store-1');
    expect(posInventoryTag('biz-a', 'store-1')).not.toBe(posInventoryTag('biz-a', 'store-2'));
    expect(posInventoryTag('biz-a', 'store-1')).not.toBe(posInventoryTag('biz-b', 'store-1'));
  });

  it('scopes tills, shifts, categories, customers, and checkout context', () => {
    expect(posTillsTag('biz-a', 'store-1')).toBe('pos-tills:biz-a:store-1');
    expect(posShiftsTag('biz-a', 'store-1')).toBe('pos-shifts:biz-a:store-1');
    expect(posCategoriesTag('biz-a')).toBe('pos-categories:biz-a');
    expect(posCustomersTag('biz-a')).toBe('pos-customers:biz-a');
    expect(checkoutContextTag('biz-a')).toBe('checkout-context:biz-a');
  });

  it('inventory writers pass storeId so pos-inventory:{biz}:{store} is evicted', () => {
    expect(read('app/actions/returns.ts')).toMatch(/revalidatePosCatalog\(businessId,\s*salesReturn\.storeId/);
    expect(read('app/actions/returns.ts')).toMatch(/revalidatePosCatalog\(businessId,\s*purchaseInvoice\?\.storeId/);
    expect(read('app/actions/transfers.ts')).toContain('revalidatePosCatalog(businessId, transfer.fromStoreId)');
    expect(read('app/actions/transfers.ts')).toContain('revalidatePosCatalog(businessId, transfer.toStoreId)');
    expect(read('app/actions/opening-stock.ts')).toContain('revalidatePosCatalog(businessId, store.id)');
    expect(read('app/actions/import-stock.ts')).toContain('revalidatePosCatalog(businessId, store.id)');
    expect(read('app/actions/sales.ts')).toContain('revalidatePosCatalog(businessId, amendedInvoice?.storeId)');
  });
});
