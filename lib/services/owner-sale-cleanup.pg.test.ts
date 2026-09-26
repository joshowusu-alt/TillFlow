import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  bindPrismaPostgresUrls,
  canRunLivePostgres,
  openBoundPrismaClient,
  postgresUrlIdentity,
  resolveBoundPostgresUrl,
} from '@/lib/test/isolated-postgres';
import { runTestTeardown } from '@/lib/test/test-prisma';
import { performShiftClose, performShiftOpen } from '@/lib/services/shifts';
import { cleanupOwnerVoidedSale } from '@/lib/services/owner-sale-cleanup';
import { expectedCashPenceFromEntries } from '@/lib/reports/expected-cash';

const databaseUrl = resolveBoundPostgresUrl();
const canRun = canRunLivePostgres(databaseUrl);
if (canRun) bindPrismaPostgresUrls(databaseUrl);

describe('A9 closed-shift cleanup is non-mutating on real Postgres', () => {
  let prisma: PrismaClient;
  const suffix = `a9-cleanup-${Date.now()}`;
  const businessIds: string[] = [];

  beforeAll(async () => {
    expect(canRun, 'isolated Postgres is required for A9').toBe(true);
    const identity = postgresUrlIdentity(databaseUrl);
    expect(identity.database, 'refusing Production neondb').not.toBe('neondb');
    expect(identity.host, 'refusing Production host').not.toMatch(/fancy-darkness/i);
    bindPrismaPostgresUrls(databaseUrl);
    prisma = await openBoundPrismaClient(databaseUrl);
    const probe = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
    expect(probe[0]?.db).toBe(identity.database);
  }, 90000);

  afterAll(async () => {
    if (!prisma) return;
    await runTestTeardown(
      prisma,
      [
        () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { business: { name: { contains: suffix } } } } }),
        () => prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { business: { name: { contains: suffix } } } } }),
        () => prisma.salesInvoice.deleteMany({ where: { business: { name: { contains: suffix } } } }),
        () => prisma.cashDrawerEntry.deleteMany({ where: { business: { name: { contains: suffix } } } }),
        () => prisma.stockMovement.deleteMany({ where: { store: { business: { name: { contains: suffix } } } } }),
        () => prisma.journalLine.deleteMany({ where: { journalEntry: { business: { name: { contains: suffix } } } } }),
        () => prisma.journalEntry.deleteMany({ where: { business: { name: { contains: suffix } } } }),
        () => prisma.auditLog.deleteMany({ where: { businessId: { in: businessIds } } }),
        () => prisma.cashVarianceInvestigation.deleteMany({ where: { shift: { till: { store: { business: { name: { contains: suffix } } } } } } }),
        () => prisma.shift.deleteMany({ where: { till: { store: { business: { name: { contains: suffix } } } } } }),
        () => prisma.inventoryBalance.deleteMany({ where: { store: { business: { name: { contains: suffix } } } } }),
        () => prisma.productUnit.deleteMany({ where: { product: { business: { name: { contains: suffix } } } } }),
        () => prisma.product.deleteMany({ where: { business: { name: { contains: suffix } } } }),
        () => prisma.unit.deleteMany({ where: { name: { contains: suffix } } }),
        () => prisma.till.deleteMany({ where: { store: { business: { name: { contains: suffix } } } } }),
        () => prisma.user.deleteMany({ where: { business: { name: { contains: suffix } } } }),
        () => prisma.store.deleteMany({ where: { business: { name: { contains: suffix } } } }),
        () => prisma.account.deleteMany({ where: { business: { name: { contains: suffix } } } }),
        () => prisma.business.deleteMany({ where: { name: { contains: suffix } } }),
      ],
      { label: 'owner-sale-cleanup.pg.test.ts' },
    );
  });

  async function seedTenant(label: string) {
    const business = await prisma.business.create({
      data: {
        name: `${label} ${suffix}`,
        currency: 'GHS',
        timezone: 'Africa/Accra',
        plan: 'GROWTH',
        mode: 'ADVANCED',
        accounts: {
          create: [
            { code: '1000', name: 'Cash', type: 'ASSET' },
            { code: '1200', name: 'Inventory', type: 'ASSET' },
          ],
        },
      },
    });
    businessIds.push(business.id);
    const store = await prisma.store.create({
      data: { businessId: business.id, name: `${label} store ${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        businessId: business.id,
        email: `${label}-${suffix}@example.com`,
        name: 'Owner',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });
    const till = await prisma.till.create({
      data: { storeId: store.id, name: `${label} till ${suffix}`, active: true },
    });
    const unit = await prisma.unit.create({
      data: { name: `${label}-unit-${suffix}`, pluralName: 'units', symbol: 'u' },
    });
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        name: `${label} product ${suffix}`,
        sellingPriceBasePence: 500,
        defaultCostBasePence: 200,
        productUnits: { create: { unitId: unit.id, conversionToBase: 1, isBaseUnit: true } },
      },
    });
    await prisma.inventoryBalance.create({
      data: { storeId: store.id, productId: product.id, qtyOnHandBase: 10, avgCostBasePence: 200 },
    });
    const opened = await performShiftOpen({
      businessId: business.id,
      storeId: store.id,
      tillId: till.id,
      openingCashPence: 1000,
      actor: { userId: user.id, userName: 'Owner', userRole: 'OWNER' },
    });
    const sale = await prisma.salesInvoice.create({
      data: {
        businessId: business.id,
        storeId: store.id,
        tillId: till.id,
        shiftId: opened.id,
        cashierUserId: user.id,
        paymentStatus: 'PAID',
        subtotalPence: 500,
        vatPence: 0,
        totalPence: 500,
        cashReceivedPence: 500,
        grossMarginPence: 300,
        lines: {
          create: {
            productId: product.id,
            unitId: unit.id,
            qtyInUnit: 1,
            conversionToBase: 1,
            qtyBase: 1,
            unitPricePence: 500,
            lineSubtotalPence: 500,
            lineVatPence: 0,
            lineTotalPence: 500,
            lineCostPence: 200,
          },
        },
        payments: {
          create: { method: 'CASH', amountPence: 500, status: 'CONFIRMED' },
        },
      },
    });
    await prisma.cashDrawerEntry.create({
      data: {
        businessId: business.id,
        storeId: store.id,
        tillId: till.id,
        shiftId: opened.id,
        createdByUserId: user.id,
        cashierUserId: user.id,
        entryType: 'CASH_SALE',
        amountPence: 500,
        referenceType: 'SALES_INVOICE',
        referenceId: sale.id,
      },
    });
    const entries = await prisma.cashDrawerEntry.findMany({ where: { shiftId: opened.id } });
    const expected = expectedCashPenceFromEntries(entries, { businessId: business.id, shiftId: opened.id });
    await prisma.shift.update({
      where: { id: opened.id },
      data: { expectedCashPence: expected },
    });
    return { business, store, user, till, product, unit, shiftId: opened.id, saleId: sale.id, expected };
  }

  async function snapshotShift(shiftId: string) {
    const shift = await prisma.shift.findUniqueOrThrow({
      where: { id: shiftId },
      include: { cashDrawerEntries: { orderBy: { id: 'asc' } } },
    });
    const sale = await prisma.salesInvoice.findFirstOrThrow({
      where: { shiftId },
      include: { payments: true, lines: true },
    });
    return {
      expectedCashPence: shift.expectedCashPence,
      actualCashPence: shift.actualCashPence,
      variance: shift.variance,
      closureSnapshotJson: shift.closureSnapshotJson,
      status: shift.status,
      paymentStatus: sale.paymentStatus,
      drawer: shift.cashDrawerEntries.map((row) => ({
        id: row.id,
        entryType: row.entryType,
        amountPence: row.amountPence,
        referenceId: row.referenceId,
      })),
      saleId: sale.id,
    };
  }

  it('rejects owner cleanup of a closed cash sale and leaves the snapshot unchanged', async () => {
    const seeded = await seedTenant('closed');
    expect(seeded.expected).toBe(1500);
    await performShiftClose({
      businessId: seeded.business.id,
      actor: { userId: seeded.user.id, userName: 'Owner', userRole: 'OWNER' },
      shiftId: seeded.shiftId,
      actualCash: 1400,
      notes: 'counted short',
      varianceReasonCode: 'MISSING_CASH',
      varianceReason: 'A9 proof',
      approval: { mode: 'PIN', approvingManagerId: seeded.user.id },
    });
    const before = await snapshotShift(seeded.shiftId);
    expect(before.expectedCashPence).toBe(1500);
    expect(before.actualCashPence).toBe(1400);
    expect(before.variance).toBe(-100);
    expect(before.closureSnapshotJson).toBeTruthy();
    const auditBefore = await prisma.auditLog.count({ where: { businessId: seeded.business.id } });

    await expect(
      cleanupOwnerVoidedSale({ businessId: seeded.business.id, salesInvoiceId: seeded.saleId }),
    ).rejects.toThrow('CLOSED_SHIFT_CLEANUP_REJECTED');

    const after = await snapshotShift(seeded.shiftId);
    expect(after).toEqual(before);
    expect(await prisma.auditLog.count({ where: { businessId: seeded.business.id } })).toBe(auditBefore);

    await expect(
      cleanupOwnerVoidedSale({ businessId: seeded.business.id, salesInvoiceId: seeded.saleId }),
    ).rejects.toThrow('CLOSED_SHIFT_CLEANUP_REJECTED');
    expect(await snapshotShift(seeded.shiftId)).toEqual(before);
  });

  it('gives an owner-override close the same closed-shift protection', async () => {
    const seeded = await seedTenant('override');
    await performShiftClose({
      businessId: seeded.business.id,
      actor: { userId: seeded.user.id, userName: 'Owner', userRole: 'OWNER' },
      shiftId: seeded.shiftId,
      actualCash: 1500,
      notes: 'owner override close',
      varianceReasonCode: null,
      varianceReason: null,
      approval: {
        mode: 'OWNER_OVERRIDE',
        approvingManagerId: seeded.user.id,
        overrideReasonCode: 'EMERGENCY_CLOSE',
        overrideJustification: 'A9 owner override proof',
      },
    });
    const before = await snapshotShift(seeded.shiftId);
    await expect(
      cleanupOwnerVoidedSale({ businessId: seeded.business.id, salesInvoiceId: seeded.saleId }),
    ).rejects.toThrow('CLOSED_SHIFT_CLEANUP_REJECTED');
    expect(await snapshotShift(seeded.shiftId)).toEqual(before);
    expect(before.status).toBe('CLOSED');
  });

  it('cleans an open-shift cash sale once and does not touch another business', async () => {
    const open = await seedTenant('open');
    const other = await seedTenant('other');
    const otherBefore = await snapshotShift(other.shiftId);
    const beforeEntries = await prisma.cashDrawerEntry.findMany({
      where: { shiftId: open.shiftId },
      orderBy: { id: 'asc' },
    });
    expect(beforeEntries.some((row) => row.entryType === 'CASH_SALE')).toBe(true);

    await cleanupOwnerVoidedSale({ businessId: open.business.id, salesInvoiceId: open.saleId });

    const remaining = await prisma.cashDrawerEntry.findMany({ where: { shiftId: open.shiftId } });
    expect(remaining.some((row) => row.referenceId === open.saleId)).toBe(false);
    const canonical = expectedCashPenceFromEntries(remaining, {
      businessId: open.business.id,
      shiftId: open.shiftId,
    });
    const stored = await prisma.shift.findUniqueOrThrow({ where: { id: open.shiftId } });
    expect(stored.status).toBe('OPEN');
    expect(stored.expectedCashPence).toBe(canonical);
    expect(canonical).toBe(1000);
    const sale = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: open.saleId } });
    expect(sale.paymentStatus).toBe('VOID');

    await expect(
      cleanupOwnerVoidedSale({ businessId: open.business.id, salesInvoiceId: open.saleId }),
    ).rejects.toThrow(/already voided/);
    const storedAgain = await prisma.shift.findUniqueOrThrow({ where: { id: open.shiftId } });
    expect(storedAgain.expectedCashPence).toBe(canonical);
    expect(await prisma.cashDrawerEntry.count({ where: { shiftId: open.shiftId } })).toBe(remaining.length);
    expect(await snapshotShift(other.shiftId)).toEqual(otherBefore);
  });
});
