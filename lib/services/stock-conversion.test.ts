// Real SQLite transactions prove atomicity and replay; PostgreSQL locking uses the shared writer lock helper.
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ failJournal: false }));
vi.mock('@/lib/accounting', async () => {
  const real = await vi.importActual<typeof import('@/lib/accounting')>('@/lib/accounting');
  return { ...real, postJournalEntry: async (input: Parameters<typeof real.postJournalEntry>[0]) => {
    if (state.failJournal) throw new Error('simulated journal failure');
    return real.postJournalEntry(input);
  } };
});
import { prisma as db } from '@/lib/prisma';
import { createStockConversion, type StockConversionInput } from './stock-conversion';

let businessId: string, otherBusinessId: string, storeId: string, userId: string, unitId: string, source: string, destination: string;
const prefix = `conversion-test-${Date.now()}`;
const input = (key: string, changes: Partial<StockConversionInput> = {}): StockConversionInput => ({
  businessId, storeId, userId, sourceProductId: source, destinationProductId: destination,
  sourceUnitId: unitId, destinationUnitId: unitId, sourceQty: 1, destinationQty: 95,
  expectedCostPence: 50000, expectedSourceQtyBase: 1, expectedDestinationQtyBase: 95, note: 'One bag opened; counted 95 cups', idempotencyKey: key, ...changes,
});
const stock = (productId: string) => db.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId } } });

(process.env.TILLFLOW_STOCK_CONVERSION_SQLITE_TESTS === '1' ? describe : describe.skip)('linked conversion persistence', () => {
  beforeAll(async () => {
    businessId = (await db.business.create({ data: { name: prefix, currency: 'GHS' } })).id;
    otherBusinessId = (await db.business.create({ data: { name: `${prefix}-other`, currency: 'GHS' } })).id;
    storeId = (await db.store.create({ data: { businessId, name: 'Test branch' } })).id;
    userId = (await db.user.create({ data: { businessId, name: 'Owner', email: `${prefix}@example.invalid`, passwordHash: 'test', role: 'OWNER' } })).id;
    unitId = (await db.unit.create({ data: { name: prefix, pluralName: prefix } })).id;
    for (const name of ['Source bag', 'Counted cups']) {
      const p = await db.product.create({ data: { businessId, name, sellingPriceBasePence: 1000, defaultCostBasePence: 99999,
        productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } } } });
      if (name === 'Source bag') source = p.id; else destination = p.id;
    }
    await db.inventoryBalance.create({ data: { storeId, productId: source, qtyOnHandBase: 10, avgCostBasePence: 50000, knownValuePence: 500000, unvaluedQtyBase: 0 } });
  });
  afterAll(async () => {
    const ids = [businessId, otherBusinessId].filter(Boolean);
    await db.journalLine.deleteMany({ where: { journalEntry: { businessId: { in: ids } } } });
    await db.journalEntry.deleteMany({ where: { businessId: { in: ids } } });
    await db.account.deleteMany({ where: { businessId: { in: ids } } });
    await db.stockMovement.deleteMany({ where: { storeId } });
    await db.auditLog.deleteMany({ where: { businessId: { in: ids } } });
    await db.moneyIdempotency.deleteMany({ where: { businessId: { in: ids } } });
    await db.inventoryBalance.deleteMany({ where: { storeId } });
    await db.productUnit.deleteMany({ where: { product: { businessId: { in: ids } } } });
    await db.product.deleteMany({ where: { businessId: { in: ids } } });
    await db.unit.deleteMany({ where: { name: prefix } });
    await db.user.deleteMany({ where: { businessId: { in: ids } } });
    await db.store.deleteMany({ where: { businessId: { in: ids } } });
    await db.business.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });
  it('saves equal opposite values, inventory-only journals, audit, and a once-only receipt', async () => {
    const result = await createStockConversion(input('once'));
    expect(result).toMatchObject({ costPence: 50000, replayed: false });
    const movements = await db.stockMovement.findMany({ where: { referenceId: result.id } });
    expect(movements.map(m => m.qtyBase).sort((a,b) => a-b)).toEqual([-1,95]);
    expect(movements.reduce((s,m) => s + m.valuePence!,0)).toBe(0);
    expect(await stock(source)).toMatchObject({ qtyOnHandBase: 9, knownValuePence: 450000 });
    expect(await stock(destination)).toMatchObject({ qtyOnHandBase: 95, knownValuePence: 50000 });
    const journal = await db.journalEntry.findFirstOrThrow({ where: { referenceId: result.id }, include: { lines: { include: { account: true } } } });
    expect(journal.lines.every(l => l.account.code === '1200')).toBe(true);
    expect(journal.lines.reduce((s,l) => s + l.debitPence - l.creditPence,0)).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: result.id, action: 'STOCK_CONVERSION' } })).toBe(1);
    expect(await createStockConversion(input('once'))).toEqual({ ...result, replayed: true });
    expect(await db.stockMovement.count({ where: { referenceId: result.id } })).toBe(2);
    await expect(createStockConversion(input('once', { destinationQty: 96, expectedDestinationQtyBase: 96 }))).rejects.toThrow(/conflict/);
  });
  it('rolls both quantities and movements back when the journal fails', async () => {
    const before = await stock(source); const beforeDest = await stock(destination);
    const count = await db.stockMovement.count({ where: { storeId } });
    state.failJournal = true;
    await expect(createStockConversion(input('rollback'))).rejects.toThrow('simulated journal failure');
    state.failJournal = false;
    expect(await stock(source)).toEqual(before); expect(await stock(destination)).toEqual(beforeDest);
    expect(await db.stockMovement.count({ where: { storeId } })).toBe(count);
    expect(await db.moneyIdempotency.count({ where: { businessId, key: 'rollback' } })).toBe(0);
  });
  it('refuses cashier access, cross-tenant scope and stale costs without writing', async () => {
    await db.user.update({ where: { id: userId }, data: { role: 'CASHIER' } });
    await expect(createStockConversion(input('cashier'))).rejects.toThrow(/owner or manager/);
    await db.user.update({ where: { id: userId }, data: { role: 'OWNER' } });
    await expect(createStockConversion(input('foreign', { businessId: otherBusinessId }))).rejects.toThrow(/business/);
    await expect(createStockConversion(input('stale', { expectedCostPence: 49000 }))).rejects.toThrow(/cost changed/);
    expect((await stock(source)).qtyOnHandBase).toBe(9);
  });
  it('rejects a unit mapping changed since review', async () => {
    await db.productUnit.updateMany({ where: { productId: destination }, data: { conversionToBase: 2 } });
    await expect(createStockConversion(input('stale-unit'))).rejects.toThrow(/units changed/);
    await db.productUnit.updateMany({ where: { productId: destination }, data: { conversionToBase: 1 } });
    expect((await stock(source)).qtyOnHandBase).toBe(9);
  });
  it('refuses overselling, missing units and same-product conversions', async () => {
    await expect(createStockConversion(input('over', { sourceQty: 99, expectedSourceQtyBase: 99 }))).rejects.toThrow(/Not enough/);
    await expect(createStockConversion(input('unit', { destinationUnitId: 'foreign' }))).rejects.toThrow(/valid unit/);
    await expect(createStockConversion(input('same', { destinationProductId: source }))).rejects.toThrow(/different products/);
  });
});
