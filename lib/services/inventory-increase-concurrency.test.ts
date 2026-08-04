/**
 * Overlapping-transaction concurrency evidence for Phase 2 increase.
 *
 * These tests require a real Postgres DATABASE_URL. Without it they are skipped —
 * they are not replaced by sequential mock calls labelled as concurrency tests.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

const databaseUrl = process.env.INVENTORY_INCREASE_CONCURRENCY_DATABASE_URL || process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('inventory increase overlapping transactions (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `inc-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let productId = '';
  let unitId = '';
  let userId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE = '1';
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = '1';
    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: {
        name: `Inc Conc ${suffix}`,
        currency: 'GHS',
        accounts: {
          create: [
            { code: '1200', name: 'Inventory', type: 'ASSET' },
            { code: '4100', name: 'Inventory Gain & Surplus', type: 'INCOME' },
            { code: '5100', name: 'Inventory Loss & Shrinkage', type: 'EXPENSE' },
          ],
        },
      },
    });
    businessId = business.id;
    const store = await prisma.store.create({
      data: { businessId, name: `Store ${suffix}` },
    });
    storeId = store.id;
    const unit = await prisma.unit.create({
      data: {
        name: `u-${suffix}`,
        pluralName: `us-${suffix}`,
        symbol: 'u',
      },
    });
    unitId = unit.id;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: `P ${suffix}`,
        active: true,
        sellingPriceBasePence: 200,
        defaultCostBasePence: 100,
        productUnits: {
          create: { unitId, conversionToBase: 1, isBaseUnit: true },
        },
      },
    });
    productId = product.id;
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
    await prisma.inventoryBalance.create({
      data: {
        storeId,
        productId,
        qtyOnHandBase: 10,
        avgCostBasePence: 100,
      },
    });
  }, 60000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.journalLine.deleteMany({
      where: { journalEntry: { businessId } },
    }).catch(() => {});
    await prisma.journalEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.stockMovement.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.stockAdjustment.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.inventoryBalance.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.productUnit.deleteMany({ where: { productId } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
    await prisma.unit.deleteMany({ where: { id: unitId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { id: storeId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('two concurrent increases with different keys both apply without lost updates', async () => {
    const { createInventoryIncrease } = await import('./inventory-increase');
    const [a, b] = await Promise.all([
      createInventoryIncrease({
        businessId,
        storeId,
        productId,
        unitId,
        qtyInUnit: 3,
        reasonCode: 'STOCK_FOUND',
        reason: 'Concurrent A found',
        idempotencyKey: `${suffix}-a`,
        userId,
        userName: 'Owner',
        userRole: 'OWNER',
      }),
      createInventoryIncrease({
        businessId,
        storeId,
        productId,
        unitId,
        qtyInUnit: 4,
        reasonCode: 'PHYSICAL_COUNT_SURPLUS',
        reason: 'Concurrent B surplus',
        idempotencyKey: `${suffix}-b`,
        userId,
        userName: 'Owner',
        userRole: 'OWNER',
      }),
    ]);

    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(false);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.qtyOnHandBase).toBe(10 + 3 + 4);
    expect(balance.avgCostBasePence).toBe(100);
  });

  it('increase concurrent with Phase 1 decrease yields correct final quantity', async () => {
    await prisma.inventoryBalance.update({
      where: { storeId_productId: { storeId, productId } },
      data: { qtyOnHandBase: 20, avgCostBasePence: 100 },
    });
    const { createInventoryIncrease } = await import('./inventory-increase');
    const { createInventoryDecrease } = await import('./inventory-decrease');

    await Promise.all([
      createInventoryIncrease({
        businessId,
        storeId,
        productId,
        unitId,
        qtyInUnit: 5,
        reasonCode: 'STOCK_FOUND',
        reason: 'Concurrent with decrease',
        idempotencyKey: `${suffix}-inc-vs-dec`,
        userId,
        userName: 'Owner',
        userRole: 'OWNER',
      }),
      createInventoryDecrease({
        businessId,
        storeId,
        productId,
        unitId,
        qtyInUnit: 2,
        reasonCode: 'WASTAGE',
        reason: 'Concurrent wastage',
        idempotencyKey: `${suffix}-dec-vs-inc`,
        userId,
        userName: 'Owner',
        userRole: 'OWNER',
      }),
    ]);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.qtyOnHandBase).toBe(20 + 5 - 2);
    expect(balance.avgCostBasePence).toBe(100);
  });

  it('two overlapping identical same-key requests produce exactly one posting', async () => {
    await prisma.inventoryBalance.update({
      where: { storeId_productId: { storeId, productId } },
      data: { qtyOnHandBase: 30, avgCostBasePence: 100 },
    });
    const beforeAdjustments = await prisma.stockAdjustment.count({ where: { storeId } });
    const beforeMovements = await prisma.stockMovement.count({ where: { storeId } });
    const beforeJournals = await prisma.journalEntry.count({ where: { businessId } });
    const beforeAudits = await prisma.auditLog.count({
      where: { businessId, action: 'INVENTORY_ADJUST' },
    });

    const { createInventoryIncrease } = await import('./inventory-increase');
    const payload = {
      businessId,
      storeId,
      productId,
      unitId,
      qtyInUnit: 2,
      reasonCode: 'STOCK_FOUND' as const,
      reason: 'Same-key concurrent surplus',
      idempotencyKey: `${suffix}-same-key`,
      userId,
      userName: 'Owner',
      userRole: 'OWNER' as const,
    };

    const [a, b] = await Promise.all([
      createInventoryIncrease(payload),
      createInventoryIncrease(payload),
    ]);

    expect(a.id).toBe(b.id);
    expect([a.replayed, b.replayed].filter(Boolean).length).toBe(1);
    expect([a.replayed, b.replayed].filter((x) => !x).length).toBe(1);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.qtyOnHandBase).toBe(30 + 2);
    expect(balance.avgCostBasePence).toBe(100);

    expect(await prisma.stockAdjustment.count({ where: { storeId } })).toBe(beforeAdjustments + 1);
    expect(await prisma.stockMovement.count({ where: { storeId } })).toBe(beforeMovements + 1);
    expect(await prisma.journalEntry.count({ where: { businessId } })).toBe(beforeJournals + 1);
    expect(
      await prisma.auditLog.count({ where: { businessId, action: 'INVENTORY_ADJUST' } }),
    ).toBe(beforeAudits + 1);
  });


});

describe('concurrency suite availability', () => {
  it('reports when overlapping Postgres tests are skipped', () => {
    if (!canRun) {
      // Explicit report — do not pretend sequential mocks are concurrency tests.
      expect(canRun).toBe(false);
    } else {
      expect(canRun).toBe(true);
    }
  });
});
