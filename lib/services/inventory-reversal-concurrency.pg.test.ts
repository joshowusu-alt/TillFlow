import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  createBoundPrismaClient,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';
import { createInventoryIncrease } from '@/lib/services/inventory-increase';
import {
  INVENTORY_REVERSAL_ERROR,
  InventoryReversalError,
  reverseInventoryAdjustment,
} from '@/lib/services/inventory-reversal';

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) {
  bindPrismaPostgresUrls(databaseUrl);
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE = '1';
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = '1';
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_ROLLOUT_MODE = 'ALLOWLIST';
}
const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('adjustment reversal idempotency (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `rev-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let productId = '';
  let unitId = '';
  let userId = '';
  let originalId = '';

  beforeAll(async () => {
    bindPrismaPostgresUrls(databaseUrl);
    prisma = createBoundPrismaClient(databaseUrl);
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: `Rev Conc ${suffix}`,
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
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS = businessId;
    const store = await prisma.store.create({ data: { businessId, name: `Store ${suffix}` } });
    storeId = store.id;
    const unit = await prisma.unit.create({
      data: { name: `u-${suffix}`, pluralName: 'us', symbol: 'u' },
    });
    unitId = unit.id;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: `P ${suffix}`,
        active: true,
        sellingPriceBasePence: 200,
        defaultCostBasePence: 100,
        productUnits: { create: { unitId, conversionToBase: 1, isBaseUnit: true } },
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
      data: { storeId, productId, qtyOnHandBase: 10, avgCostBasePence: 100 },
    });
    const created = await createInventoryIncrease({
      businessId,
      storeId,
      productId,
      unitId,
      qtyInUnit: 5,
      reasonCode: 'STOCK_FOUND',
      reason: 'Original increase to reverse',
      idempotencyKey: `${suffix}-original`,
      userId,
      userName: 'Owner',
      userRole: 'OWNER',
    });
    originalId = created.id;
  }, 60000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.stockMovement.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.stockAdjustment.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }).catch(() => {});
    await prisma.journalEntry.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.inventoryBalance.deleteMany({ where: { storeId } }).catch(() => {});
    await prisma.productUnit.deleteMany({ where: { productId } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
    await prisma.unit.deleteMany({ where: { id: unitId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.store.deleteMany({ where: { id: storeId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { businessId } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: businessId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('creates exactly one reversal under concurrent identical requests', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    const payload = {
      businessId,
      storeId,
      originalAdjustmentId: originalId,
      reason: 'Posted to the wrong product',
      userId,
      userName: 'Owner',
      userRole: 'OWNER',
    };

    const results = await Promise.allSettled([
      reverseInventoryAdjustment(payload),
      reverseInventoryAdjustment(payload),
    ]);

    const fulfilled = results.filter((row) => row.status === 'fulfilled') as PromiseFulfilledResult<{
      id: string;
      replayed: boolean;
    }>[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(fulfilled.map((row) => row.value.id));
    expect(ids.size).toBe(1);

    const reversals = await prisma.stockAdjustment.findMany({
      where: { storeId, reversalOfId: originalId },
    });
    expect(reversals).toHaveLength(1);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(balance.qtyOnHandBase).toBe(10);

    const replay = await reverseInventoryAdjustment(payload);
    expect(replay.replayed).toBe(true);
    expect(replay.id).toBe(reversals[0].id);

    await expect(
      reverseInventoryAdjustment({
        ...payload,
        originalAdjustmentId: reversals[0].id,
      }),
    ).rejects.toMatchObject({ code: INVENTORY_REVERSAL_ERROR.CANNOT_REVERSE_REVERSAL });
    expect(InventoryReversalError).toBeTruthy();
  });
});
