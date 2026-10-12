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

  it('reproduces a cleared historical warning after a current default cost is added', async () => {
    db.salesInvoiceLine.findMany.mockResolvedValue([{
      productId: 'sold-without-cost',
      product: { defaultCostBasePence: 500, inventoryBalances: [] },
    }]);
    const disclosure = await getIncompleteStockSnapshot('review-business');
    const historicalCost = resolveAuthoritativeLineCost({
      lineSubtotalPence: 1000, lineDiscountPence: 0, promoDiscountPence: 0,
      lineCostPence: 0, qtyBase: 1, defaultCostBasePence: 500,
    });
    // Characterisation of the discrepancy, not approval of this behavior.
    expect(disclosure.profitMayBeIncomplete).toBe(false);
    expect(historicalCost.authoritative).toBe(false);
  });

  it('reproduces the same discrepancy when cost exists only in another branch', async () => {
    db.salesInvoiceLine.findMany.mockResolvedValue([{
      productId: 'sold-without-cost',
      product: { defaultCostBasePence: 0, inventoryBalances: [{ avgCostBasePence: 500 }] },
    }]);
    const disclosure = await getIncompleteStockSnapshot('review-business');
    expect(disclosure.soldWithoutCostProductIds).toEqual([]);
    expect(resolveAuthoritativeLineCost({
      lineSubtotalPence: 1000, lineDiscountPence: 0, promoDiscountPence: 0,
      lineCostPence: 0, qtyBase: 1,
    }).authoritative).toBe(false);
  });
});
