/**
 * PostgreSQL: invalid/inaccessible storeId must not broaden Money received
 * summary or list to ALL-store data.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);
const describePg = canRun ? describe : describe.skip;

describePg('money received store-scope fail-closed (Postgres)', () => {
  let prisma: PrismaClient;
  let getMoneyReceivedSummary: typeof import('@/lib/reports/money-received').getMoneyReceivedSummary;
  let listMoneyReceivedPayments: typeof import('@/lib/reports/money-received').listMoneyReceivedPayments;
  let resolveReportingScope: typeof import('@/lib/reports/reporting-scope').resolveReportingScope;
  let ReportingScopeStoreError: typeof import('@/lib/reports/reporting-scope').ReportingScopeStoreError;

  const suffix = `store-fc-${Date.now()}`;
  let businessId = '';
  let otherBusinessId = '';
  let storeA = '';
  let storeB = '';
  let otherStoreId = '';
  const saleAt = new Date('2026-08-07T10:00:00.000Z');

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();

    const money = await import('@/lib/reports/money-received');
    const scope = await import('@/lib/reports/reporting-scope');
    getMoneyReceivedSummary = money.getMoneyReceivedSummary;
    listMoneyReceivedPayments = money.listMoneyReceivedPayments;
    resolveReportingScope = scope.resolveReportingScope;
    ReportingScopeStoreError = scope.ReportingScopeStoreError;

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: { name: `StoreFC ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    businessId = business.id;
    const other = await prisma.business.create({
      data: { name: `StoreFC Other ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    otherBusinessId = other.id;

    const a = await prisma.store.create({ data: { businessId, name: `A ${suffix}` } });
    const b = await prisma.store.create({ data: { businessId, name: `B ${suffix}` } });
    storeA = a.id;
    storeB = b.id;
    const otherStore = await prisma.store.create({
      data: { businessId: otherBusinessId, name: `Foreign ${suffix}` },
    });
    otherStoreId = otherStore.id;

    const cashier = await prisma.user.create({
      data: {
        businessId,
        email: `${suffix}@example.com`,
        name: 'Cashier',
        role: 'CASHIER',
        passwordHash: 'x',
      },
    });
    const otherCashier = await prisma.user.create({
      data: {
        businessId: otherBusinessId,
        email: `o-${suffix}@example.com`,
        name: 'Other',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });

    const tillA = await prisma.till.create({ data: { storeId: storeA, name: `TillA ${suffix}` } });
    const tillB = await prisma.till.create({ data: { storeId: storeB, name: `TillB ${suffix}` } });
    const tillOther = await prisma.till.create({
      data: { storeId: otherStoreId, name: `TillF ${suffix}` },
    });

    const invA = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId: storeA,
        tillId: tillA.id,
        cashierUserId: cashier.id,
        paymentStatus: 'PAID',
        subtotalPence: 1000,
        vatPence: 0,
        totalPence: 1000,
        createdAt: saleAt,
      },
    });
    const invB = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId: storeB,
        tillId: tillB.id,
        cashierUserId: cashier.id,
        paymentStatus: 'PAID',
        subtotalPence: 2000,
        vatPence: 0,
        totalPence: 2000,
        createdAt: saleAt,
      },
    });
    await prisma.salesPayment.createMany({
      data: [
        {
          salesInvoiceId: invA.id,
          method: 'CASH',
          amountPence: 1000,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          salesInvoiceId: invB.id,
          method: 'CARD',
          amountPence: 2000,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
      ],
    });

    await prisma.salesInvoice.create({
      data: {
        businessId: otherBusinessId,
        storeId: otherStoreId,
        tillId: tillOther.id,
        cashierUserId: otherCashier.id,
        paymentStatus: 'PAID',
        subtotalPence: 99999,
        vatPence: 0,
        totalPence: 99999,
        createdAt: saleAt,
        payments: {
          create: {
            method: 'CASH',
            amountPence: 99999,
            receivedAt: saleAt,
            status: 'CONFIRMED',
            receiptOrigin: 'RECEIVED_AT_SALE',
          },
        },
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.salesPayment.deleteMany({
      where: { salesInvoice: { businessId: { in: [businessId, otherBusinessId] } } },
    }).catch(() => {});
    await prisma.salesInvoice.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    }).catch(() => {});
    await prisma.till.deleteMany({
      where: { store: { businessId: { in: [businessId, otherBusinessId] } } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    }).catch(() => {});
    await prisma.store.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    }).catch(() => {});
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  function scope(storeId?: string) {
    return resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: {
        period: 'custom',
        from: '2026-08-07',
        to: '2026-08-07',
        ...(storeId === undefined ? {} : { storeId }),
      },
      allowedStoreIds: [storeA, storeB],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
  }

  it('omitted and ALL return all accessible stores only; never foreign tenant', async () => {
    const omitted = await getMoneyReceivedSummary(scope());
    const all = await getMoneyReceivedSummary(scope('ALL'));
    expect(omitted.totalPence).toBe(3000);
    expect(all.totalPence).toBe(3000);
    expect(omitted.totalCount).toBe(2);
    expect(all.byMethod.UNKNOWN).toBe(0);
  });

  it('valid accessible stores isolate amounts; second store differs', async () => {
    const a = await getMoneyReceivedSummary(scope(storeA));
    const b = await getMoneyReceivedSummary(scope(storeB));
    expect(a.totalPence).toBe(1000);
    expect(b.totalPence).toBe(2000);
    expect(a.byMethod.CASH).toBe(1000);
    expect(b.byMethod.CARD).toBe(2000);

    const listA = await listMoneyReceivedPayments({ scope: scope(storeA), page: 1, pageSize: 50 });
    expect(listA.totalCount).toBe(1);
    expect(listA.rows.every((r) => r.storeId === storeA)).toBe(true);
  });

  it('unknown, blank, whitespace and foreign store fail closed before any query', async () => {
    for (const bad of ['store-missing', '', '   ', otherStoreId]) {
      expect(() => scope(bad)).toThrow(ReportingScopeStoreError);
    }
  });

  it('summary and list stay consistent; pagination cannot bypass store isolation', async () => {
    const s = scope(storeA);
    const summary = await getMoneyReceivedSummary(s);
    const page1 = await listMoneyReceivedPayments({ scope: s, page: 1, pageSize: 1 });
    const page2 = await listMoneyReceivedPayments({ scope: s, page: 2, pageSize: 1 });
    expect(page1.totalCount).toBe(summary.totalCount);
    expect(page2.totalCount).toBe(summary.totalCount);
    expect(page1.rows.every((r) => r.storeId === storeA)).toBe(true);
    expect(page2.rows.every((r) => r.storeId === storeA)).toBe(true);
    expect(summary.totalPence).toBe(
      summary.byMethod.CASH
        + summary.byMethod.CARD
        + summary.byMethod.TRANSFER
        + summary.byMethod.MOBILE_MONEY
        + summary.byMethod.UNKNOWN,
    );
  });
});
