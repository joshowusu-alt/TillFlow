import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import type { StockConversionInput } from './stock-conversion';

const describePg = canRunLivePostgresTests() ? describe : describe.skip;
describePg('stock conversion PostgreSQL writer concurrency', () => {
  let db: PrismaClient;
  let convert: typeof import('./stock-conversion').createStockConversion;
  let businessId: string, storeId: string, userId: string, unitId: string, source: string, second: string, destination: string;
  const suffix = `conversion-pg-${Date.now()}`;
  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
    ({ createStockConversion: convert } = await import('./stock-conversion'));
    businessId = (await db.business.create({ data: { name: suffix, currency: 'GHS' } })).id;
    storeId = (await db.store.create({ data: { businessId, name: 'Isolated conversion branch' } })).id;
    userId = (await db.user.create({ data: { businessId, name: 'Owner', email: `${suffix}@example.invalid`, role: 'OWNER', passwordHash: 'fixture' } })).id;
    unitId = (await db.unit.create({ data: { name: suffix, pluralName: suffix } })).id;
    const ids: string[] = [];
    for (const name of ['Bag A', 'Bag B', 'Counted output']) ids.push((await db.product.create({ data: {
      businessId, name, sellingPriceBasePence: 1000, defaultCostBasePence: 99999,
      productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } },
    } })).id);
    [source, second, destination] = ids;
    const { ensureChartOfAccounts } = await import('@/lib/accounting');
    await ensureChartOfAccounts(businessId, db);
  }, 60000);
  beforeEach(async () => {
    await db.inventoryBalance.deleteMany({ where: { storeId } });
    await db.inventoryBalance.createMany({ data: [
      { storeId, productId: source, qtyOnHandBase: 1, avgCostBasePence: 50000, knownValuePence: 50000, unvaluedQtyBase: 0 },
      { storeId, productId: second, qtyOnHandBase: 1, avgCostBasePence: 30000, knownValuePence: 30000, unvaluedQtyBase: 0 },
    ] });
  });
  afterAll(async () => {
    if (!db || !businessId) return;
    await runTestTeardown(db, [
      () => db.journalLine.deleteMany({ where: { journalEntry: { businessId } } }),
      () => db.journalEntry.deleteMany({ where: { businessId } }),
      () => db.account.deleteMany({ where: { businessId } }),
      () => db.stockMovement.deleteMany({ where: { storeId } }),
      () => db.auditLog.deleteMany({ where: { businessId } }),
      () => db.moneyIdempotency.deleteMany({ where: { businessId } }),
      () => db.inventoryBalance.deleteMany({ where: { storeId } }),
      () => db.productUnit.deleteMany({ where: { product: { businessId } } }),
      () => db.product.deleteMany({ where: { businessId } }),
      () => db.unit.deleteMany({ where: { id: unitId } }),
      () => db.user.deleteMany({ where: { businessId } }),
      () => db.store.deleteMany({ where: { businessId } }),
      () => db.business.deleteMany({ where: { id: businessId } }),
    ]);
  });
  const input = (key: string, overrides: Partial<StockConversionInput> = {}): StockConversionInput => ({
    businessId, storeId, userId, sourceProductId: source, destinationProductId: destination,
    sourceUnitId: unitId, destinationUnitId: unitId, sourceQty: 1, destinationQty: 95,
    expectedCostPence: 50000, expectedSourceQtyBase: 1, expectedDestinationQtyBase: 95,
    note: 'One complete bag; actual output counted', idempotencyKey: `${suffix}-${key}`, ...overrides,
  });
  const stock = (productId: string) => db.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId } } });
  async function assertJournal(id: string) {
    const journal = await db.journalEntry.findFirstOrThrow({ where: { businessId, referenceId: id }, include: { lines: { include: { account: true } } } });
    expect(journal.lines.map(l => l.account.code)).toEqual(['1200', '1200']);
    expect(journal.lines.reduce((sum, l) => sum + l.debitPence - l.creditPence, 0)).toBe(0);
    expect(await db.stockMovement.count({ where: { storeId, referenceId: id } })).toBe(2);
  }
  it('replays concurrent identical submissions exactly once across real transactions', async () => {
    const results = await Promise.all([convert(input('same')), convert(input('same'))]);
    expect(results[0].id).toBe(results[1].id);
    expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
    expect(await stock(source)).toMatchObject({ qtyOnHandBase: 0, knownValuePence: 0 });
    expect(await stock(destination)).toMatchObject({ qtyOnHandBase: 95, knownValuePence: 50000 });
    expect(await db.auditLog.count({ where: { businessId, entityId: results[0].id, action: 'STOCK_CONVERSION' } })).toBe(1);
    await assertJournal(results[0].id);
  });
  it('allows only one competing request to consume the last bag', async () => {
    const results = await Promise.allSettled([convert(input('last-a')), convert(input('last-b'))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/Not enough source stock/);
    expect(await stock(source)).toMatchObject({ qtyOnHandBase: 0, knownValuePence: 0 });
    expect(await stock(destination)).toMatchObject({ qtyOnHandBase: 95, knownValuePence: 50000 });
  });
  it('serialises concurrent receipts into a previously missing destination balance without losing cost', async () => {
    const results = await Promise.all([
      convert(input('receive-a')),
      convert(input('receive-b', { sourceProductId: second, expectedCostPence: 30000 })),
    ]);
    expect(await stock(destination)).toMatchObject({ qtyOnHandBase: 190, knownValuePence: 80000, unvaluedQtyBase: 0 });
    expect(await stock(source)).toMatchObject({ qtyOnHandBase: 0, knownValuePence: 0 });
    expect(await stock(second)).toMatchObject({ qtyOnHandBase: 0, knownValuePence: 0 });
    for (const result of results) await assertJournal(result.id);
  });
});
