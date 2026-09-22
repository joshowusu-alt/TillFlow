/**
 * Overlapping-transaction concurrency evidence for Phase 2 increase.
 *
 * These tests require a real Postgres DATABASE_URL / POSTGRES_PRISMA_URL.
 * Without it they are skipped — they are not replaced by sequential mocks.
 * Preview proof binds POSTGRES_PRISMA_URL (the generated client datasource)
 * to the isolated Preview database before any PrismaClient is constructed.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  openBoundPrismaClient,
  postgresUrlIdentity,
  proveWalkthroughPostgresSchema,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';

function generatedPrismaSchemaIdentity() {
  const require = createRequire(__filename);
  const clientEntry = require.resolve('@prisma/client');
  const schemaPath = join(process.cwd(), 'node_modules', '.prisma', 'client', 'schema.prisma');
  const contents = readFileSync(schemaPath, 'utf8');
  return {
    clientEntry,
    schemaPath,
    provider: /provider\s*=\s*"postgresql"/.test(contents) ? 'postgresql' : (/provider\s*=\s*"sqlite"/.test(contents) ? 'sqlite' : 'unknown'),
    urlEnv: /url\s*=\s*env\("([^"]+)"\)/.exec(contents)?.[1] ?? '',
    hasTransactionNumber: /model StockAdjustment[\s\S]*transactionNumber/.test(contents),
  };
}

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) {
  bindPrismaPostgresUrls(databaseUrl);
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE = '1';
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = '1';
  process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_ROLLOUT_MODE = 'ALLOWLIST';
}

const describeConcurrency = canRun ? describe : describe.skip;

describeConcurrency('inventory increase overlapping transactions (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `inc-conc-${Date.now()}`;
  let businessId = '';
  let storeId = '';
  let productId = '';
  let unitId = '';
  let userId = '';
  const urlBeforePrisma = databaseUrl;
  const identityBeforePrisma = postgresUrlIdentity(databaseUrl);

  beforeAll(async () => {
    bindPrismaPostgresUrls(databaseUrl);
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE = '1';
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = '1';
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_ROLLOUT_MODE = 'ALLOWLIST';
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    bindPrismaPostgresUrls(databaseUrl);
    prisma = await openBoundPrismaClient(databaseUrl);

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
    process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS = businessId;
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

  it('proves the generated Postgres client talks to the bound isolated database', async () => {
    expect(urlBeforePrisma).toBe(databaseUrl);
    expect(identityBeforePrisma.database).toBeTruthy();
    expect(process.env.POSTGRES_PRISMA_URL).toBe(databaseUrl);
    expect(process.env.POSTGRES_URL_NON_POOLING).toBe(databaseUrl);
    expect(process.env.DATABASE_URL).toBe(databaseUrl);
    const generated = generatedPrismaSchemaIdentity();
    expect(generated.provider).toBe('postgresql');
    expect(generated.urlEnv).toBe('POSTGRES_PRISMA_URL');
    expect(generated.hasTransactionNumber).toBe(true);
    const proof = await proveWalkthroughPostgresSchema(prisma);
    expect(proof.currentDatabase).toBe(identityBeforePrisma.database);
    expect(proof.currentSchema).toBe('public');
    expect(proof.hasTransactionNumber).toBe(true);
    expect(proof.appliedWalkthroughMigrations).toEqual([
      '20260917180000_owner_walkthrough_integrity',
      '20260918140000_walkthrough_store_numbers',
      '20260918230000_shift_presentation_numbers',
    ]);
    expect(process.env.TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS).toBe(businessId);
    console.info('INVENTORY_PG_IDENTITY', {
      hostPrefix: identityBeforePrisma.hostPrefix,
      database: identityBeforePrisma.database,
      schema: identityBeforePrisma.schema,
      currentDatabase: proof.currentDatabase,
      currentSchema: proof.currentSchema,
      hasTransactionNumber: proof.hasTransactionNumber,
      appliedWalkthroughMigrations: proof.appliedWalkthroughMigrations,
      generatedClientEntry: generated.clientEntry,
      generatedSchemaPath: generated.schemaPath,
      generatedProvider: generated.provider,
      generatedUrlEnv: generated.urlEnv,
      resetModulesUsed: true,
      envReboundToSameUrlOnly: process.env.POSTGRES_PRISMA_URL === urlBeforePrisma,
    });
  });

  it('two concurrent increases with different keys both apply without lost updates', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    const { createInventoryIncrease } = await import('./inventory-increase');
    const initial = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(initial.qtyOnHandBase).toBe(10);

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
    const adjustments = await prisma.stockAdjustment.findMany({
      where: { storeId, productId },
      select: { id: true, transactionNumber: true, qtyInUnit: true },
    });
    expect(adjustments).toHaveLength(2);
    expect(new Set(adjustments.map((row) => row.transactionNumber).filter(Boolean)).size).toBe(2);
  });

  it('increase concurrent with Phase 1 decrease yields correct final quantity', async () => {
    bindPrismaPostgresUrls(databaseUrl);
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
  });

  it('two overlapping identical same-key requests produce exactly one posting', async () => {
    bindPrismaPostgresUrls(databaseUrl);
    await prisma.inventoryBalance.update({
      where: { storeId_productId: { storeId, productId } },
      data: { qtyOnHandBase: 30, avgCostBasePence: 100 },
    });
    const beforeAdjustments = await prisma.stockAdjustment.count({ where: { storeId } });
    const beforeMovements = await prisma.stockMovement.count({ where: { storeId } });
    const beforeJournals = await prisma.journalEntry.count({ where: { businessId } });

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
    const posted = await prisma.stockAdjustment.findMany({
      where: { storeId, idempotencyKey: `${suffix}-same-key` },
      select: { id: true, transactionNumber: true },
    });
    expect(posted).toHaveLength(1);
    expect(posted[0].transactionNumber).toMatch(/^ADJ-/);
    expect(await prisma.stockAdjustment.count({ where: { storeId } })).toBe(beforeAdjustments + 1);
    expect(await prisma.stockMovement.count({ where: { storeId } })).toBe(beforeMovements + 1);
    expect(await prisma.journalEntry.count({ where: { businessId } })).toBe(beforeJournals + 1);
    console.info('INVENTORY_PG_IDEMPOTENCY', {
      initialStock: 30,
      concurrentRequests: 2,
      successfulRequests: 1,
      rejectedOrReplayedRequests: 1,
      finalStock: balance.qtyOnHandBase,
      stockMovements: beforeMovements + 1,
      stockAdjustments: beforeAdjustments + 1,
      transactionNumbers: posted.map((row) => row.transactionNumber),
      idempotencyResult: 'one posted, one replayed, same id',
    });
  });
});
