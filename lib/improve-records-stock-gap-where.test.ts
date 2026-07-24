/**
 * Pure WHERE-builder invariants for catalogue recommendations.
 * Kept free of Prisma mocks so CI stays fast.
 */
import { describe, expect, it } from 'vitest';
import {
  soldWithoutConfirmedQtyProductWhere,
  stockSetupGapProductWhere,
  unusedCatalogueProductWhere,
} from '@/lib/improve-records-stock-gap-where';

describe('stock-gap where builders', () => {
  const now = new Date('2026-07-15T00:00:00.000Z');
  const cutoff = new Date('2026-07-01T00:00:00.000Z');

  it('unused catalogue requires aged + no qualifying sales + no confirmed history', () => {
    const where = unusedCatalogueProductWhere('biz-a', now);
    expect(where.businessId).toBe('biz-a');
    expect(where.active).toBe(true);
    expect(where.sellingPriceBasePence).toEqual({ gt: 0 });
    expect(where.inventoryBalances).toEqual({ none: {} });
    expect(where.createdAt).toEqual({ lt: cutoff });
    expect(where.salesLines).toMatchObject({ none: expect.any(Object) });
    expect(where.purchaseLines).toMatchObject({ none: expect.any(Object) });
    expect(where.stockMovements).toMatchObject({ none: expect.any(Object) });
  });

  it('stock setup gap is recent OR has qualifying sales, still no confirmed history', () => {
    const where = stockSetupGapProductWhere('biz-a', now);
    expect(where.OR).toEqual([
      { createdAt: { gte: cutoff } },
      {
        salesLines: {
          some: {
            salesInvoice: {
              businessId: 'biz-a',
              paymentStatus: { notIn: ['RETURNED', 'VOID'] },
            },
          },
        },
      },
    ]);
    expect(where.inventoryBalances).toEqual({ none: {} });
  });

  it('sold-without-confirmed-qty requires a qualifying sale', () => {
    const where = soldWithoutConfirmedQtyProductWhere('biz-a');
    expect(where.salesLines).toMatchObject({ some: expect.any(Object) });
    expect(where.createdAt).toBeUndefined();
  });
});
