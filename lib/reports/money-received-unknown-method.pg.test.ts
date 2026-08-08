/**
 * PostgreSQL regression: unrecognised SalesPayment.method values must land in UNKNOWN
 * and keep amount/count reconciliation identities.
 *
 * Requires DATABASE_URL (Postgres). Skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import {
  RECEIPT_METHOD_LABELS,
  sumMoneyReceivedByMethod,
  UNKNOWN_RECEIPT_METHOD,
} from '@/lib/reports/money-received';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);
const describePg = canRun ? describe : describe.skip;

describePg('money received unknown payment-method reconciliation (Postgres)', () => {
  let prisma: PrismaClient;
  let getMoneyReceivedSummary: typeof import('@/lib/reports/money-received').getMoneyReceivedSummary;
  let listMoneyReceivedPayments: typeof import('@/lib/reports/money-received').listMoneyReceivedPayments;
  let resolveReportingScope: typeof import('@/lib/reports/reporting-scope').resolveReportingScope;

  const suffix = `unkm-${Date.now()}`;
  let businessId = '';
  let otherBusinessId = '';
  let storeId = '';
  let otherStoreId = '';
  let tillId = '';
  let cashierId = '';
  let invoiceId = '';
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

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: { name: `UnkM ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    businessId = business.id;
    const other = await prisma.business.create({
      data: { name: `UnkM Other ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    otherBusinessId = other.id;

    const store = await prisma.store.create({ data: { businessId, name: `Store ${suffix}` } });
    storeId = store.id;
    const otherStore = await prisma.store.create({
      data: { businessId: otherBusinessId, name: `Other ${suffix}` },
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
    cashierId = cashier.id;
    const otherCashier = await prisma.user.create({
      data: {
        businessId: otherBusinessId,
        email: `o-${suffix}@example.com`,
        name: 'Other',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });

    const till = await prisma.till.create({ data: { storeId, name: `Till ${suffix}` } });
    tillId = till.id;
    const otherTill = await prisma.till.create({
      data: { storeId: otherStoreId, name: `Other till ${suffix}` },
    });

    const invoice = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        paymentStatus: 'PAID',
        subtotalPence: 10000,
        vatPence: 0,
        totalPence: 10000,
        createdAt: saleAt,
      },
    });
    invoiceId = invoice.id;

    // Recognised + unrecognised (exact match only — wrong case is UNKNOWN).
    await prisma.salesPayment.createMany({
      data: [
        {
          id: `um-cash-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'CASH',
          amountPence: 1000,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          id: `um-card-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'CARD',
          amountPence: 2000,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          id: `um-xfer-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'TRANSFER',
          amountPence: 500,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          id: `um-momo-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'MOBILE_MONEY',
          amountPence: 700,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'LATER_CREDIT_COLLECTION',
        },
        {
          id: `um-cheque-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'CHEQUE',
          amountPence: 300,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          id: `um-blank-${suffix}`,
          salesInvoiceId: invoiceId,
          method: '',
          amountPence: 110,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'UNCLASSIFIED',
        },
        {
          id: `um-ws-${suffix}`,
          salesInvoiceId: invoiceId,
          method: '   ',
          amountPence: 90,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: null,
        },
        {
          id: `um-case-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'cash',
          amountPence: 40,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          id: `um-legacy-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'CRYPTO_FUTURE',
          amountPence: 25,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'RECEIVED_AT_SALE',
        },
        {
          id: `um-neg-${suffix}`,
          salesInvoiceId: invoiceId,
          method: 'CHEQUE',
          amountPence: -15,
          receivedAt: saleAt,
          status: 'CONFIRMED',
          receiptOrigin: 'UNCLASSIFIED',
        },
      ],
    });

    // Foreign tenant payment must never enter totals.
    await prisma.salesInvoice.create({
      data: {
        businessId: otherBusinessId,
        storeId: otherStoreId,
        tillId: otherTill.id,
        cashierUserId: otherCashier.id,
        paymentStatus: 'PAID',
        subtotalPence: 99999,
        vatPence: 0,
        totalPence: 99999,
        createdAt: saleAt,
        payments: {
          create: {
            method: 'CHEQUE',
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

  function dayScope(store: string = 'ALL') {
    return resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-07', to: '2026-08-07', storeId: store },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
  }

  it('places every unrecognised method in UNKNOWN and reconciles amount + count', async () => {
    const summary = await getMoneyReceivedSummary(dayScope());

    // Known exact matches only
    expect(summary.byMethod.CASH).toBe(1000);
    expect(summary.byMethod.CARD).toBe(2000);
    expect(summary.byMethod.TRANSFER).toBe(500);
    expect(summary.byMethod.MOBILE_MONEY).toBe(700);

    // CHEQUE(300) + blank(110) + whitespace(90) + cash(40) + CRYPTO(25) + CHEQUE(-15)
    expect(summary.byMethod.UNKNOWN).toBe(300 + 110 + 90 + 40 + 25 - 15);
    expect(summary.byMethodCount.UNKNOWN).toBe(6);

    expect(sumMoneyReceivedByMethod(summary.byMethod)).toBe(summary.totalPence);
    expect(
      summary.byMethodCount.CASH
        + summary.byMethodCount.CARD
        + summary.byMethodCount.TRANSFER
        + summary.byMethodCount.MOBILE_MONEY
        + summary.byMethodCount.UNKNOWN,
    ).toBe(summary.totalCount);

    expect(
      summary.receivedAtSalePence
        + summary.laterCreditCollectionPence
        + summary.unknownHistoricalOriginPence,
    ).toBe(summary.totalPence);
    expect(
      summary.receivedAtSaleCount
        + summary.laterCreditCollectionCount
        + summary.unknownHistoricalOriginCount,
    ).toBe(summary.totalCount);

    // Foreign CHEQUE excluded
    expect(summary.totalPence).toBe(1000 + 2000 + 500 + 700 + 550);
    expect(summary.totalCount).toBe(10);
    expect(RECEIPT_METHOD_LABELS[UNKNOWN_RECEIPT_METHOD]).toBe('Unknown/Other');
  });

  it('UNKNOWN method filter returns only unrecognised rows and preserves known filters', async () => {
    const scope = dayScope();
    const unknownListed = await listMoneyReceivedPayments({
      scope,
      method: 'UNKNOWN',
      page: 1,
      pageSize: 50,
    });
    expect(unknownListed.totalCount).toBe(6);
    expect(unknownListed.rows.every((r) => r.methodBucket === 'UNKNOWN')).toBe(true);
    expect(unknownListed.rows.every((r) => r.methodLabel === 'Unknown/Other')).toBe(true);
    expect(unknownListed.rows.some((r) => r.method === 'CHEQUE')).toBe(true);
    expect(unknownListed.rows.some((r) => r.method === 'cash')).toBe(true);
    expect(unknownListed.rows.every((r) => r.method !== 'CASH')).toBe(true);

    const cashListed = await listMoneyReceivedPayments({
      scope,
      method: 'CASH',
      page: 1,
      pageSize: 50,
    });
    expect(cashListed.totalCount).toBe(1);
    expect(cashListed.rows[0]?.method).toBe('CASH');
    expect(cashListed.rows[0]?.amountPence).toBe(1000);
  });

  it('pagination does not change authorised totals', async () => {
    const scope = dayScope();
    const summary = await getMoneyReceivedSummary(scope);
    const page1 = await listMoneyReceivedPayments({ scope, page: 1, pageSize: 3 });
    const page2 = await listMoneyReceivedPayments({ scope, page: 2, pageSize: 3 });
    expect(page1.totalCount).toBe(summary.totalCount);
    expect(page2.totalCount).toBe(summary.totalCount);
    expect(page1.pageSize).toBe(3);
    expect(page1.rows.length + page2.rows.length).toBeLessThanOrEqual(6);
  });

  it('store filter and cross-tenant scope fail closed', async () => {
    const ownStore = await getMoneyReceivedSummary(dayScope(storeId));
    expect(ownStore.totalCount).toBe(10);

    // Inaccessible / foreign store id must not broaden scope (resolveReportingScope fail-closed).
    const blocked = resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-07', to: '2026-08-07', storeId: otherStoreId },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
    // When store is not allowed, scope typically falls back to ALL or rejects — assert no foreign leak.
    const summary = await getMoneyReceivedSummary(blocked);
    expect(summary.totalPence).toBeLessThan(99999);
    expect(summary.byMethod.UNKNOWN).toBeLessThan(99999);
  });
});
