import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { recordSaleStockMovements } from './sale-stock-movements';

describe('required sale stock evidence', () => {
  const row = (qtyBase: number): Prisma.StockMovementCreateManyInput => ({
    storeId: 'branch', productId: 'product', qtyBase, type: 'SALE', valuePence: qtyBase * 100,
  });
  it('records a continuous quantity chain for the same product sold in multiple units', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { stockMovement: { createMany } } as unknown as Prisma.TransactionClient;
    await recordSaleStockMovements(tx, [row(-2), row(-3)], new Map([['product', { qtyOnHandBase: 10 }]]));
    expect(createMany.mock.calls[0][0].data).toEqual([
      { ...row(-2), beforeQtyBase: 10, afterQtyBase: 8 },
      { ...row(-3), beforeQtyBase: 8, afterQtyBase: 5 },
    ]);
  });
  it('tracks an amendment restoration before its replacement without changing the recorded values', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { stockMovement: { createMany } } as unknown as Prisma.TransactionClient;
    await recordSaleStockMovements(tx, [row(1), row(-2)], new Map([['product', { qtyOnHandBase: 4 }]]));
    expect(createMany.mock.calls[0][0].data).toEqual([
      { ...row(1), beforeQtyBase: 4, afterQtyBase: 5 },
      { ...row(-2), beforeQtyBase: 5, afterQtyBase: 3 },
    ]);
  });
  it('fails the enclosing transaction if even one required movement is missing', async () => {
    const tx = { stockMovement: { createMany: vi.fn().mockResolvedValue({ count: 1 }) } } as unknown as Prisma.TransactionClient;
    await expect(recordSaleStockMovements(tx, [row(-1), row(-1)], new Map()))
      .rejects.toThrow('Unable to record all sale stock movements');
  });
});
