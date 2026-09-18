import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    store: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    stockTransfer: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    inventoryBalance: { findMany: vi.fn(), findFirst: vi.fn() },
    stockMovement: { createMany: vi.fn() },
    user: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/accounting', () => ({
  ACCOUNT_CODES: { inventory: '1300' },
  postJournalEntry: vi.fn(),
}));
vi.mock('./shared', () => ({
  resolveAvgCost: () => 100,
  upsertInventoryBalance: vi.fn(),
}));

import { approveAndCompleteStockTransfer, requestStockTransfer } from './stock-transfers';

const STORE_A = 'store-a-created-first';
const STORE_B = 'store-b-selected';

describe('transfer Store B → Store A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a B → A request and never lets the user pick a different source', async () => {
    prismaMock.store.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === STORE_A || where.id === STORE_B) return { id: where.id };
      return null;
    });
    prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);
    prismaMock.stockTransfer.create.mockResolvedValue({
      id: 'xfer-ba',
      fromStoreId: STORE_B,
      toStoreId: STORE_A,
      lines: [{ productId: 'prod-1', qtyBase: 2 }],
    });

    const transfer = await requestStockTransfer({
      businessId: 'biz-1',
      requestedByUserId: 'user-1',
      fromStoreId: STORE_B,
      toStoreId: STORE_A,
      lines: [{ productId: 'prod-1', qtyBase: 2 }],
    });

    expect(transfer.fromStoreId).toBe(STORE_B);
    expect(transfer.toStoreId).toBe(STORE_A);
    await expect(
      requestStockTransfer({
        businessId: 'biz-1',
        requestedByUserId: 'user-1',
        fromStoreId: 'ALL',
        toStoreId: STORE_A,
        lines: [{ productId: 'prod-1', qtyBase: 2 }],
      }),
    ).rejects.toThrow(/specific authorised branches/);
    await expect(
      requestStockTransfer({
        businessId: 'biz-1',
        requestedByUserId: 'user-1',
        fromStoreId: STORE_B,
        toStoreId: STORE_B,
        lines: [{ productId: 'prod-1', qtyBase: 2 }],
      }),
    ).rejects.toThrow(/must be different/);
  });

  it('moves stock out of B and into A only, and refuses a replay', async () => {
    const { upsertInventoryBalance } = await import('./shared');
    prismaMock.user.findFirst.mockResolvedValue({ id: 'mgr-1' });
    prismaMock.stockTransfer.findFirst.mockResolvedValue({
      id: 'xfer-ba',
      businessId: 'biz-1',
      fromStoreId: STORE_B,
      toStoreId: STORE_A,
      status: 'PENDING',
      lines: [{ productId: 'prod-1', qtyBase: 2 }],
    });
    prismaMock.inventoryBalance.findMany.mockResolvedValue([
      { productId: 'prod-1', qtyOnHandBase: 10, avgCostBasePence: 100 },
    ]);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) =>
      fn(prismaMock),
    );
    prismaMock.inventoryBalance.findFirst.mockResolvedValue({
      qtyOnHandBase: 1,
      avgCostBasePence: 100,
    });
    prismaMock.stockTransfer.update.mockResolvedValue({
      id: 'xfer-ba',
      fromStoreId: STORE_B,
      toStoreId: STORE_A,
      lines: [{ productId: 'prod-1', qtyBase: 2 }],
    });

    await approveAndCompleteStockTransfer({
      businessId: 'biz-1',
      transferId: 'xfer-ba',
      approvedByUserId: 'mgr-1',
    });

    expect(upsertInventoryBalance).toHaveBeenCalledWith(prismaMock, STORE_B, 'prod-1', 8, 100);
    expect(upsertInventoryBalance).toHaveBeenCalledWith(prismaMock, STORE_A, 'prod-1', 3, expect.any(Number));
    expect(prismaMock.stockMovement.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ storeId: STORE_B, qtyBase: -2, type: 'TRANSFER_OUT' }),
        expect.objectContaining({ storeId: STORE_A, qtyBase: 2, type: 'TRANSFER_IN' }),
      ]),
    });

    prismaMock.stockTransfer.findFirst.mockResolvedValue({
      id: 'xfer-ba',
      businessId: 'biz-1',
      fromStoreId: STORE_B,
      toStoreId: STORE_A,
      status: 'COMPLETED',
      lines: [{ productId: 'prod-1', qtyBase: 2 }],
    });
    await expect(
      approveAndCompleteStockTransfer({
        businessId: 'biz-1',
        transferId: 'xfer-ba',
        approvedByUserId: 'mgr-1',
      }),
    ).rejects.toThrow(/Only pending transfers/);
  });

  it('locks the UI source to the operational store and repeats the guard on approval', () => {
    const page = readFileSync(join(process.cwd(), 'app/(protected)/transfers/page.tsx'), 'utf8');
    const actions = readFileSync(join(process.cwd(), 'app/actions/transfers.ts'), 'utf8');
    expect(page).toContain('name="fromStoreId"');
    expect(page).toContain('type="hidden"');
    expect(page).not.toContain('<select className="input" name="fromStoreId"');
    expect(actions).toContain('requireSelectedStoreContext');
    expect(actions).toContain('existing.fromStoreId');
  });
});
