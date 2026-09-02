import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { revalidateTag } from 'next/cache';
import {
  checkoutContextTag,
  posCategoriesTag,
  posCustomersTag,
  posInventoryTag,
  posProductsTag,
  posShiftsTag,
  posTillsTag,
  revalidatePosCatalog,
  revalidatePosInventory,
} from '@/lib/cache/pos-tags';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

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

  it('revalidatePosInventory requires both ids and evicts products + store inventory', () => {
    vi.mocked(revalidateTag).mockClear();
    revalidatePosInventory('biz-a', 'store-1');
    expect(revalidateTag).toHaveBeenCalledWith('pos-products:biz-a');
    expect(revalidateTag).toHaveBeenCalledWith('pos-inventory:biz-a:store-1');
    expect(revalidateTag).not.toHaveBeenCalledWith('pos-inventory');
  });

  it('revalidatePosInventory throws when storeId is missing', () => {
    expect(() => revalidatePosInventory('biz-a', '')).toThrow(/storeId/);
    expect(() => revalidatePosInventory('biz-a', '   ')).toThrow(/storeId/);
    expect(() => revalidatePosInventory('', 'store-1')).toThrow(/businessId/);
  });

  it('revalidatePosCatalog without storeId only evicts products', () => {
    vi.mocked(revalidateTag).mockClear();
    revalidatePosCatalog('biz-a');
    expect(revalidateTag).toHaveBeenCalledWith('pos-products:biz-a');
    expect(revalidateTag).not.toHaveBeenCalledWith(expect.stringMatching(/^pos-inventory/));
  });

  it('revalidatePosCatalog with storeId delegates to store-scoped inventory eviction', () => {
    vi.mocked(revalidateTag).mockClear();
    revalidatePosCatalog('biz-a', 'store-1');
    expect(revalidateTag).toHaveBeenCalledWith('pos-products:biz-a');
    expect(revalidateTag).toHaveBeenCalledWith('pos-inventory:biz-a:store-1');
  });
});
