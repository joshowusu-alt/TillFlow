/**
 * Postgres integration: money-received aggregates and payment-record drill-down.
 *
 * Requires DATABASE_URL (Postgres). Skipped otherwise.
 *
 *   set DATABASE_URL=postgres://...
 *   npx vitest run lib/reports/money-received.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

const databaseUrl = process.env.DATABASE_URL;
const canRun = !!databaseUrl && isPostgresDatabaseUrl(databaseUrl);
const describePg = canRun ? describe : describe.skip;

describePg('money received reconciliation (Postgres)', () => {
  let prisma: PrismaClient;
  let getMoneyReceivedSummary: typeof import('@/lib/reports/money-received').getMoneyReceivedSummary;
  let listMoneyReceivedPayments: typeof import('@/lib/reports/money-received').listMoneyReceivedPayments;
  let getSalesRevenueSummary: typeof import('@/lib/reports/sales-revenue').getSalesRevenueSummary;
  let resolveReportingScope: typeof import('@/lib/reports/reporting-scope').resolveReportingScope;
  let findTenantSalesPayment: typeof import('@/lib/reports/money-received').findTenantSalesPayment;

  const suffix = `recv-${Date.now()}`;
  let businessId = '';
  let otherBusinessId = '';
  let storeId = '';
  let tillId = '';
  let cashierId = '';
  let customerId = '';
  let cashSaleId = '';
  let momoSaleId = '';
  let creditSaleId = '';
  let laterMomoPaymentId = '';
  let foreignPaymentId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();

    const money = await import('@/lib/reports/money-received');
    const sales = await import('@/lib/reports/sales-revenue');
    const scope = await import('@/lib/reports/reporting-scope');
    getMoneyReceivedSummary = money.getMoneyReceivedSummary;
    listMoneyReceivedPayments = money.listMoneyReceivedPayments;
    findTenantSalesPayment = money.findTenantSalesPayment;
    getSalesRevenueSummary = sales.getSalesRevenueSummary;
    resolveReportingScope = scope.resolveReportingScope;

    prisma = new PrismaClient();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: {
        name: `Recv ${suffix}`,
        currency: 'GHS',
        timezone: 'Africa/Accra',
      },
    });
    businessId = business.id;

    const other = await prisma.business.create({
      data: { name: `Other ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    otherBusinessId = other.id;

    const store = await prisma.store.create({
      data: { businessId, name: `Store ${suffix}` },
    });
    storeId = store.id;

    const otherStore = await prisma.store.create({
      data: { businessId: otherBusinessId, name: `Other store ${suffix}` },
    });

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
        email: `other-${suffix}@example.com`,
        name: 'Other',
        role: 'OWNER',
        passwordHash: 'x',
      },
    });

    const till = await prisma.till.create({
      data: { storeId, name: `Till ${suffix}` },
    });
    tillId = till.id;

    const otherTill = await prisma.till.create({
      data: { storeId: otherStore.id, name: `Other till ${suffix}` },
    });

    const customer = await prisma.customer.create({
      data: { businessId, storeId, name: `Cust ${suffix}` },
    });
    customerId = customer.id;

    const saleAt = new Date('2026-08-07T10:00:00.000Z');

    // Cash sale GH₵40
    const cashSale = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        paymentStatus: 'PAID',
        subtotalPence: 4000,
        vatPence: 0,
        totalPence: 4000,
        createdAt: saleAt,
        payments: {
          create: {
            method: 'CASH',
            amountPence: 4000,
            receivedAt: saleAt,
            status: 'CONFIRMED',
            receiptOrigin: 'RECEIVED_AT_SALE',
          },
        },
      },
    });
    cashSaleId = cashSale.id;

    // MoMo sale GH₵60
    const momoSale = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        paymentStatus: 'PAID',
        subtotalPence: 6000,
        vatPence: 0,
        totalPence: 6000,
        createdAt: saleAt,
        payments: {
          create: {
            method: 'MOBILE_MONEY',
            amountPence: 6000,
            receivedAt: new Date(saleAt.getTime() + 1_000),
            status: 'CONFIRMED',
            receiptOrigin: 'RECEIVED_AT_SALE',
          },
        },
      },
    });
    momoSaleId = momoSale.id;

    // Credit sale GH₵100 with GH₵30 cash at sale; GH₵70 later MoMo added in collection test.
    const creditSale = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        customerId,
        paymentStatus: 'PART_PAID',
        subtotalPence: 10000,
        vatPence: 0,
        totalPence: 10000,
        createdAt: saleAt,
        payments: {
          create: {
            method: 'CASH',
            amountPence: 3000,
            receivedAt: saleAt,
            status: 'CONFIRMED',
            receiptOrigin: 'RECEIVED_AT_SALE',
          },
        },
      },
    });
    creditSaleId = creditSale.id;
    laterMomoPaymentId = '';

    // Foreign-tenant payment
    const foreignSale = await prisma.salesInvoice.create({
      data: {
        businessId: otherBusinessId,
        storeId: otherStore.id,
        tillId: otherTill.id,
        cashierUserId: otherCashier.id,
        paymentStatus: 'PAID',
        subtotalPence: 9999,
        vatPence: 0,
        totalPence: 9999,
        createdAt: saleAt,
        payments: {
          create: {
            method: 'MOBILE_MONEY',
            amountPence: 9999,
            receivedAt: saleAt,
            status: 'CONFIRMED',
            receiptOrigin: 'RECEIVED_AT_SALE',
          },
        },
      },
    });
    const foreignPayment = await prisma.salesPayment.findFirst({
      where: { salesInvoiceId: foreignSale.id },
    });
    foreignPaymentId = foreignPayment!.id;
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.salesPayment.deleteMany({
      where: { salesInvoice: { businessId: { in: [businessId, otherBusinessId] } } },
    }).catch(() => {});
    await prisma.salesInvoice.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    }).catch(() => {});
    await prisma.customer.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }).catch(() => {});
    await prisma.till.deleteMany({ where: { store: { businessId: { in: [businessId, otherBusinessId] } } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }).catch(() => {});
    await prisma.store.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }).catch(() => {});
    await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  it('reconciles sales revenue and money received for the sale day', async () => {
    const scope = resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-07', to: '2026-08-07', storeId: 'ALL' },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });

    const revenue = await getSalesRevenueSummary(scope);
    const receipts = await getMoneyReceivedSummary(scope);

    // Cash 40 + MoMo 60 + Credit 100 = 200 sales revenue
    expect(revenue.salesRevenuePence).toBe(20000);
    // Sale-day receipts: 40 + 60 + 30 = 130 (later MoMo not yet)
    expect(receipts.totalPence).toBe(13000);
    expect(receipts.byMethod.CASH).toBe(7000);
    expect(receipts.byMethod.MOBILE_MONEY).toBe(6000);
    expect(receipts.receivedAtSalePence).toBe(13000);
    expect(receipts.laterCreditCollectionPence).toBe(0);
    expect(receipts.unknownHistoricalOriginPence).toBe(0);
    expect(receipts.byMethod.CASH + receipts.byMethod.CARD + receipts.byMethod.TRANSFER + receipts.byMethod.MOBILE_MONEY + receipts.byMethod.UNKNOWN)
      .toBe(receipts.totalPence);
    expect(
      receipts.byMethodCount.CASH
        + receipts.byMethodCount.CARD
        + receipts.byMethodCount.TRANSFER
        + receipts.byMethodCount.MOBILE_MONEY
        + receipts.byMethodCount.UNKNOWN,
    ).toBe(receipts.totalCount);
    expect(
      receipts.receivedAtSalePence
        + receipts.laterCreditCollectionPence
        + receipts.unknownHistoricalOriginPence,
    ).toBe(receipts.totalPence);
    expect(
      receipts.receivedAtSaleCount
        + receipts.laterCreditCollectionCount
        + receipts.unknownHistoricalOriginCount,
    ).toBe(receipts.totalCount);
    expect(revenue.creditSalesOutstandingPence).toBe(7000);
  });

  it('attributes later MoMo collection to collection date without inflating revenue', async () => {
    const laterAt = new Date('2026-08-08T11:00:00.000Z');
    const laterPayment = await prisma.salesPayment.create({
      data: {
        salesInvoiceId: creditSaleId,
        method: 'MOBILE_MONEY',
        amountPence: 7000,
        receivedAt: laterAt,
        status: 'CONFIRMED',
        receiptOrigin: 'LATER_CREDIT_COLLECTION',
      },
    });
    laterMomoPaymentId = laterPayment.id;
    await prisma.salesInvoice.update({
      where: { id: creditSaleId },
      data: { paymentStatus: 'PAID' },
    });

    const scope = resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-08', to: '2026-08-08', storeId: 'ALL' },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-08T12:00:00.000Z'),
    });

    const revenue = await getSalesRevenueSummary(scope);
    const receipts = await getMoneyReceivedSummary(scope);
    expect(revenue.salesRevenuePence).toBe(0);
    expect(receipts.byMethod.MOBILE_MONEY).toBe(7000);
    expect(receipts.laterCreditCollectionPence).toBe(7000);
    expect(receipts.receivedAtSalePence).toBe(0);

    const listed = await listMoneyReceivedPayments({
      scope,
      method: 'MOBILE_MONEY',
      page: 1,
      pageSize: 25,
    });
    expect(listed.totalCount).toBe(1);
    expect(listed.rows[0]?.paymentId).toBe(laterMomoPaymentId);
    expect(listed.rows[0]?.classification).toBe('LATER_CREDIT_COLLECTION');
    expect(listed.rows[0]?.amountPence).toBe(7000);
    expect(listed.rows[0]?.invoiceId).toBe(creditSaleId);
  });

  it('MoMo drill-down on sale day shows only MoMo component amounts', async () => {
    const scope = resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-07', to: '2026-08-07', storeId: 'ALL' },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
    const listed = await listMoneyReceivedPayments({
      scope,
      method: 'MOBILE_MONEY',
      page: 1,
    });
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]?.amountPence).toBe(6000);
    expect(listed.rows[0]?.invoiceId).toBe(momoSaleId);
    expect(listed.rows[0]?.classification).toBe('RECEIVED_AT_SALE');
  });

  it('hides foreign-tenant payment ids', async () => {
    const own = await findTenantSalesPayment({ businessId, paymentId: laterMomoPaymentId });
    const foreign = await findTenantSalesPayment({ businessId, paymentId: foreignPaymentId });
    const missing = await findTenantSalesPayment({ businessId, paymentId: 'does-not-exist' });
    expect(own?.id).toBe(laterMomoPaymentId);
    expect(foreign).toBeNull();
    expect(missing).toBeNull();
    void cashSaleId;
    void tillId;
  });

  it('keeps historical NULL origins unclassified and does not use five-minute proximity', async () => {
    const nearSale = new Date('2026-08-07T10:02:00.000Z'); // within old 5-minute window
    const invoice = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        paymentStatus: 'PAID',
        subtotalPence: 2500,
        vatPence: 0,
        totalPence: 2500,
        createdAt: new Date('2026-08-07T10:00:00.000Z'),
        payments: {
          create: {
            method: 'CARD',
            amountPence: 2500,
            receivedAt: nearSale,
            status: 'CONFIRMED',
            receiptOrigin: null,
          },
        },
      },
    });

    // Explicit later collection within five minutes of invoice create — must stay later.
    const explicitLater = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        paymentStatus: 'PART_PAID',
        subtotalPence: 8000,
        vatPence: 0,
        totalPence: 8000,
        createdAt: new Date('2026-08-07T10:00:00.000Z'),
        payments: {
          create: {
            method: 'CASH',
            amountPence: 1500,
            receivedAt: nearSale,
            status: 'CONFIRMED',
            receiptOrigin: 'LATER_CREDIT_COLLECTION',
          },
        },
      },
    });

    // Explicit at-sale far after invoice create — must stay at-sale.
    const lateButAtSale = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId,
        tillId,
        cashierUserId: cashierId,
        paymentStatus: 'PAID',
        subtotalPence: 1100,
        vatPence: 0,
        totalPence: 1100,
        createdAt: new Date('2026-08-07T10:00:00.000Z'),
        payments: {
          create: {
            method: 'TRANSFER',
            amountPence: 1100,
            receivedAt: new Date('2026-08-07T12:00:00.000Z'),
            status: 'CONFIRMED',
            receiptOrigin: 'RECEIVED_AT_SALE',
          },
        },
      },
    });

    const scope = resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-07', to: '2026-08-07', storeId: 'ALL' },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
    const receipts = await getMoneyReceivedSummary(scope);
    expect(receipts.unknownHistoricalOriginPence).toBeGreaterThanOrEqual(2500);
    expect(
      receipts.receivedAtSalePence
        + receipts.laterCreditCollectionPence
        + receipts.unknownHistoricalOriginPence,
    ).toBe(receipts.totalPence);
    expect(
      receipts.receivedAtSaleCount
        + receipts.laterCreditCollectionCount
        + receipts.unknownHistoricalOriginCount,
    ).toBe(receipts.totalCount);

    const unknownListed = await listMoneyReceivedPayments({
      scope,
      origin: 'UNCLASSIFIED',
      page: 1,
      pageSize: 50,
    });
    expect(unknownListed.rows.some((r) => r.invoiceId === invoice.id)).toBe(true);
    expect(unknownListed.rows.every((r) => r.classification === 'UNCLASSIFIED')).toBe(true);

    const laterListed = await listMoneyReceivedPayments({
      scope,
      origin: 'LATER_CREDIT_COLLECTION',
      page: 1,
      pageSize: 50,
    });
    expect(laterListed.rows.some((r) => r.invoiceId === explicitLater.id && r.amountPence === 1500)).toBe(true);

    const atSaleListed = await listMoneyReceivedPayments({
      scope,
      origin: 'RECEIVED_AT_SALE',
      method: 'TRANSFER',
      page: 1,
      pageSize: 50,
    });
    expect(atSaleListed.rows.some((r) => r.invoiceId === lateButAtSale.id)).toBe(true);
  });

  it('paginates without changing authorised totals', async () => {
    const scope = resolveReportingScope({
      businessId,
      timeZone: 'Africa/Accra',
      params: { period: 'custom', from: '2026-08-07', to: '2026-08-07', storeId: 'ALL' },
      allowedStoreIds: [storeId],
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
    const summary = await getMoneyReceivedSummary(scope);
    const page1 = await listMoneyReceivedPayments({ scope, page: 1, pageSize: 2 });
    const page2 = await listMoneyReceivedPayments({ scope, page: 2, pageSize: 2 });
    expect(page1.totalCount).toBe(page2.totalCount);
    expect(page1.pageSize).toBe(2);
    expect(page1.rows.length).toBeLessThanOrEqual(2);
    const pageSum =
      [...page1.rows, ...page2.rows].reduce((s, r) => s + r.amountPence, 0);
    // Totals come from complete scope, not the current page alone.
    expect(summary.totalPence).toBeGreaterThanOrEqual(pageSum);
    expect(page1.totalCount).toBeGreaterThan(2);
  });
});
