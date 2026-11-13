import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { executeInventoryBalanceUpsert, batchUpsertInventoryBalances } from '@/lib/services/shared/inventory-utils';

describe('batchUpsertInventoryBalances', () => {
  it('writes every balance in one INSERT ... ON CONFLICT', async () => {
    const executeRaw = vi.fn().mockResolvedValue(2);
    await executeInventoryBalanceUpsert(
      { $executeRaw: executeRaw },
      'store-1',
      [
        { productId: 'a', qtyOnHandBase: 1, avgCostBasePence: 5, knownValuePence: 5, unvaluedQtyBase: 0 },
        { productId: 'b', qtyOnHandBase: 2, avgCostBasePence: 10, knownValuePence: 20, unvaluedQtyBase: 0 },
      ],
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const statement = executeRaw.mock.calls[0][0];
    const text = Array.isArray(statement?.strings) ? statement.strings.join(' ') : String(statement);
    expect(text).toContain('INSERT INTO "InventoryBalance"');
    expect(text).toContain('ON CONFLICT ("storeId", "productId")');
  });

  it('uses one upsert per balance when the Postgres batch path is unavailable', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    await batchUpsertInventoryBalances(
      { inventoryBalance: { upsert } },
      'store-1',
      [
        { productId: 'b', qtyOnHandBase: 2, avgCostBasePence: 10, knownValuePence: 20, unvaluedQtyBase: 0 },
        { productId: 'a', qtyOnHandBase: 3, avgCostBasePence: 4, knownValuePence: 12, unvaluedQtyBase: 0 },
      ],
    );
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls.map((call) => call[0].create.productId)).toEqual(['a', 'b']);
  });
});
