/**
 * Focused coverage for the Prisma-query layer behind the Home "unused
 * catalogue" recommendation (`lib/improve-records-load.ts`). The pure
 * classification math is covered by `improve-records-classify.test.ts`;
 * this file proves the surrounding queries apply the right filters —
 * tenant isolation, active/priced-only, and confirmed-quantity-history
 * exclusions — before that math ever runs.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    salesInvoiceLine: { findMany: vi.fn() },
    stockMovement: { findMany: vi.fn() },
    purchaseInvoiceLine: { findMany: vi.fn() },
  },
}));

describe('listStockGapSignals — query-level filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the candidate query to the caller business, active priced products with no balance', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');

    vi.mocked(prisma.store.findMany).mockResolvedValueOnce([{ id: 'store-1' }] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([] as never);

    await listStockGapSignals('biz-1', new Date('2026-07-15T00:00:00.000Z'));

    const call = vi.mocked(prisma.product.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.businessId).toBe('biz-1');
    expect(call.where.active).toBe(true);
    expect(call.where.sellingPriceBasePence).toEqual({ gt: 0 });
    expect(call.where.inventoryBalances).toEqual({ none: {} });
  });

  it('returns the empty result and skips downstream queries when there are no no-balance candidates', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');

    vi.mocked(prisma.store.findMany).mockResolvedValueOnce([{ id: 'store-1' }] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([] as never);

    const result = await listStockGapSignals('biz-1');

    expect(result).toEqual({
      productsNeedingOpeningQtyCount: 0,
      soldWithoutConfirmedQtyCount: 0,
      unusedCatalogueProductCount: 0,
      genuineGapProductIds: [],
      soldWithoutConfirmedQtyIds: [],
      unusedCatalogueProductIds: [],
    });
    expect(prisma.salesInvoiceLine.findMany).not.toHaveBeenCalled();
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
    expect(prisma.purchaseInvoiceLine.findMany).not.toHaveBeenCalled();
  });

  it('classifies an aged, never-traded candidate as unused-catalogue and excludes it from the genuine-gap list', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');
    const now = new Date('2026-07-15T00:00:00.000Z');
    const aged = new Date('2026-01-01T00:00:00.000Z');

    vi.mocked(prisma.store.findMany).mockResolvedValueOnce([{ id: 'store-1' }] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([
      { id: 'p-aged-unused', createdAt: aged },
    ] as never);
    vi.mocked(prisma.salesInvoiceLine.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.stockMovement.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.purchaseInvoiceLine.findMany).mockResolvedValueOnce([] as never);

    const result = await listStockGapSignals('biz-1', now);

    expect(result.unusedCatalogueProductIds).toEqual(['p-aged-unused']);
    expect(result.unusedCatalogueProductCount).toBe(1);
    expect(result.genuineGapProductIds).toEqual([]);
  });

  it('excludes a candidate created within the grace period, even with zero sales/stock history', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');
    const now = new Date('2026-07-15T00:00:00.000Z');
    const recentlyImported = new Date('2026-07-10T00:00:00.000Z'); // 5 days old

    vi.mocked(prisma.store.findMany).mockResolvedValueOnce([{ id: 'store-1' }] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([
      { id: 'p-recent', createdAt: recentlyImported },
    ] as never);
    vi.mocked(prisma.salesInvoiceLine.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.stockMovement.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.purchaseInvoiceLine.findMany).mockResolvedValueOnce([] as never);

    const result = await listStockGapSignals('biz-1', now);

    expect(result.unusedCatalogueProductIds).toEqual([]);
    expect(result.genuineGapProductIds).toEqual(['p-recent']);
  });

  it('excludes a candidate with historical purchase-line activity (confirmed quantity history)', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');
    const now = new Date('2026-07-15T00:00:00.000Z');
    const aged = new Date('2026-01-01T00:00:00.000Z');

    vi.mocked(prisma.store.findMany).mockResolvedValueOnce([{ id: 'store-1' }] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([
      { id: 'p-purchased-no-balance', createdAt: aged },
    ] as never);
    vi.mocked(prisma.salesInvoiceLine.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.stockMovement.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.purchaseInvoiceLine.findMany).mockResolvedValueOnce([
      { productId: 'p-purchased-no-balance' },
    ] as never);

    const result = await listStockGapSignals('biz-1', now);

    expect(result.unusedCatalogueProductIds).toEqual([]);
    expect(result.genuineGapProductIds).toEqual([]);
    expect(result.productsNeedingOpeningQtyCount).toBe(0);
  });

  it('treats an aged candidate with sales as a genuine stock gap, not unused catalogue', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');
    const now = new Date('2026-07-15T00:00:00.000Z');
    const aged = new Date('2026-01-01T00:00:00.000Z');

    vi.mocked(prisma.store.findMany).mockResolvedValueOnce([{ id: 'store-1' }] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([
      { id: 'p-sold-no-stock', createdAt: aged },
    ] as never);
    vi.mocked(prisma.salesInvoiceLine.findMany).mockResolvedValueOnce([
      { productId: 'p-sold-no-stock' },
    ] as never);
    vi.mocked(prisma.stockMovement.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.purchaseInvoiceLine.findMany).mockResolvedValueOnce([] as never);

    const result = await listStockGapSignals('biz-1', now);

    expect(result.genuineGapProductIds).toEqual(['p-sold-no-stock']);
    expect(result.soldWithoutConfirmedQtyIds).toEqual(['p-sold-no-stock']);
    expect(result.unusedCatalogueProductIds).toEqual([]);
  });

  it('only queries stock movements for stores belonging to the caller business', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');

    vi.mocked(prisma.store.findMany).mockResolvedValueOnce([{ id: 'store-own-biz' }] as never);
    vi.mocked(prisma.product.findMany).mockResolvedValueOnce([
      { id: 'p-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ] as never);
    vi.mocked(prisma.salesInvoiceLine.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.stockMovement.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.purchaseInvoiceLine.findMany).mockResolvedValueOnce([] as never);

    await listStockGapSignals('biz-1');

    const storeCall = vi.mocked(prisma.store.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(storeCall.where.businessId).toBe('biz-1');

    const movementCall = vi.mocked(prisma.stockMovement.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(movementCall.where.storeId).toEqual({ in: ['store-own-biz'] });
  });
});
