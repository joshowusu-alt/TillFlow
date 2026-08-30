import { describe, expect, it } from 'vitest';
import {
  checkoutContextTag,
  posCategoriesTag,
  posCustomersTag,
  posInventoryTag,
  posProductsTag,
  posShiftsTag,
  posTillsTag,
} from '@/lib/cache/pos-tags';

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
});
