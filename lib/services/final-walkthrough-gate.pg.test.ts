import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  createBoundPrismaClient,
  postgresUrlIdentity,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';
import {
  NEGATIVE_ACTUAL_CASH_MSG,
  performShiftClose,
  performShiftOpen,
} from '@/lib/services/shifts';
import { approveAndCompleteStockTransfer, requestStockTransfer } from '@/lib/services/stock-transfers';

const databaseUrl = resolveBoundPostgresUrl();
const identity = databaseUrl ? postgresUrlIdentity(databaseUrl) : null;
const isolated =
  canRunLivePostgres(databaseUrl) &&
  Boolean(identity && /old-sunset/i.test(identity.hostPrefix) && identity.database === 'tillflow_preview');
if (isolated) bindPrismaPostgresUrls(databaseUrl);
const describeIsolated = isolated ? describe : describe.skip;

describeIsolated('final walkthrough isolated Postgres gate', () => {
  let prisma: PrismaClient;
  const suffix = `final-gate-${Date.now()}`;
  let businessId = '';
  let storeA = '';
  let storeB = '';
  let ownerId = '';
  let tillB = '';
  let productId = '';
  let shiftId = '';

  beforeAll(async () => {
    if (/fancy-darkness/i.test(identity?.hostPrefix ?? '') || identity?.database === 'neondb') {
      throw new Error('Refusing Production');
    }
    bindPrismaPostgresUrls(databaseUrl);
    prisma = createBoundPrismaClient(databaseUrl);
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: `Final gate ${suffix}`,
        currency: 'GHS',
        plan: 'GROWTH',
        mode: 'ADVANCED',
        storeMode: 'MULTI_STORE',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1200', name: 'Inventory', type: 'ASSET' },
          ],
        },
      },
    });
    businessId = business.id;
    const first = await prisma.store.create({ data: { businessId, name: `A First ${suffix}` } });
    const selected = await prisma.store.create({ data: { businessId, name: `B Selected ${suffix}` } });
    storeA = first.id;
    storeB = selected.id;
    const owner = await prisma.user.create({
      data: {
        businessId,
        email: `${suffix}@example.com`,
        name: 'Owner',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    ownerId = owner.id;
    const till = await prisma.till.create({
      data: { storeId: storeB, name: `Till B ${suffix}`, active: true },
    });
    tillB = till.id;
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
      data: { storeId: storeB, productId, qtyOnHandBase: 20, avgCostBasePence: 100 },
    });
    await prisma.inventoryBalance.create({
      data: { storeId: storeA, productId, qtyOnHandBase: 1, avgCostBasePence: 100 },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('rejects actualCash=-2.50 on every close entry point with no writes', async () => {
    const opened = await performShiftOpen({
      businessId,
      storeId: storeB,
      actor: { userId: ownerId, userName: 'Owner', userRole: 'OWNER' },
      tillId: tillB,
      openingCashPence: 1000,
    });
    shiftId = opened.id;
    const numbered = await prisma.shift.findUnique({
      where: { id: opened.id },
      select: { shiftNumber: true },
    });
    expect(numbered?.shiftNumber).toMatch(/^SHF-\d{6}$/);

    const before = await prisma.shift.findUnique({
      where: { id: opened.id },
      include: { cashDrawerEntries: true, cashVarianceInvestigation: true },
    });
    const beforeDrawer = before?.cashDrawerEntries.length ?? 0;
    const beforeAudit = await prisma.auditLog.count({ where: { businessId, entityId: opened.id } });

    const attempts = [
      { mode: 'PIN' as const, approvingManagerId: ownerId },
      {
        mode: 'OWNER_OVERRIDE' as const,
        approvingManagerId: ownerId,
        overrideReasonCode: 'EMERGENCY_CLOSE',
        overrideJustification: 'direct negative proof',
      },
    ];
    for (const approval of attempts) {
      await expect(
        performShiftClose({
          businessId,
          actor: { userId: ownerId, userName: 'Owner', userRole: 'OWNER' },
          shiftId: opened.id,
          actualCash: -250,
          notes: 'direct -2.50',
          varianceReasonCode: 'MISSING_CASH',
          varianceReason: 'negative proof',
          approval,
        }),
      ).rejects.toThrow(NEGATIVE_ACTUAL_CASH_MSG);
    }
    await expect(
      performShiftClose({
        businessId,
        actor: { userId: ownerId, userName: 'Owner', userRole: 'OWNER' },
        shiftId: opened.id,
        actualCash: -250,
        notes: 'replay',
        varianceReasonCode: 'MISSING_CASH',
        varianceReason: 'replay',
        approval: { mode: 'PIN', approvingManagerId: ownerId },
      }),
    ).rejects.toThrow(NEGATIVE_ACTUAL_CASH_MSG);

    const after = await prisma.shift.findUnique({
      where: { id: opened.id },
      include: { cashDrawerEntries: true, cashVarianceInvestigation: true },
    });
    const afterAudit = await prisma.auditLog.count({ where: { businessId, entityId: opened.id } });
    expect(after?.status).toBe('OPEN');
    expect(after?.closureNumber).toBeNull();
    expect(after?.actualCashPence).toBe(before?.actualCashPence ?? null);
    expect(after?.expectedCashPence).toBe(before?.expectedCashPence);
    expect(after?.cashDrawerEntries).toHaveLength(beforeDrawer);
    expect(after?.cashVarianceInvestigation).toBeNull();
    expect(afterAudit).toBe(beforeAudit);
    expect(after?.cashDrawerEntries.some((row) => row.entryType === 'CLOSE_RECONCILIATION')).toBe(false);
  });

  it('transfers Store B → Store A once and refuses replay', async () => {
    const transfer = await requestStockTransfer({
      businessId,
      requestedByUserId: ownerId,
      fromStoreId: storeB,
      toStoreId: storeA,
      lines: [{ productId, qtyBase: 3 }],
    });
    const approved = await approveAndCompleteStockTransfer({
      businessId,
      transferId: transfer.id,
      approvedByUserId: ownerId,
    });
    expect(approved.fromStoreId).toBe(storeB);
    expect(approved.toStoreId).toBe(storeA);
    await expect(
      approveAndCompleteStockTransfer({
        businessId,
        transferId: transfer.id,
        approvedByUserId: ownerId,
      }),
    ).rejects.toThrow(/Only pending transfers/);
    const [balB, balA] = await Promise.all([
      prisma.inventoryBalance.findFirst({ where: { storeId: storeB, productId } }),
      prisma.inventoryBalance.findFirst({ where: { storeId: storeA, productId } }),
    ]);
    expect(balB?.qtyOnHandBase).toBe(17);
    expect(balA?.qtyOnHandBase).toBe(4);
  });
});
