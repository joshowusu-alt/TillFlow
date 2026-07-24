/**
 * Focused coverage for DB-side stock-gap WHERE builders and count/list APIs.
 * Classification math remains in improve-records-classify.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('countStockGapSignals — DB-side counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues three product.count queries with shared eligibility where clauses', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { countStockGapSignals } = await import('@/lib/improve-records-load');
    const now = new Date('2026-07-15T00:00:00.000Z');

    vi.mocked(prisma.product.count)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(88);

    const result = await countStockGapSignals('biz-1', now);

    expect(result).toEqual({
      productsNeedingOpeningQtyCount: 12,
      soldWithoutConfirmedQtyCount: 4,
      unusedCatalogueProductCount: 88,
    });
    expect(prisma.product.count).toHaveBeenCalledTimes(3);

    const genuineWhere = vi.mocked(prisma.product.count).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    const unusedWhere = vi.mocked(prisma.product.count).mock.calls[2]?.[0]?.where as Record<
      string,
      unknown
    >;

    expect(genuineWhere.businessId).toBe('biz-1');
    expect(genuineWhere.active).toBe(true);
    expect(genuineWhere.sellingPriceBasePence).toEqual({ gt: 0 });
    expect(genuineWhere.inventoryBalances).toEqual({ none: {} });
    expect(genuineWhere.OR).toBeDefined();

    expect(unusedWhere.createdAt).toEqual({ lt: new Date('2026-07-01T00:00:00.000Z') });
    expect(unusedWhere.salesLines).toEqual({
      none: {
        salesInvoice: {
          businessId: 'biz-1',
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
    });
    expect(unusedWhere.purchaseLines).toEqual({
      none: { purchaseInvoice: { businessId: 'biz-1' } },
    });
  });

  it('does not materialise product ID lists when counting', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { countStockGapSignals } = await import('@/lib/improve-records-load');

    vi.mocked(prisma.product.count).mockResolvedValue(0);

    await countStockGapSignals('biz-1');

    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});

describe('listStockGapSignals — ID lists share the same where builders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns IDs from findMany using unused / genuine / sold where clauses', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { listStockGapSignals } = await import('@/lib/improve-records-load');
    const now = new Date('2026-07-15T00:00:00.000Z');

    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([{ id: 'g1' }] as never)
      .mockResolvedValueOnce([{ id: 'g1' }] as never)
      .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }] as never);

    const result = await listStockGapSignals('biz-1', now);

    expect(result.genuineGapProductIds).toEqual(['g1']);
    expect(result.soldWithoutConfirmedQtyIds).toEqual(['g1']);
    expect(result.unusedCatalogueProductIds).toEqual(['u1', 'u2']);
    expect(result.productsNeedingOpeningQtyCount).toBe(1);
    expect(result.unusedCatalogueProductCount).toBe(2);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(3);
  });
});

describe('isUnusedCatalogueProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks a single product id against the unused-catalogue where clause', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { isUnusedCatalogueProduct } = await import('@/lib/improve-records-load');

    vi.mocked(prisma.product.count).mockResolvedValueOnce(1);

    await expect(isUnusedCatalogueProduct('biz-1', 'p-1')).resolves.toBe(true);

    const where = vi.mocked(prisma.product.count).mock.calls[0]?.[0]?.where as Record<
      string,
      unknown
    >;
    expect(where.id).toBe('p-1');
    expect(where.businessId).toBe('biz-1');
    expect(where.inventoryBalances).toEqual({ none: {} });
  });
});
