import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn() }, store: { findFirst: vi.fn() },
  stockMovement: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  purchaseInvoiceLine: { findMany: vi.fn(), count: vi.fn() },
  purchaseInvoice: { findMany: vi.fn() }, salesInvoice: { findMany: vi.fn() },
  salesReturn: { findMany: vi.fn() }, purchaseReturn: { findMany: vi.fn() },
  stockAdjustment: { findMany: vi.fn() }, stockTransfer: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { getProductHistory, historyPage, verifiedMovementValue } from './product-history';
const input = { businessId: 'business', storeId: 'store', productId: 'book' };
const movement = (extra = {}) => ({ id: 'movement', createdAt: new Date('2026-10-15'), type: 'SALE', qtyBase: -2, beforeQtyBase: null, afterQtyBase: null, valuePence: -800, costBasis: 'INVENTORY_VALUE_V1', referenceType: 'SALES_INVOICE', referenceId: 'sale', user: { name: 'Recorded actor' }, ...extra });
beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue({ id: 'book', name: 'Book', publisher: null, edition: null, productUnits: [{ unit: { name: 'copy' } }], inventoryBalances: [{ qtyOnHandBase: 8 }] });
  db.store.findFirst.mockResolvedValue({ id: 'store', name: 'Branch' });
  db.stockMovement.findMany.mockResolvedValue([movement()]);
  db.stockMovement.count.mockResolvedValue(60);
  db.stockMovement.aggregate.mockResolvedValue({ _sum: { qtyBase: 5 } });
  db.purchaseInvoiceLine.findMany.mockResolvedValue([]);
  db.purchaseInvoiceLine.count.mockResolvedValue(0);
  for (const model of [db.purchaseInvoice, db.salesInvoice, db.salesReturn, db.purchaseReturn, db.stockAdjustment, db.stockTransfer]) model.findMany.mockResolvedValue([]);
});
describe('product history', () => {
  it('refuses foreign products and stores before loading any history', async () => {
    db.product.findFirst.mockResolvedValue(null);
    expect(await getProductHistory(input)).toBeNull();
    expect(db.stockMovement.findMany).not.toHaveBeenCalled();
    db.product.findFirst.mockResolvedValue({ id: 'book' });
    db.store.findFirst.mockResolvedValue(null);
    expect(await getProductHistory(input)).toBeNull();
    expect(db.stockMovement.findMany).not.toHaveBeenCalled();
    expect(db.product.findFirst.mock.calls[0][0].where).toEqual({ id: 'book', businessId: 'business' });
    expect(db.store.findFirst.mock.calls[0][0].where).toEqual({ id: 'store', businessId: 'business' });
  });
  it('filters and pages records while quantity reconciliation retains all dates', async () => {
    const start = new Date('2026-10-01'), endExclusive = new Date('2026-11-01');
    const result = await getProductHistory({ ...input, start, endExclusive, page: 2, receiptsPage: 3 });
    expect(result).toMatchObject({ currentQty: 8, recordedMovementQty: 5, reconciliationDifference: 3, page: 2, receiptsPage: 3 });
    expect(db.stockMovement.findMany.mock.calls[0][0]).toMatchObject({ where: { productId: 'book', storeId: 'store', product: { businessId: 'business' }, store: { businessId: 'business' }, createdAt: { gte: start, lt: endExclusive } }, skip: 25, take: 25 });
    expect(db.stockMovement.aggregate.mock.calls[0][0].where).not.toHaveProperty('createdAt');
    expect(db.purchaseInvoiceLine.findMany.mock.calls[0][0]).toMatchObject({ where: { productId: 'book', purchaseInvoice: { businessId: 'business', storeId: 'store', createdAt: { gte: start, lt: endExclusive } } }, skip: 50, take: 25 });
  });
  it('uses verified recorded values and never substitutes a current unit cost', async () => {
    db.stockMovement.findMany.mockResolvedValue([movement({ costBasis: 'UNVERIFIED_STOCK_V1', beforeQtyBase: null, afterQtyBase: null })]);
    const result = await getProductHistory(input);
    expect(result?.movements[0]).toMatchObject({ verifiedValuePence: null, beforeQtyBase: null, afterQtyBase: null });
    expect(verifiedMovementValue({ valuePence: 0, costBasis: 'INVENTORY_VALUE_V1' })).toBe(0);
    expect(verifiedMovementValue({ valuePence: 800, costBasis: null })).toBeNull();
  });
  it('links a return to its own original invoice with supplier and reason', async () => {
    db.stockMovement.findMany.mockResolvedValue([movement({ type: 'PURCHASE_RETURN', referenceType: 'PURCHASE_RETURN', referenceId: 'return' })]);
    db.purchaseReturn.findMany.mockResolvedValue([{ id: 'return', reason: 'Damaged copies', purchaseInvoice: { id: 'original', transactionNumber: 'PUR-001', supplier: { name: 'Original supplier' } } }]);
    const result = await getProductHistory(input);
    expect(result?.movements[0].source).toEqual({ label: 'PUR-001', href: '/purchases/original', detail: 'Original supplier · Damaged copies' });
    expect(db.purchaseReturn.findMany.mock.calls[0][0].where).toMatchObject({ storeId: 'store', purchaseInvoice: { businessId: 'business', lines: { some: { productId: 'book' } } } });
  });
  it('preserves separate receipt suppliers and returned receipt status for the same product', async () => {
    const rows = ['A', 'B'].map((name, i) => ({ id: name, unitCostPence: 400 + i * 100, purchaseInvoice: { id: name, supplier: { name }, paymentStatus: i ? 'RETURNED' : 'PAID' } }));
    db.purchaseInvoiceLine.findMany.mockResolvedValue(rows);
    const result = await getProductHistory(input);
    expect(result?.receipts).toEqual(rows);
    expect(db.purchaseInvoiceLine.findMany.mock.calls[0][0].where.purchaseInvoice).not.toHaveProperty('paymentStatus');
  });
  it('does not invent a link when its source cannot be validated', async () => {
    const result = await getProductHistory(input);
    expect(result?.movements[0].source).toEqual({ label: 'sale' });
  });
  it('sanitises invalid page numbers', () => {
    for (const value of ['-1', '0', '1.5', 'oops', 'Infinity']) expect(historyPage(value)).toBe(1);
    expect(historyPage('2')).toBe(2);
  });
});
