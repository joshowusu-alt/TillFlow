import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ category: { findMany: vi.fn() }, product: { findMany: vi.fn() }, salesInvoice: { findMany: vi.fn() }, $transaction: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { buildClassificationSales, getClassificationSalesReport } from './classification-sales';
const categories = [{ id: 'household', name: 'Household', divisions: [{ id: 'fairytale', name: 'fairytale', groups: [{ id: 'western', name: 'Western' }, { id: 'empty', name: 'Empty group' }] }] }];
const products = [{ id: 'fufu', name: 'Fufu Powder', categoryId: 'household', groupId: 'western' }, { id: 'soap', name: 'Soap', categoryId: 'household', groupId: null }, { id: 'other', name: 'Other', categoryId: null, groupId: null }];
const line = { qtyBase: 2, lineSubtotalPence: 1000, lineDiscountPence: 0, promoDiscountPence: 0, costBasis: 'INVENTORY_VALUE_V1', lineCostPence: 600 };
const sale = { paymentStatus: 'PAID', discountPence: 200, lines: [{ ...line, productId: 'fufu' }, { ...line, productId: 'soap', lineCostPence: 400 }] };

describe('classification performance', () => {
  beforeEach(() => { vi.clearAllMocks(); db.category.findMany.mockResolvedValue(categories); db.product.findMany.mockResolvedValue(products); db.salesInvoice.findMany.mockResolvedValue([sale]); db.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries)); });
  it('reconciles every level, including category-only and unclassified products, without double counting', () => {
    const rows = buildClassificationSales(categories, products, [sale, { ...sale, paymentStatus: 'VOID' }, { ...sale, paymentStatus: 'RETURNED' }]);
    for (const level of ['category', 'division', 'group', 'product']) {
      const selected = rows.filter(row => row.level === level);
      expect(selected.reduce((sum, row) => sum + row.netSalesPence, 0)).toBe(1800);
      expect(selected.reduce((sum, row) => sum + row.costPence!, 0)).toBe(1000);
      expect(selected.reduce((sum, row) => sum + row.profitPence!, 0)).toBe(800);
      expect(selected.reduce((sum, row) => sum + row.productCount, 0)).toBe(3);
    }
    expect(rows.find(row => row.key === 'group:western')).toMatchObject({ path: 'Household / fairytale / Western', netSalesPence: 900, costPence: 600, profitPence: 300, productCount: 1 });
    expect(rows.find(row => row.key === 'group:empty')).toMatchObject({ netSalesPence: 0, productCount: 0 });
    expect(rows.find(row => row.key === 'division:category-only:household')).toMatchObject({ netSalesPence: 900, costPence: 400, productCount: 1 });
  });
  it('propagates unknown costs to the relevant parents while keeping other groups complete', () => {
    const rows = buildClassificationSales(categories, products, [{ ...sale, lines: [{ ...sale.lines[0], costBasis: 'UNVERIFIED_STOCK_V1' }, sale.lines[1]] }]);
    expect(rows.find(row => row.key === 'group:western')).toMatchObject({ costPence: null, profitPence: null, marginPercent: null });
    expect(rows.find(row => row.key === 'category:household')?.profitPence).toBeNull();
    expect(rows.find(row => row.key === 'product:soap')?.profitPence).toBe(500);
  });
  it('does not present unresolved return records as known margin', () => {
    const rows = buildClassificationSales(categories, products, [{ ...sale, salesReturn: { type: 'RETURN' } }]);
    expect(rows.find(row => row.key === 'category:household')?.profitPence).toBeNull();
  });
  it('reads only the authorised business, stores and half-open period in one snapshot', async () => {
    const start = new Date('2026-10-01'), end = new Date('2026-10-21');
    await getClassificationSalesReport('business', { start, end, storeIds: ['store'] });
    expect(db.salesInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business', storeId: { in: ['store'] }, createdAt: { gte: start, lt: end }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } } }));
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business' } }));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: 'Serializable' });
  });
  it('refuses an empty store scope before querying', async () => {
    await expect(getClassificationSalesReport('business', { start: new Date(), end: new Date(), storeIds: [] })).rejects.toThrow('Authorised store scope');
    expect(db.salesInvoice.findMany).not.toHaveBeenCalled();
  });
});
