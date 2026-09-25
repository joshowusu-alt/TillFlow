import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

describePg('Wave A cross-surface reconciliation (Postgres)', () => {
  let prisma: PrismaClient;
  const suffix = `wave-a-${Date.now()}`;
  let businessId = '';
  let customerId = '';
  let oldInstant = new Date(Date.now() - 40 * 86_400_000);

  beforeAll(async () => {
    const g = globalThis as unknown as { prisma?: PrismaClient };
    if (g.prisma) {
      await g.prisma.$disconnect().catch(() => {});
      g.prisma = undefined;
    }
    vi.resetModules();
    ({ prisma } = await openTestPrismaClient());

    const due = new Date(Date.now() + 2 * 86_400_000);
    const business = await prisma.business.create({
      data: { name: `Wave A ${suffix}`, currency: 'GHS', timezone: 'Africa/Nairobi', whatsappEnabled: true, phone: '+233200000099', subscriptionStatus: 'ACTIVE' },
    });
    businessId = business.id;
    const store = await prisma.store.create({ data: { businessId, name: 'Main' } });
    const user = await prisma.user.create({
      data: { businessId, email: `${suffix}@example.com`, name: 'Owner', role: 'OWNER', passwordHash: 'x' },
    });
    const till = await prisma.till.create({ data: { storeId: store.id, name: 'Till' } });
    const customer = await prisma.customer.create({ data: { businessId, storeId: store.id, name: 'Ada' } });
    customerId = customer.id;
    const supplier = await prisma.supplier.create({ data: { businessId, name: 'Supplier' } });
    const unit = await prisma.unit.create({ data: { name: 'Piece', pluralName: 'Pieces' } });
    const product = await prisma.product.create({
      data: { businessId, name: 'Oil', sellingPriceBasePence: 2000, defaultCostBasePence: 834 },
    });

    const saleBase = {
      businessId,
      storeId: store.id,
      tillId: till.id,
      cashierUserId: user.id,
      customerId: customer.id,
      dueDate: due,
      subtotalPence: 0,
      vatPence: 0,
    };

    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'UNPAID', totalPence: 9000, subtotalPence: 9000, payments: { create: { method: 'CASH', amountPence: 6000, status: 'PENDING', receivedAt: new Date() } } },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'PAID', totalPence: 5833, subtotalPence: 5833 },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'PAID', totalPence: 10000, subtotalPence: 10000, payments: { create: { method: 'CASH', amountPence: 12000, status: 'CONFIRMED', receivedAt: new Date() } } },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'RETURNED', totalPence: 5000, subtotalPence: 5000 },
    });
    await prisma.salesInvoice.create({
      data: { ...saleBase, paymentStatus: 'VOID', totalPence: 4000, subtotalPence: 4000 },
    });
    await prisma.salesInvoice.create({
      data: {
        ...saleBase,
        paymentStatus: 'PAID',
        subtotalPence: 2000,
        discountPence: 0,
        vatPence: 0,
        totalPence: 1849,
        payments: { create: { method: 'CASH', amountPence: 1849, status: 'CONFIRMED', receivedAt: new Date() } },
        lines: {
          create: {
            productId: product.id,
            unitId: unit.id,
            qtyInUnit: 1,
            qtyBase: 1,
            unitPricePence: 2000,
            lineDiscountPence: 100,
            promoDiscountPence: 51,
            lineSubtotalPence: 2000,
            lineVatPence: 0,
            lineTotalPence: 1849,
            lineCostPence: 834,
          },
        },
      },
    });

    const purchaseBase = { businessId, storeId: store.id, supplierId: supplier.id, dueDate: due, subtotalPence: 0, vatPence: 0 };
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'UNPAID', totalPence: 7000, subtotalPence: 7000 } });
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'PAID', totalPence: 3500, subtotalPence: 3500 } });
    await prisma.purchaseInvoice.create({
      data: { ...purchaseBase, paymentStatus: 'PAID', totalPence: 2000, subtotalPence: 2000, payments: { create: { amountPence: 1000, method: 'CASH', paidAt: new Date() } } },
    });
    await prisma.purchaseInvoice.create({
      data: { ...purchaseBase, paymentStatus: 'PAID', totalPence: 1000, subtotalPence: 1000, payments: { create: { amountPence: 2000, method: 'CASH', paidAt: new Date() } } },
    });
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'RETURNED', totalPence: 900, subtotalPence: 900 } });
    await prisma.purchaseInvoice.create({ data: { ...purchaseBase, paymentStatus: 'VOID', totalPence: 800, subtotalPence: 800 } });

    const paid = { method: 'CASH', status: 'CONFIRMED', receivedAt: oldInstant };
    await prisma.salesInvoice.create({
      data: {
        ...saleBase,
        paymentStatus: 'PAID',
        subtotalPence: 1000,
        totalPence: 1000,
        createdAt: oldInstant,
        payments: { create: { ...paid, amountPence: 1000 } },
        lines: { create: { productId: product.id, unitId: unit.id, qtyInUnit: 1, qtyBase: 1, unitPricePence: 1000, lineSubtotalPence: 1000, lineVatPence: 0, lineTotalPence: 1000, lineCostPence: 0 } },
      },
    });
    await prisma.salesInvoice.create({
      data: {
        ...saleBase,
        paymentStatus: 'PAID',
        subtotalPence: 0,
        totalPence: 500,
        createdAt: new Date(oldInstant.getTime() + 1000),
        payments: { create: { ...paid, amountPence: 500 } },
        lines: { create: { productId: product.id, unitId: unit.id, qtyInUnit: 1, qtyBase: 1, unitPricePence: 0, lineSubtotalPence: 0, lineVatPence: 0, lineTotalPence: 0, lineCostPence: 0 } },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await runTestTeardown(prisma, [
      () => prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => prisma.salesInvoice.deleteMany({ where: { businessId } }),
      () => prisma.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      () => prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      () => prisma.till.deleteMany({ where: { store: { businessId } } }),
      () => prisma.customer.deleteMany({ where: { businessId } }),
      () => prisma.supplier.deleteMany({ where: { businessId } }),
      () => prisma.product.deleteMany({ where: { businessId } }),
      () => prisma.store.deleteMany({ where: { businessId } }),
      () => prisma.user.deleteMany({ where: { businessId } }),
      () => prisma.business.delete({ where: { id: businessId } }),
    ]);
  });

  it('reconciles canonical AR 12833, AP 10500, and ready GP 1015', async () => {
    const sales = await prisma.salesInvoice.findMany({
      where: { businessId },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true, status: true } } },
    });
    const purchases = await prisma.purchaseInvoice.findMany({
      where: { businessId },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true } } },
    });
    const helperAr = sales.reduce((sum, invoice) => sum + receivableDocumentBalance(invoice).balancePence, 0);
    const helperAp = purchases.reduce((sum, invoice) => sum + payableDocumentBalance(invoice).balancePence, 0);
    expect(helperAr).toBe(12833);
    expect(helperAp).toBe(10500);

    const { getTodayKPIs } = await import('@/lib/reports/today-kpis');
    const kpis = await getTodayKPIs(businessId);
    expect(kpis.outstandingARPence).toBe(12833);
    expect(kpis.outstandingAPPence).toBe(10500);
    expect(kpis.marginState).toBe('READY');
    expect(kpis.grossMarginPence).toBe(1015);

    const { getOwnerBrief } = await import('@/lib/owner-intel');
    const brief = await getOwnerBrief(businessId, 'GHS');
    expect(brief.moneyPulse.arDue7DaysPence).toBe(12833);
    expect(brief.moneyPulse.apDue7DaysPence).toBe(10500);

    const { getCashflowForecast } = await import('@/lib/reports/forecast');
    const forecast = await getCashflowForecast(businessId, 14);
    expect(forecast.arInputPence).toBe(12833);
    expect(forecast.apInputPence).toBe(10500);
  });

  it('reconciles income, digest, margin, trading, lists and ageing', async () => {
    const todayStart = new Date(Date.now() - 3 * 3_600_000);
    const todayEnd = new Date(Date.now() + 3_600_000);
    const oldStart = new Date(oldInstant.getTime() - 60_000);
    const oldEnd = new Date(oldInstant.getTime() + 120_000);

    const { getIncomeStatement } = await import('@/lib/reports/financials');
    const readyIncome = await getIncomeStatement(businessId, todayStart, todayEnd);
    expect(readyIncome.marginState).toBe('READY');
    expect(readyIncome.grossProfit).toBe(1015);
    const incompleteIncome = await getIncomeStatement(businessId, oldStart, oldEnd);
    expect(incompleteIncome.marginState).toBe('INCOMPLETE_COSTS');
    expect(incompleteIncome.grossProfit).toBeNull();

    const { getMarginAnalysisSnapshot } = await import('@/lib/reports/margin-analysis');
    const readyMargin = await getMarginAnalysisSnapshot({ businessId, start: todayStart, end: todayEnd });
    expect(readyMargin.state).toBe('READY');
    expect(readyMargin.grossProfitPence).toBe(1015);
    const incompleteMargin = await getMarginAnalysisSnapshot({ businessId, start: oldStart, end: oldEnd });
    expect(incompleteMargin.state).toBe('INCOMPLETE_COSTS');
    expect(incompleteMargin.grossProfitPence).toBeNull();

    const { getWeeklyDigestData } = await import('@/lib/reports/weekly-digest');
    const readyDigest = await getWeeklyDigestData(businessId, todayStart, todayEnd);
    expect(readyDigest.marginState).toBe('READY');
    expect(readyDigest.grossProfitPence).toBe(1015);
    const oldDigest = await getWeeklyDigestData(businessId, oldStart, oldEnd);
    expect(oldDigest.marginState).toBe('INCOMPLETE_COSTS');
    expect(oldDigest.grossProfitPence).toBeNull();
    expect(oldDigest.unallocatedSalesDifferencePence).toBe(500);

    const { loadTradingOpenDocuments } = await import('@/lib/reports/trading-balances');
    const trading = await loadTradingOpenDocuments(businessId);
    expect(trading.outstandingARPence).toBe(12833);
    expect(trading.outstandingAPPence).toBe(10500);

    const { getCustomers } = await import('@/lib/services/customers');
    const customers = await getCustomers(businessId, { pageSize: 50 });
    expect(customers.customers.reduce((sum, row) => sum + row.outstandingBalancePence, 0)).toBe(12833);

    const { getSupplierListKpis } = await import('@/lib/services/supplier-kpis');
    const supplierKpis = await getSupplierListKpis(businessId);
    expect(supplierKpis.totalApOutstandingPence).toBe(10500);

    const { getSupplierAgingReport } = await import('@/lib/services/supplier-aging');
    const ageing = await getSupplierAgingReport(businessId, new Date());
    expect(ageing.rows.reduce((sum, row) => sum + row.totalPence, 0)).toBe(10500);
  });
});
