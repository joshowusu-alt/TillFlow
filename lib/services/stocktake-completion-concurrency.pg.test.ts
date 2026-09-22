import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  openBoundPrismaClient,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';
import { runTestTeardown } from '@/lib/test/test-prisma';

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) {
  bindPrismaPostgresUrls(databaseUrl);
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = '1';
}

const auth = {
  user: { id: '', name: 'Owner', role: 'OWNER' },
  businessId: '',
  storeId: '',
};

vi.mock('@/lib/action-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils');
  return {
    ...actual,
    requireSelectedStoreContext: async () => ({
      user: auth.user,
      businessId: auth.businessId,
      storeId: auth.storeId,
    }),
  };
});

vi.mock('@/lib/cache/pos-tags', () => ({
  revalidatePosCatalog: () => undefined,
}));

vi.mock('@/lib/improve-records-revalidate', () => ({
  revalidateImproveRecordsHome: () => undefined,
}));

vi.mock('@/app/actions/stock-alerts', () => ({
  checkAndSendLowStockAlert: async () => undefined,
}));

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('stocktake completion idempotency (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `stk-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let productId = '';
  let userId = '';
  let stocktakeId = '';
  let lineId = '';

  beforeAll(async () => {
    bindPrismaPostgresUrls(databaseUrl);
    prisma = await openBoundPrismaClient(databaseUrl);
    const business = await prisma.business.create({
      data: {
        name: `Stk Conc ${suffix}`,
        currency: 'GHS',
        plan: 'GROWTH',
        mode: 'ADVANCED',
        accounts: {
          create: [
            { code: '1200', name: 'Inventory', type: 'ASSET' },
            { code: '5100', name: 'Inventory Loss & Shrinkage', type: 'EXPENSE' },
          ],
        },
      },
    });
    businessId = business.id;
    const store = await prisma.store.create({ data: { businessId, name: `Store ${suffix}` } });
    storeId = store.id;
    const user = await prisma.user.create({
      data: {
        businessId,
        email: `${suffix}@example.com`,
        name: 'Owner',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    userId = user.id;
    const unit = await prisma.unit.create({
      data: { name: `u-${suffix}`, pluralName: 'us', symbol: 'u' },
    });
    const product = await prisma.product.create({
      data: {
        businessId,
        name: `P ${suffix}`,
        active: true,
        sellingPriceBasePence: 200,
        defaultCostBasePence: 100,
        productUnits: { create: { unitId: unit.id, conversionToBase: 1, isBaseUnit: true } },
      },
    });
    productId = product.id;
    await prisma.inventoryBalance.create({
      data: { storeId, productId, qtyOnHandBase: 10, avgCostBasePence: 100 },
    });
    const stocktake = await prisma.stocktake.create({
      data: {
        storeId,
        userId,
        status: 'IN_PROGRESS',
        lines: {
          create: {
            productId,
            expectedBase: 10,
            countedBase: 6,
            varianceBase: -4,
            countState: 'COUNTED',
            countedAt: new Date(),
            countedByUserId: userId,
          },
        },
      },
      include: { lines: true },
    });
    stocktakeId = stocktake.id;
    lineId = stocktake.lines[0].id;
    auth.user = { id: userId, name: 'Owner', role: 'OWNER' };
    auth.businessId = businessId;
    auth.storeId = storeId;
  }, 60000);

  afterAll(async () => {
    await runTestTeardown(
      prisma,
      [
        () => prisma.stocktakeLine.deleteMany({ where: { stocktakeId } }),
        () => prisma.stocktake.deleteMany({ where: { id: stocktakeId } }),
        () => prisma.stockMovement.deleteMany({ where: { storeId } }),
        () => prisma.stockAdjustment.deleteMany({ where: { storeId } }),
        () => prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }),
        () => prisma.journalEntry.deleteMany({ where: { businessId } }),
        () => prisma.inventoryBalance.deleteMany({ where: { storeId } }),
        () => prisma.productUnit.deleteMany({ where: { productId } }),
        () => prisma.product.deleteMany({ where: { id: productId } }),
        () => prisma.user.deleteMany({ where: { id: userId } }),
        () => prisma.store.deleteMany({ where: { id: storeId } }),
        () => prisma.account.deleteMany({ where: { businessId } }),
        () => prisma.business.deleteMany({ where: { id: businessId } }),
      ],
      { label: 'stocktake-completion-concurrency.pg.test.ts' },
    );
  });

  it('posts stock once when two completions race', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    const { completeStocktakeAction } = await import('@/app/actions/stocktake');
    const payload = {
      stocktakeId,
      storeId,
      counts: [{ lineId, countedBase: 6 }],
      reason: 'Shelf count shortfall',
    };

    const [first, second] = await Promise.all([
      completeStocktakeAction(payload),
      completeStocktakeAction(payload),
    ]);

    const outcomes = [first, second];
    const successes = outcomes.filter((row) => row.success);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const stocktake = await prisma.stocktake.findUniqueOrThrow({ where: { id: stocktakeId } });
    expect(stocktake.status).toBe('COMPLETED');
    const adjustments = await prisma.stockAdjustment.findMany({
      where: { storeId, idempotencyKey: `stocktake:${stocktakeId}:line:${lineId}` },
    });
    expect(adjustments).toHaveLength(1);
    const movements = await prisma.stockMovement.findMany({
      where: { storeId, referenceType: 'STOCK_ADJUSTMENT', referenceId: adjustments[0].id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].qtyBase).toBe(-4);
    const journals = await prisma.journalEntry.findMany({
      where: { businessId, referenceType: 'STOCK_ADJUSTMENT', referenceId: adjustments[0].id },
    });
    expect(journals).toHaveLength(1);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.qtyOnHandBase).toBe(6);
  });
});
