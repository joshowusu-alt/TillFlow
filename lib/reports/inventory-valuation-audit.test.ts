import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  store: { findMany: vi.fn() },
  inventoryBalance: { findMany: vi.fn() },
  salesInvoiceLine: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getIncompleteStockSnapshot } from './incomplete-stock';
import { resolveAuthoritativeLineCost } from './margin-line';

describe('inventory valuation audit: historical cost evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.store.findMany.mockResolvedValue([{ id: 'review-store' }]);
    db.inventoryBalance.findMany.mockResolvedValue([]);
  });

  it('retains the historical warning after a current default cost is added', async () => {
    db.salesInvoiceLine.findMany.mockResolvedValue([{
      productId: 'sold-without-cost',
      product: { defaultCostBasePence: 500, inventoryBalances: [] },
    }]);
    const disclosure = await getIncompleteStockSnapshot('review-business');
    const historicalCost = resolveAuthoritativeLineCost({
      lineSubtotalPence: 1000, lineDiscountPence: 0, promoDiscountPence: 0,
      lineCostPence: 0, qtyBase: 1, defaultCostBasePence: 500,
    });
    expect(disclosure.profitMayBeIncomplete).toBe(true);
    expect(disclosure.stockValueIncomplete).toBe(false);
    expect(historicalCost.authoritative).toBe(false);
  });

  it('retains the warning when cost exists only in another branch', async () => {
    db.salesInvoiceLine.findMany.mockResolvedValue([{
      productId: 'sold-without-cost',
      product: { defaultCostBasePence: 0, inventoryBalances: [{ avgCostBasePence: 500 }] },
    }]);
    const disclosure = await getIncompleteStockSnapshot('review-business');
    expect(disclosure.soldWithoutCostProductIds).toEqual(['sold-without-cost']);
    expect(resolveAuthoritativeLineCost({
      lineSubtotalPence: 1000, lineDiscountPence: 0, promoDiscountPence: 0,
      lineCostPence: 0, qtyBase: 1,
    }).authoritative).toBe(false);
  });

  it('includes inactive historical products and excludes removed sales in its tenant-scoped query', async () => {
    db.salesInvoiceLine.findMany.mockResolvedValue([{ productId: 'inactive-product' }]);
    await getIncompleteStockSnapshot('review-business');
    expect(db.salesInvoiceLine.findMany).toHaveBeenCalledWith({
      where: { lineCostPence: { lte: 0 }, salesInvoice: {
        businessId: 'review-business', paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      } }, select: { productId: true }, distinct: ['productId'],
    });
  });

  it('keeps valid stock complete and deduplicates missing-cost products across stock and sales', async () => {
    db.inventoryBalance.findMany.mockResolvedValue([
      { productId: 'valued', qtyOnHandBase: 10, avgCostBasePence: 500, product: { defaultCostBasePence: 0 } },
      { productId: 'missing', qtyOnHandBase: 3, avgCostBasePence: 0, product: { defaultCostBasePence: 0 } },
    ]);
    db.salesInvoiceLine.findMany.mockResolvedValue([{ productId: 'missing' }, { productId: 'missing' }]);
    const result = await getIncompleteStockSnapshot('review-business');
    expect(result.unvaluedQtyBase).toBe(3);
    expect(result.allMissingCostProductIds).toEqual(['missing']);
    expect(result.missingCostProductCount).toBe(1);
  });

  it('does not warn when all stored sale costs are supported', async () => {
    db.salesInvoiceLine.findMany.mockResolvedValue([]);
    expect((await getIncompleteStockSnapshot('review-business')).profitMayBeIncomplete).toBe(false);
  });
});
