import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn() },
  salesInvoiceLine: { findMany: vi.fn(), count: vi.fn() },
  purchaseInvoiceLine: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getProductCostReview } from './product-cost-review';
beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue({ id: 'product', name: 'Biscuit', defaultCostBasePence: 1450, inventoryBalances: [{ qtyOnHandBase: 29, knownValuePence: null, unvaluedQtyBase: 29 }] });
  db.salesInvoiceLine.count.mockResolvedValue(30);
  db.salesInvoiceLine.findMany.mockResolvedValue([{ id: 'line', salesInvoice: { id: 'invoice' } }]);
  db.purchaseInvoiceLine.findMany.mockResolvedValue([]);
});
describe('product cost evidence review', () => {
  it('refuses a product outside the authenticated business before reading its evidence', async () => {
    db.product.findFirst.mockResolvedValue(null);
    expect(await getProductCostReview('business', 'foreign')).toBeNull();
    expect(db.product.findFirst.mock.calls[0][0].where).toEqual({ id: 'foreign', businessId: 'business' });
    expect(db.salesInvoiceLine.findMany).not.toHaveBeenCalled();
    expect(db.purchaseInvoiceLine.findMany).not.toHaveBeenCalled();
  });
  it('keeps current cost separate from unconfirmed stock and pages only affected sales', async () => {
    const data = await getProductCostReview('business', 'product', 2);
    expect(data?.product.inventoryBalances[0].knownValuePence).toBeNull();
    expect(data?.product.defaultCostBasePence).toBe(1450);
    const query = db.salesInvoiceLine.findMany.mock.calls[0][0];
    expect(query).toMatchObject({ skip: 25, take: 25, where: { productId: 'product', product: { businessId: 'business' }, salesInvoice: { businessId: 'business', store: { businessId: 'business' }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } } } });
    expect(query.where.OR).toEqual([
      { costBasis: 'UNVERIFIED_STOCK_V1' },
      { lineCostPence: { lte: 0 }, OR: [{ costBasis: null }, { costBasis: { not: 'INVENTORY_VALUE_V1' } }] },
    ]);
    expect(db.salesInvoiceLine.count.mock.calls[0][0].where).toEqual(query.where);
    expect(db.purchaseInvoiceLine.findMany.mock.calls[0][0]).toMatchObject({ take: 10, where: { productId: 'product', purchaseInvoice: { businessId: 'business', store: { businessId: 'business' } } } });
  });
});
