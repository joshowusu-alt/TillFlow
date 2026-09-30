/**
 * Disposable Postgres evidence for Today.
 * Sales, confirmed receipts, store predicates and half-open bounds are checked
 * against rows. The query log must name the business, the authorised store and
 * the tenant-local window.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { loadToday, type TodayLoadInput } from '@/lib/reports/today/load';
import { buildTodayWindows } from '@/lib/reports/today/windows';

const canRun = canRunLivePostgresTests();
const describePg = canRun ? describe : describe.skip;

describePg('Today live scope (Postgres)', () => {
  let prisma: PrismaClient;
  const queries: Array<{ query: string; params: string }> = [];
  const suffix = `today-${Date.now()}`;
  const now = new Date('2026-08-07T10:00:00.000Z');
  let businessId = '';
  let otherBusinessId = '';
  let storeA = '';
  let storeB = '';
  let otherStoreId = '';
  let lineId = '';

  beforeAll(async () => {
    ({ prisma } = await openTestPrismaClient({
      onQuery: (event) => queries.push(event),
    }));

    const business = await prisma.business.create({
      data: { name: `Today ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    businessId = business.id;
    const other = await prisma.business.create({
      data: { name: `Today other ${suffix}`, currency: 'GHS', timezone: 'Africa/Accra' },
    });
    otherBusinessId = other.id;
    const a = await prisma.store.create({ data: { businessId, name: `Accra ${suffix}` } });
    const b = await prisma.store.create({ data: { businessId, name: `Tema ${suffix}` } });
    const foreign = await prisma.store.create({ data: { businessId: otherBusinessId, name: `Foreign ${suffix}` } });
    storeA = a.id;
    storeB = b.id;
    otherStoreId = foreign.id;

    const cashier = await prisma.user.create({
      data: { businessId, email: `${suffix}@example.com`, name: 'Cashier', role: 'CASHIER', passwordHash: 'x' },
    });
    const otherUser = await prisma.user.create({
      data: { businessId: otherBusinessId, email: `o-${suffix}@example.com`, name: 'Other', role: 'OWNER', passwordHash: 'x' },
    });
    const tillA = await prisma.till.create({ data: { storeId: storeA, name: `Front ${suffix}` } });
    const tillB = await prisma.till.create({ data: { storeId: storeB, name: `Tema till ${suffix}` } });
    const tillF = await prisma.till.create({ data: { storeId: otherStoreId, name: `Foreign till ${suffix}` } });
    const unit = await prisma.unit.create({ data: { name: `Each ${suffix}`, pluralName: 'Each' } });
    const local = await prisma.product.create({
      data: { businessId, name: `Local Rice ${suffix}`, sellingPriceBasePence: 1500, defaultCostBasePence: 0 },
    });
    const otherProduct = await prisma.product.create({
      data: { businessId, name: `Tema Rice ${suffix}`, sellingPriceBasePence: 5000, defaultCostBasePence: 100 },
    });

    const paid = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId: storeA,
        tillId: tillA.id,
        cashierUserId: cashier.id,
        paymentStatus: 'PAID',
        subtotalPence: 1500,
        vatPence: 0,
        totalPence: 1500,
        createdAt: now,
      },
    });
    const line = await prisma.salesInvoiceLine.create({
      data: {
        salesInvoiceId: paid.id,
        productId: local.id,
        unitId: unit.id,
        qtyInUnit: 1,
        qtyBase: 1,
        unitPricePence: 1500,
        lineSubtotalPence: 1500,
        lineVatPence: 0,
        lineTotalPence: 1500,
        lineCostPence: 0,
      },
    });
    lineId = line.id;
    await prisma.salesPayment.createMany({
      data: [
        { salesInvoiceId: paid.id, method: 'CASH', amountPence: 1500, receivedAt: now, status: 'CONFIRMED', receiptOrigin: 'RECEIVED_AT_SALE' },
        { salesInvoiceId: paid.id, method: 'MOBILE_MONEY', amountPence: 700, receivedAt: now, status: 'PENDING_MANUAL', receiptOrigin: 'RECEIVED_AT_SALE' },
      ],
    });

    const returned = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId: storeA,
        tillId: tillA.id,
        cashierUserId: cashier.id,
        paymentStatus: 'RETURNED',
        subtotalPence: 800,
        vatPence: 0,
        totalPence: 800,
        createdAt: now,
      },
    });
    await prisma.salesPayment.create({
      data: { salesInvoiceId: returned.id, method: 'CASH', amountPence: 800, receivedAt: now, status: 'CONFIRMED', receiptOrigin: 'RECEIVED_AT_SALE' },
    });
    await prisma.salesReturn.create({
      data: { salesInvoiceId: returned.id, storeId: storeA, userId: cashier.id, type: 'FULL', refundAmountPence: 800 },
    });
    await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId: storeA,
        tillId: tillA.id,
        cashierUserId: cashier.id,
        paymentStatus: 'VOID',
        subtotalPence: 900,
        vatPence: 0,
        totalPence: 900,
        createdAt: now,
      },
    });
    const tema = await prisma.salesInvoice.create({
      data: {
        businessId,
        storeId: storeB,
        tillId: tillB.id,
        cashierUserId: cashier.id,
        paymentStatus: 'PAID',
        subtotalPence: 5000,
        vatPence: 0,
        totalPence: 5000,
        createdAt: now,
      },
    });
    await prisma.salesInvoiceLine.create({
      data: {
        salesInvoiceId: tema.id,
        productId: otherProduct.id,
        unitId: unit.id,
        qtyInUnit: 1,
        qtyBase: 1,
        unitPricePence: 5000,
        lineSubtotalPence: 5000,
        lineVatPence: 0,
        lineTotalPence: 5000,
        lineCostPence: 100,
      },
    });
    await prisma.salesInvoice.create({
      data: {
        businessId: otherBusinessId,
        storeId: otherStoreId,
        tillId: tillF.id,
        cashierUserId: otherUser.id,
        paymentStatus: 'PAID',
        subtotalPence: 99999,
        vatPence: 0,
        totalPence: 99999,
        createdAt: now,
        payments: {
          create: { method: 'CASH', amountPence: 99999, receivedAt: now, status: 'CONFIRMED', receiptOrigin: 'RECEIVED_AT_SALE' },
        },
      },
    });

    await prisma.shift.createMany({
      data: [
        { tillId: tillA.id, userId: cashier.id, status: 'OPEN', openedAt: new Date('2026-08-06T10:00:00.000Z'), closedAt: null },
        { tillId: tillA.id, userId: cashier.id, status: 'CLOSED', openedAt: now, closedAt: new Date('2026-08-07T15:00:00.000Z'), variance: -400, actualCashPence: 1000 },
        { tillId: tillA.id, userId: cashier.id, status: 'CLOSED', openedAt: now, closedAt: new Date('2026-08-07T16:00:00.000Z'), variance: -500, actualCashPence: 1000 },
        { tillId: tillA.id, userId: cashier.id, status: 'CLOSED', openedAt: now, closedAt: new Date('2026-08-07T17:00:00.000Z'), variance: -9999, actualCashPence: -1 },
        { tillId: tillB.id, userId: cashier.id, status: 'CLOSED', openedAt: now, closedAt: new Date('2026-08-07T16:00:00.000Z'), variance: 8000, actualCashPence: 1000 },
        { tillId: tillF.id, userId: otherUser.id, status: 'CLOSED', openedAt: now, closedAt: new Date('2026-08-07T16:00:00.000Z'), variance: 99999, actualCashPence: 1000 },
      ],
    });
    await prisma.salesInvoice.createMany({
      data: [
        {
          businessId,
          storeId: storeA,
          tillId: tillA.id,
          cashierUserId: cashier.id,
          paymentStatus: 'UNPAID',
          dueDate: new Date('2026-08-06T00:00:00.000Z'),
          subtotalPence: 2500,
          vatPence: 0,
          totalPence: 2500,
          createdAt: new Date('2026-08-01T10:00:00.000Z'),
        },
        {
          businessId,
          storeId: storeA,
          tillId: tillA.id,
          cashierUserId: cashier.id,
          paymentStatus: 'UNPAID',
          dueDate: new Date('2026-08-08T00:00:00.000Z'),
          subtotalPence: 4000,
          vatPence: 0,
          totalPence: 4000,
          createdAt: new Date('2026-08-01T11:00:00.000Z'),
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    if (!prisma) return;
    await runTestTeardown(prisma, [
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId: { in: [businessId, otherBusinessId] } } } }),
      () => prisma.salesReturn.deleteMany({ where: { storeId: { in: [storeA, storeB, otherStoreId] } } }),
      () => prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId: { in: [businessId, otherBusinessId] } } } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }),
      () => prisma.shift.deleteMany({ where: { till: { storeId: { in: [storeA, storeB, otherStoreId] } } } }),
      () => prisma.till.deleteMany({ where: { storeId: { in: [storeA, storeB, otherStoreId] } } }),
      () => prisma.product.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }),
      () => prisma.unit.deleteMany({ where: { name: `Each ${suffix}` } }),
      () => prisma.user.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }),
      () => prisma.store.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } }),
      () => prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } }),
    ], { label: 'today-live-scope.pg' });
  });

  function loadInput(plan: 'STARTER' | 'GROWTH', showProfit: boolean): TodayLoadInput {
    const windows = buildTodayWindows({
      now,
      timeZone: 'Africa/Accra',
      plan,
      authorisedFrom: '2026-08-01',
      authorisedTo: '2026-08-07',
    });
    return {
      businessId,
      ownedStoreIds: [storeA, storeB],
      storeIds: [storeA],
      currency: 'GHS',
      timeZone: 'Africa/Accra',
      plan,
      windows,
      showProfit,
      consolidated: false,
      storeNames: [
        { id: storeA, name: `Accra ${suffix}` },
        { id: storeB, name: `Tema ${suffix}` },
      ],
      hrefForShift: '/shifts',
      hrefForCash: '/reports/cash-drawer',
      hrefForMomo: '/reports/momo-confirmation',
      hrefForNetwork: null,
      hrefForCustomers: '/payments/customer-receipts',
      hrefForSuppliers: null,
      hrefForBelowCost: showProfit ? '/reports/margins' : null,
      hrefForLowStock: null,
    };
  }

  it('keeps sales, receipts, cash and other stores apart, and logs the authorised bounds', async () => {
    queries.length = 0;
    const started = performance.now();
    const snapshot = await loadToday(prisma, loadInput('STARTER', false));
    const durationMs = Math.round(performance.now() - started);
    console.info(JSON.stringify({ todayReads: snapshot.readCount, todayDurationMs: durationMs }));

    expect(snapshot.salesTodayPence).toBe(1500);
    expect(snapshot.salesCount).toBe(1);
    expect(snapshot.moneyReceivedPence).toBe(2300);
    expect(snapshot.methods.map((row) => row.method)).toEqual(['CASH']);
    expect(snapshot.cashDifferencePence).toBe(-900);
    expect(snapshot.comparison).toBeNull();
    expect(snapshot.profit.state).toBe('omitted');
    expect(snapshot.topProducts.map((row) => row.name)).toEqual([`Local Rice ${suffix}`]);
    expect(snapshot.attention.map((row) => row.rank)).toEqual([1, 2, 3, 5]);
    expect(snapshot.attention.some((row) => row.title.includes('GH₵5.00'))).toBe(true);
    expect(snapshot.attention.some((row) => row.title.includes('GH₵4.00'))).toBe(false);
    expect(snapshot.attention.some((row) => row.title.includes('GH₵25.00'))).toBe(true);
    expect(snapshot.attention.some((row) => row.title.includes('GH₵40.00'))).toBe(false);
    expect(durationMs).toBeGreaterThan(0);
    expect(snapshot.readCount).toBeGreaterThan(0);

    const evidence = queries.map((entry) => `${entry.query} ${entry.params}`).join('\n');
    expect(evidence).toContain(businessId);
    expect(evidence).toContain(storeA);
    expect(evidence).toContain('2026-08-07');
    expect(evidence).toContain('2026-08-08');
    expect(evidence).not.toContain(otherBusinessId);
    expect(evidence).not.toContain(storeB);
  });

  it('hides profit while a cost is missing and shows a below-cost row only when the cost is recorded', async () => {
    const hidden = await loadToday(prisma, loadInput('GROWTH', true));
    expect(hidden.profit).toEqual({ state: 'incomplete', grossProfitPence: null });
    expect(hidden.attention.some((row) => row.rank === 7)).toBe(false);

    await prisma.salesInvoiceLine.update({ where: { id: lineId }, data: { lineCostPence: 5000 } });
    const shown = await loadToday(prisma, loadInput('GROWTH', true));
    expect(shown.profit.state).toBe('ready');
    expect(shown.profit.grossProfitPence).toBeLessThan(0);
    expect(shown.attention.some((row) => row.title.includes(`Local Rice ${suffix}`))).toBe(true);
  });
});
