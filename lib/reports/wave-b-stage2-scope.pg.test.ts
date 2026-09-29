/**
 * Disposable Postgres proof for Wave B-Core Stage 2 scope corrections.
 * Weekly Digest must fail closed. Command Center queries must stay inside
 * the authorised store list and date envelope.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

describePg('Wave B Stage 2 store and date scope (Postgres)', () => {
  let prisma: PrismaClient;
  let getWeeklyDigestData: typeof import('@/lib/reports/weekly-digest').getWeeklyDigestData;
  let getCommandCenterKpis: typeof import('@/lib/reports/today-kpis').getCommandCenterKpis;
  let getTopLinkedSupplierForMonth: typeof import('@/lib/reports/supplier-sales').getTopLinkedSupplierForMonth;
  let ReportingScopeStoreError: typeof import('@/lib/reports/reporting-scope').ReportingScopeStoreError;

  const suffix = `wb-s2-${Date.now()}`;
  let businessId = '';
  let otherBusinessId = '';
  let storeA = '';
  let storeB = '';
  let otherStore = '';
  let userId = '';
  let otherUserId = '';
  let tillA = '';
  let tillB = '';
  let tillOther = '';
  let unitId = '';
  let linkedProductId = '';
  let marginProductId = '';

  const weekStart = new Date('2026-09-21T00:00:00.000Z');
  const weekEnd = new Date('2026-09-28T00:00:00.000Z');
  const inWeek = new Date('2026-09-22T12:00:00.000Z');
  const outOfWeek = new Date('2026-09-01T12:00:00.000Z');

  beforeAll(async () => {
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    ({ prisma } = await openTestPrismaClient());
    ({ getWeeklyDigestData } = await import('@/lib/reports/weekly-digest'));
    ({ getCommandCenterKpis } = await import('@/lib/reports/today-kpis'));
    ({ getTopLinkedSupplierForMonth } = await import('@/lib/reports/supplier-sales'));
    ({ ReportingScopeStoreError } = await import('@/lib/reports/reporting-scope'));

    const business = await prisma.business.create({
      data: { name: `Scope ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra', plan: 'STARTER' },
    });
    businessId = business.id;
    const other = await prisma.business.create({
      data: { name: `Other ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra', plan: 'STARTER' },
    });
    otherBusinessId = other.id;
    storeA = (await prisma.store.create({ data: { businessId, name: 'A' } })).id;
    storeB = (await prisma.store.create({ data: { businessId, name: 'B' } })).id;
    otherStore = (await prisma.store.create({ data: { businessId: otherBusinessId, name: 'Foreign' } })).id;
    userId = (await prisma.user.create({
      data: { businessId, email: `${suffix}@example.com`, name: 'Owner', role: 'OWNER', passwordHash: 'x' },
    })).id;
    otherUserId = (await prisma.user.create({
      data: { businessId: otherBusinessId, email: `o-${suffix}@example.com`, name: 'Other', role: 'OWNER', passwordHash: 'x' },
    })).id;
    tillA = (await prisma.till.create({ data: { storeId: storeA, name: 'Till A' } })).id;
    tillB = (await prisma.till.create({ data: { storeId: storeB, name: 'Till B' } })).id;
    tillOther = (await prisma.till.create({ data: { storeId: otherStore, name: 'Till F' } })).id;
    unitId = (await prisma.unit.create({ data: { name: `Piece ${suffix}`, pluralName: 'Pieces' } })).id;
    const supplier = await prisma.supplier.create({ data: { businessId, name: 'Mill' } });
    const otherSupplier = await prisma.supplier.create({ data: { businessId: otherBusinessId, name: 'Foreign Mill' } });
    linkedProductId = (await prisma.product.create({
      data: {
        businessId,
        name: `Rice ${suffix}`,
        sellingPriceBasePence: 1000,
        defaultCostBasePence: 400,
        preferredSupplierId: supplier.id,
      },
    })).id;
    marginProductId = (await prisma.product.create({
      data: {
        businessId,
        name: `Oil ${suffix}`,
        sellingPriceBasePence: 100,
        defaultCostBasePence: 500,
      },
    })).id;
    const otherProduct = await prisma.product.create({
      data: {
        businessId: otherBusinessId,
        name: `Foreign ${suffix}`,
        sellingPriceBasePence: 9000,
        defaultCostBasePence: 100,
        preferredSupplierId: otherSupplier.id,
      },
    });
    const account = await prisma.account.create({
      data: { businessId, code: '6000', name: 'Expenses', type: 'EXPENSE' },
    });

    async function invoice(input: {
      businessId: string;
      storeId: string;
      tillId: string;
      userId: string;
      total: number;
      createdAt: Date;
      discount?: string;
      productId?: string;
      lineCost?: number;
    }) {
      const created = await prisma.salesInvoice.create({
        data: {
          businessId: input.businessId,
          storeId: input.storeId,
          tillId: input.tillId,
          cashierUserId: input.userId,
          paymentStatus: 'PAID',
          subtotalPence: input.total,
          vatPence: 0,
          totalPence: input.total,
          discountOverrideReason: input.discount,
          createdAt: input.createdAt,
        },
      });
      if (input.productId) {
        await prisma.salesInvoiceLine.create({
          data: {
            salesInvoiceId: created.id,
            productId: input.productId,
            unitId,
            qtyInUnit: 1,
            qtyBase: 1,
            unitPricePence: input.total,
            lineSubtotalPence: input.total,
            lineVatPence: 0,
            lineTotalPence: input.total,
            lineCostPence: input.lineCost ?? 0,
            createdAt: input.createdAt,
          },
        });
      }
      return created;
    }

    await invoice({ businessId, storeId: storeA, tillId: tillA, userId, total: 1000, createdAt: inWeek });
    await invoice({ businessId, storeId: storeB, tillId: tillB, userId, total: 5000, createdAt: inWeek });
    await invoice({ businessId: otherBusinessId, storeId: otherStore, tillId: tillOther, userId: otherUserId, total: 9000, createdAt: inWeek });
    await invoice({ businessId, storeId: storeA, tillId: tillA, userId, total: 7000, createdAt: outOfWeek });

    await invoice({ businessId, storeId: storeA, tillId: tillA, userId, total: 1000, createdAt: new Date('2026-09-28T12:00:00.000Z'), discount: 'manager' });
    await invoice({ businessId, storeId: storeB, tillId: tillB, userId, total: 5000, createdAt: new Date('2026-09-28T12:00:00.000Z'), discount: 'other-branch' });
    await invoice({
      businessId,
      storeId: storeB,
      tillId: tillB,
      userId,
      total: 100,
      createdAt: new Date('2026-09-26T12:00:00.000Z'),
      productId: marginProductId,
      lineCost: 500,
    });

    await prisma.expense.create({
      data: {
        businessId,
        storeId: storeA,
        userId,
        accountId: account.id,
        amountPence: 400,
        paymentStatus: 'PAID',
        createdAt: new Date('2026-08-28T12:00:00.000Z'),
      },
    });
    await prisma.expense.create({
      data: {
        businessId,
        storeId: storeB,
        userId,
        accountId: account.id,
        amountPence: 3500,
        paymentStatus: 'PAID',
        createdAt: new Date('2026-08-26T12:00:00.000Z'),
      },
    });

    await invoice({
      businessId,
      storeId: storeA,
      tillId: tillA,
      userId,
      total: 7000,
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
      productId: linkedProductId,
    });
    await invoice({
      businessId,
      storeId: storeA,
      tillId: tillA,
      userId,
      total: 1000,
      createdAt: new Date('2026-01-31T12:00:00.000Z'),
      productId: linkedProductId,
    });
    await invoice({
      businessId,
      storeId: storeB,
      tillId: tillB,
      userId,
      total: 5000,
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
      productId: linkedProductId,
    });
    await invoice({
      businessId: otherBusinessId,
      storeId: otherStore,
      tillId: tillOther,
      userId: otherUserId,
      total: 9000,
      createdAt: new Date('2026-01-15T12:00:00.000Z'),
      productId: otherProduct.id,
    });
  }, 120_000);

  afterAll(async () => {
    await runTestTeardown(prisma, [
      () => prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId: { in: [businessId, otherBusinessId] } } } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }),
      () => prisma.expense.deleteMany({ where: { businessId } }),
      () => prisma.product.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }),
      () => prisma.supplier.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }),
      () => prisma.account.deleteMany({ where: { businessId } }),
      () => prisma.till.deleteMany({ where: { id: { in: [tillA, tillB, tillOther] } } }),
      () => prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } }),
      () => prisma.store.deleteMany({ where: { id: { in: [storeA, storeB, otherStore] } } }),
      () => prisma.unit.deleteMany({ where: { id: unitId } }),
      () => prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } }),
    ], { label: 'wave-b-stage2-scope' });
  }, 120_000);

  function septemberScope(storeIds: string[]) {
    return {
      storeIds,
      startInclusive: new Date('2026-09-15T00:00:00.000Z'),
      endExclusive: new Date('2026-09-30T00:00:00.000Z'),
      now: new Date('2026-09-29T12:00:00.000Z'),
    };
  }

  async function captureQueries(run: () => Promise<unknown>) {
    const { prisma: appPrisma } = await import('@/lib/prisma');
    const queries: string[] = [];
    (appPrisma as unknown as {
      $on: (event: 'query', cb: (entry: { query: string; params: string }) => void) => void;
    }).$on('query', (event) => {
      queries.push(`${event.query}\n${event.params}`);
    });
    const start = queries.length;
    await run();
    return queries.slice(start);
  }

  it('fails closed before Prisma when the digest store list is omitted or empty', async () => {
    const queries = await captureQueries(async () => {
      await expect(getWeeklyDigestData(businessId, weekStart, weekEnd, 'Africa/Accra', undefined as unknown as string[])).rejects.toBeInstanceOf(ReportingScopeStoreError);
      await expect(getWeeklyDigestData(businessId, weekStart, weekEnd, 'Africa/Accra', [])).rejects.toBeInstanceOf(ReportingScopeStoreError);
    });
    expect(queries).toEqual([]);
  });

  it('returns only the authorised digest stores and stays inside the week', async () => {
    const one = await getWeeklyDigestData(businessId, weekStart, weekEnd, 'Africa/Accra', [storeA]);
    const both = await getWeeklyDigestData(businessId, weekStart, weekEnd, 'Africa/Accra', [storeA, storeB]);
    expect(one.totalSalesPence).toBe(1000);
    expect(both.totalSalesPence).toBe(6100);
  });

  it('counts discount overrides and negative-margin lines only for the authorised store', async () => {
    const kpis = await getCommandCenterKpis(businessId, septemberScope([storeA]));
    expect(kpis.discountOverrideCount).toBe(1);
    expect(kpis.negativeMarginProductCount).toBe(0);
    const both = await getCommandCenterKpis(businessId, septemberScope([storeA, storeB]));
    expect(both.discountOverrideCount).toBe(2);
    expect(both.negativeMarginProductCount).toBe(1);
    const foreign = await getCommandCenterKpis(businessId, septemberScope([otherStore]));
    expect(foreign.discountOverrideCount).toBe(0);
    expect(foreign.totalSalesPence).toBe(0);
  });

  it('does not read the 35-day expense window or another branch on the Starter envelope', async () => {
    const queries = await captureQueries(async () => {
      const kpis = await getCommandCenterKpis(businessId, septemberScope([storeA]));
      expect(kpis.fourWeekAvgExpensesPence).toBe(0);
      expect(kpis.avgDailyExpensesPence).toBe(0);
    });
    const sql = queries.join('\n');
    expect(sql).not.toContain('2026-08-28');
    expect(sql).not.toContain('2026-08-26');
    expect(sql).toContain(storeA);
    expect(sql).not.toContain(storeB);
    expect(sql).not.toContain(otherStore);
  });

  it('on 31 January a Starter window does not query before today minus 29 days', async () => {
    const queries = await captureQueries(async () => {
      const kpis = await getCommandCenterKpis(businessId, {
        storeIds: [storeA],
        startInclusive: new Date('2026-01-17T00:00:00.000Z'),
        endExclusive: new Date('2026-02-01T00:00:00.000Z'),
        now: new Date('2026-01-31T15:00:00.000Z'),
      });
      expect(kpis.fourWeekAvgExpensesPence).toBe(0);
    });
    const sql = queries.join('\n');
    expect(sql).not.toContain('2025-12-27');
    expect(sql).not.toContain('2026-01-01');
    expect(sql).toContain('2026-01-17');
  });

  it('top supplier uses the authorised bounds and store, not the whole calendar month', async () => {
    const queries = await captureQueries(async () => {
      await expect(getTopLinkedSupplierForMonth(businessId, [], {
        startInclusive: new Date('2026-01-02T00:00:00.000Z'),
        endExclusive: new Date('2026-02-01T00:00:00.000Z'),
      })).rejects.toBeInstanceOf(ReportingScopeStoreError);
    });
    expect(queries).toEqual([]);
    const top = await getTopLinkedSupplierForMonth(businessId, [storeA], {
      startInclusive: new Date('2026-01-02T00:00:00.000Z'),
      endExclusive: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(top?.totalRevenuePence).toBe(1000);
    const other = await getTopLinkedSupplierForMonth(businessId, [otherStore], {
      startInclusive: new Date('2026-01-02T00:00:00.000Z'),
      endExclusive: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(other).toBeNull();
  });

  it('uses New York local midnights across the March daylight-saving boundary', async () => {
    await prisma.business.update({ where: { id: businessId }, data: { timezone: 'America/New_York' } });
    try {
      const queries = await captureQueries(() => getCommandCenterKpis(businessId, {
        storeIds: [storeA],
        startInclusive: new Date('2026-02-22T05:00:00.000Z'),
        endExclusive: new Date('2026-03-09T04:00:00.000Z'),
        now: new Date('2026-03-08T17:00:00.000Z'),
      }));
      const sql = queries.join('\n');
      expect(sql).toContain('2026-03-01 05:00:00 UTC');
      expect(sql).toContain('2026-02-22 05:00:00 UTC');
      expect(sql).not.toContain('2026-01-02');
    } finally {
      await prisma.business.update({ where: { id: businessId }, data: { timezone: 'Africa/Accra' } });
    }
  });
});
