import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import {
  businessDayWindow,
  businessLocalDateWindow,
  halfOpenTimestampFilter,
  zonedDateTimeParts,
} from '@/lib/reports/reporting-clock';

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
  let supplierId = '';
  let storeId = '';
  let tillId = '';
  let userId = '';
  let unitId = '';
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
    storeId = store.id;
    const user = await prisma.user.create({
      data: { businessId, email: `${suffix}@example.com`, name: 'Owner', role: 'OWNER', passwordHash: 'x' },
    });
    userId = user.id;
    const till = await prisma.till.create({ data: { storeId: store.id, name: 'Till' } });
    tillId = till.id;
    const customer = await prisma.customer.create({ data: { businessId, storeId: store.id, name: 'Ada' } });
    customerId = customer.id;
    const supplier = await prisma.supplier.create({ data: { businessId, name: 'Supplier' } });
    supplierId = supplier.id;
    const unit = await prisma.unit.create({ data: { name: `Piece ${suffix}`, pluralName: 'Pieces' } });
    unitId = unit.id;
    const product = await prisma.product.create({
      data: { businessId, name: 'Oil', sellingPriceBasePence: 2000, defaultCostBasePence: 834, preferredSupplierId: supplier.id },
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
      () => prisma.unit.deleteMany({ where: { id: unitId } }),
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

  it('proves remaining GP surfaces, balances, product rows, clock and SMS', async () => {
    const zone = 'Africa/Nairobi';
    const today = businessDayWindow(new Date(), zone);
    const oldDay = businessDayWindow(oldInstant, zone);
    const { localDateKey } = await import('@/lib/reports/reporting-clock');
    const oldKey = localDateKey(zonedDateTimeParts(oldInstant, zone));

    const { loadAnalyticsReport } = await import('@/app/(protected)/reports/analytics/AnalyticsContent');
    const readyAnalytics = await loadAnalyticsReport({
      businessId,
      currency: 'GHS',
      periodDays: 1,
      timeZone: zone,
      periodStart: today.startInclusive,
      periodEndExclusive: today.endExclusive,
    });
    expect(readyAnalytics.kpis.marginState).toBe('READY');
    expect(readyAnalytics.kpis.totalProfit).toBe(1015);
    const incompleteAnalytics = await loadAnalyticsReport({
      businessId,
      currency: 'GHS',
      periodDays: 1,
      timeZone: zone,
      periodStart: oldDay.startInclusive,
      periodEndExclusive: oldDay.endExclusive,
    });
    expect(incompleteAnalytics.kpis.marginState).toBe('INCOMPLETE_COSTS');
    expect(incompleteAnalytics.kpis.totalProfit).toBeNull();
    expect(incompleteAnalytics.kpis.marginPercent).toBeNull();

    const { getOwnerDashboardSnapshot } = await import('@/lib/reports/owner-dashboard');
    const dashboard = await getOwnerDashboardSnapshot(businessId, 'GHS');
    const readyGp = dashboard.overviewCards.find((card) => card.id === 'gross-profit');
    expect(readyGp?.value).toBe(1015);

    const { loadTradingPeriodMargin } = await import('@/lib/reports/trading-margin');
    const readyTrading = await loadTradingPeriodMargin({
      businessId,
      startInclusive: today.startInclusive,
      endExclusive: today.endExclusive,
    });
    expect(readyTrading.state).toBe('READY');
    expect(readyTrading.grossProfitPence).toBe(1015);
    const incompleteTrading = await loadTradingPeriodMargin({
      businessId,
      startInclusive: oldDay.startInclusive,
      endExclusive: oldDay.endExclusive,
    });
    expect(incompleteTrading.state).toBe('INCOMPLETE_COSTS');
    expect(incompleteTrading.grossProfitPence).toBeNull();
    expect(incompleteTrading.grossProfitPercent).toBeNull();

    const { getIncomeStatement } = await import('@/lib/reports/financials');
    const { getMarginAnalysisSnapshot } = await import('@/lib/reports/margin-analysis');
    const { getWeeklyDigestData } = await import('@/lib/reports/weekly-digest');
    const incompleteIncome = await getIncomeStatement(businessId, oldDay.startInclusive, oldDay.endExclusive);
    const incompleteMargin = await getMarginAnalysisSnapshot({ businessId, start: oldDay.startInclusive, end: oldDay.endExclusive });
    const incompleteDigest = await getWeeklyDigestData(businessId, oldDay.startInclusive, oldDay.endExclusive);
    expect(incompleteIncome.grossProfit).toBeNull();
    expect(incompleteMargin.grossProfitPence).toBeNull();
    expect(incompleteDigest.grossProfitPence).toBeNull();

    const incompleteBiz = await prisma.business.create({
      data: { name: `Wave A incomplete ${suffix}`, currency: 'GHS', timezone: zone, phone: '+233200000098', subscriptionStatus: 'ACTIVE' },
    });
    const incompleteStore = await prisma.store.create({ data: { businessId: incompleteBiz.id, name: 'Main' } });
    const incompleteUser = await prisma.user.create({
      data: { businessId: incompleteBiz.id, email: `inc-${suffix}@example.com`, name: 'Owner', role: 'OWNER', passwordHash: 'x' },
    });
    const incompleteTill = await prisma.till.create({ data: { storeId: incompleteStore.id, name: 'Till' } });
    const incompleteUnit = await prisma.unit.create({ data: { name: `Piece ${suffix}`, pluralName: 'Pieces' } });
    const incompleteProduct = await prisma.product.create({
      data: { businessId: incompleteBiz.id, name: 'Rice', sellingPriceBasePence: 1000, defaultCostBasePence: 0 },
    });
    await prisma.salesInvoice.create({
      data: {
        businessId: incompleteBiz.id,
        storeId: incompleteStore.id,
        tillId: incompleteTill.id,
        cashierUserId: incompleteUser.id,
        paymentStatus: 'PAID',
        subtotalPence: 1000,
        vatPence: 0,
        totalPence: 1000,
        payments: { create: { method: 'CASH', amountPence: 1000, status: 'CONFIRMED', receivedAt: new Date() } },
        lines: {
          create: {
            productId: incompleteProduct.id,
            unitId: incompleteUnit.id,
            qtyInUnit: 1,
            qtyBase: 1,
            unitPricePence: 1000,
            lineSubtotalPence: 1000,
            lineVatPence: 0,
            lineTotalPence: 1000,
            lineCostPence: 0,
          },
        },
      },
    });
    const { getTodayKPIs } = await import('@/lib/reports/today-kpis');
    const incompleteKpis = await getTodayKPIs(incompleteBiz.id);
    expect(incompleteKpis.marginState).toBe('INCOMPLETE_COSTS');
    expect(incompleteKpis.grossMarginPence).toBeNull();
    const incompleteDashboard = await getOwnerDashboardSnapshot(incompleteBiz.id, 'GHS');
    const withheld = incompleteDashboard.overviewCards.find((card) => card.id === 'gross-profit');
    expect(withheld?.value).toBeNull();
    await prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId: incompleteBiz.id } } });
    await prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId: incompleteBiz.id } } });
    await prisma.salesInvoice.deleteMany({ where: { businessId: incompleteBiz.id } });
    await prisma.till.deleteMany({ where: { store: { businessId: incompleteBiz.id } } });
    await prisma.product.deleteMany({ where: { businessId: incompleteBiz.id } });
    await prisma.unit.deleteMany({ where: { id: incompleteUnit.id } });
    await prisma.store.deleteMany({ where: { businessId: incompleteBiz.id } });
    await prisma.user.deleteMany({ where: { businessId: incompleteBiz.id } });
    await prisma.business.delete({ where: { id: incompleteBiz.id } });

    const { summarizeOpenReceivables, summarizeOpenPayables } = await import('@/lib/reports/surface-balances');
    const { buildCustomerDetailLedger, buildSupplierDetailLedger } = await import('@/lib/reports/detail-ledger');
    const customerInvoices = await prisma.salesInvoice.findMany({
      where: { businessId, customerId },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });
    const customerSummary = summarizeOpenReceivables(customerInvoices);
    expect(customerSummary.outstandingPence).toBe(12833);
    expect(customerSummary.paidShortfallPence).toBe(5833);
    expect(customerSummary.signedExcessPence).toBe(-2000);
    expect(9000 + customerSummary.paidShortfallPence + customerSummary.signedExcessPence).toBe(12833);
    const ledger = buildCustomerDetailLedger(customerInvoices.map((invoice) => ({
      id: invoice.id,
      createdAt: invoice.createdAt,
      paymentStatus: invoice.paymentStatus,
      totalPence: invoice.totalPence,
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        amountPence: payment.amountPence,
        status: payment.status,
        receivedAt: payment.receivedAt,
        method: payment.method,
        reference: payment.reference,
      })),
    })));
    expect(ledger.at(-1)?.balancePence).toBe(12833);
    expect(ledger.some((row) => row.description === 'Reconciling excess')).toBe(true);

    const receiptInvoices = await prisma.salesInvoice.findMany({
      where: { businessId, storeId, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true, status: true } } },
    });
    expect(summarizeOpenReceivables(receiptInvoices).outstandingPence).toBe(12833);

    const purchases = await prisma.purchaseInvoice.findMany({
      where: { businessId, supplierId },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });
    const supplierSummary = summarizeOpenPayables(purchases);
    expect(supplierSummary.outstandingPence).toBe(10500);
    expect(supplierSummary.paidShortfallPence).toBe(4500);
    expect(supplierSummary.signedExcessPence).toBe(-1000);
    expect(7000 + supplierSummary.paidShortfallPence + supplierSummary.signedExcessPence).toBe(10500);
    const supplierLedger = buildSupplierDetailLedger(purchases.map((invoice) => ({
      id: invoice.id,
      createdAt: invoice.createdAt,
      paymentStatus: invoice.paymentStatus,
      totalPence: invoice.totalPence,
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        amountPence: payment.amountPence,
        status: 'CONFIRMED',
        receivedAt: payment.paidAt,
        method: payment.method,
        reference: null,
      })),
    })));
    expect(supplierLedger.at(-1)?.balancePence).toBe(10500);
    expect(supplierLedger.some((row) => row.description === 'Reconciling excess')).toBe(true);
    const paymentInvoices = await prisma.purchaseInvoice.findMany({
      where: { businessId, storeId, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true } } },
    });
    expect(summarizeOpenPayables(paymentInvoices).outstandingPence).toBe(10500);

    const productRows = (rows: Array<{ name: string; revenue: number }>, difference: number, headline: number) => {
      const allocated = rows.filter((row) => row.name !== 'Unallocated sales difference').reduce((sum, row) => sum + row.revenue, 0);
      expect(rows.some((row) => row.name === 'Unallocated sales difference')).toBe(true);
      expect(allocated + difference).toBe(headline);
    };

    productRows(
      incompleteAnalytics.productData,
      incompleteAnalytics.kpis.unallocatedSalesDifferencePence,
      incompleteAnalytics.kpis.totalSales,
    );
    expect(incompleteAnalytics.kpis.unallocatedSalesDifferencePence).toBe(500);

    const digestRows = incompleteDigest.topSellers.map((row) => ({ name: row.name, revenue: row.revenue }));
    productRows(digestRows, incompleteDigest.unallocatedSalesDifferencePence, incompleteDigest.totalSalesPence);
    expect(incompleteDigest.unallocatedSalesDifferencePence).toBe(500);

    const { getSupplierSalesReport } = await import('@/lib/reports/supplier-sales');
    const supplierSales = await getSupplierSalesReport(businessId, { start: oldDay.startInclusive, end: oldDay.endExclusive });
    const supplierProductRows = supplierSales.rows.flatMap((row) => row.products.map((product) => ({
      name: product.productName,
      revenue: product.revenuePence,
    })));
    expect(supplierSales.unallocatedSalesDifferenceLabel).toBe('Unallocated sales difference');
    supplierProductRows.push({
      name: supplierSales.unallocatedSalesDifferenceLabel,
      revenue: supplierSales.unallocatedSalesDifferencePence,
    });
    productRows(supplierProductRows, supplierSales.unallocatedSalesDifferencePence, supplierSales.recognisedSalesPence);
    expect(supplierSales.unallocatedSalesDifferencePence).toBe(500);

    const { computeSalesComparisonFromDb } = await import('@/lib/reports/business-movement/query');
    const movement = await computeSalesComparisonFromDb(prisma, {
      businessId,
      currency: 'GHS',
      timeZone: zone,
      period: { preset: 'equal_length_custom', currentFromKey: oldKey, currentToKey: oldKey },
    });
    expect(movement.unallocatedSalesDifference.label).toBe('Unallocated sales difference');
    expect(movement.unallocatedSalesDifference.salesValuePence).toBe(500);
    const movementUnique = new Map<string, number>();
    for (const row of [
      ...movement.productGrowers,
      ...movement.productDecliners,
      ...movement.newProducts,
      ...movement.noCurrentSalesProducts,
    ]) {
      movementUnique.set(row.productName, row.salesValuePence.current);
    }
    productRows(
      [...movementUnique].map(([name, revenue]) => ({ name, revenue })),
      movement.unallocatedSalesDifference.salesValuePence,
      movement.headline.salesValuePence.current,
    );

    const boundary = businessLocalDateWindow('2026-06-16', '2026-06-16', zone);
    const adjacent = businessLocalDateWindow('2026-06-17', '2026-06-17', zone);
    expect(boundary).not.toBeNull();
    expect(adjacent).not.toBeNull();
    expect(boundary!.startInclusive.toISOString()).toBe('2026-06-15T21:00:00.000Z');
    expect(boundary!.endExclusive.toISOString()).toBe('2026-06-16T21:00:00.000Z');
    expect(boundary!.endExclusive.getTime()).toBe(adjacent!.startInclusive.getTime());
    const product = await prisma.product.findFirstOrThrow({ where: { businessId } });
    const boundarySale = {
      businessId,
      storeId,
      tillId,
      cashierUserId: userId,
      customerId,
      paymentStatus: 'PAID' as const,
      subtotalPence: 100,
      vatPence: 0,
      totalPence: 100,
      payments: { create: { method: 'CASH' as const, amountPence: 100, status: 'CONFIRMED' as const, receivedAt: boundary!.startInclusive } },
      lines: {
        create: {
          productId: product.id,
          qtyInUnit: 1,
          qtyBase: 1,
          unitId,
          unitPricePence: 100,
          lineSubtotalPence: 100,
          lineVatPence: 0,
          lineTotalPence: 100,
          lineCostPence: 40,
        },
      },
    };
    await prisma.salesInvoice.create({ data: { ...boundarySale, createdAt: boundary!.startInclusive } });
    await prisma.salesInvoice.create({
      data: {
        ...boundarySale,
        createdAt: boundary!.endExclusive,
        payments: { create: { method: 'CASH', amountPence: 100, status: 'CONFIRMED', receivedAt: boundary!.endExclusive } },
      },
    });
    const filter = halfOpenTimestampFilter(boundary!);
    const included = await prisma.salesInvoice.count({ where: { businessId, createdAt: filter, totalPence: 100 } });
    const excludedEnd = await prisma.salesInvoice.count({
      where: { businessId, createdAt: boundary!.endExclusive, totalPence: 100 },
    });
    expect(included).toBe(1);
    expect(excludedEnd).toBe(1);
    const nextFilter = halfOpenTimestampFilter(adjacent!);
    expect(await prisma.salesInvoice.count({ where: { businessId, createdAt: nextFilter, totalPence: 100 } })).toBe(1);

    const hourInstant = new Date('2026-06-16T07:00:00.000Z');
    const hourParts = zonedDateTimeParts(hourInstant, zone);
    expect(hourParts.hour).toBe(10);
    expect(hourParts.weekday).toBe(2);
    await prisma.salesInvoice.create({
      data: {
        ...boundarySale,
        createdAt: hourInstant,
        payments: { create: { method: 'CASH', amountPence: 100, status: 'CONFIRMED', receivedAt: hourInstant } },
      },
    });
    const hourAnalytics = await loadAnalyticsReport({
      businessId,
      currency: 'GHS',
      periodDays: 1,
      timeZone: zone,
      now: hourInstant,
      periodStart: boundary!.startInclusive,
      periodEndExclusive: boundary!.endExclusive,
    });
    const tuesdayHour = hourAnalytics.hourlyData.find((bucket) => bucket.day === 'Tue' && bucket.hour === 10);
    expect(tuesdayHour?.sales).toBeGreaterThan(0);

    const storedZone = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } });
    expect(storedZone.timezone).toBe(zone);
    const { resolveExportDateRange } = await import('@/app/(protected)/exports/_shared');
    const exported = resolveExportDateRange(
      new Request('http://localhost/exports/sales?from=2026-06-16&to=2026-06-16'),
      '30d',
      storedZone.timezone,
    );
    expect(exported.start.toISOString()).toBe(boundary!.startInclusive.toISOString());
    expect(exported.end.toISOString()).toBe(boundary!.endExclusive.toISOString());

    const { getOwnerDailySummaryMetrics, buildOwnerDailySummarySms, gsm7SeptetCount, OWNER_SMS_SEPTET_LIMIT } = await import('@/lib/notifications/owner-daily-summary-sms');
    const smsBusiness = {
      id: businessId,
      name: 'Wave A',
      currency: 'GHS',
      phone: '+233200000099',
      whatsappPhone: null,
      timezone: zone,
      whatsappBranchScope: null,
    };
    const readySms = await getOwnerDailySummaryMetrics(prisma, smsBusiness, new Date());
    const readySales = await prisma.salesInvoice.aggregate({
      where: {
        businessId,
        createdAt: { gte: today.startInclusive, lt: today.endExclusive },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      _sum: { totalPence: true },
    });
    expect(readySms.totalSalesPence).toBe(readySales._sum.totalPence);
    expect(readySms.marginState).toBe('READY');
    expect(readySms.grossProfitPence).toBe(1015);
    expect(readySms.outstandingArPence).toBe(12833);
    const readyText = buildOwnerDailySummarySms(readySms);
    expect(readyText.send).toBe(true);
    if (readyText.send) {
      expect(readyText.body).toContain('Gross profit');
      expect(gsm7SeptetCount(readyText.body)).not.toBeNull();
      expect(readyText.septets).toBeLessThanOrEqual(OWNER_SMS_SEPTET_LIMIT);
      expect(OWNER_SMS_SEPTET_LIMIT).toBe(306);
    }
    const overdueSms = await getOwnerDailySummaryMetrics(prisma, smsBusiness, new Date(Date.now() + 10 * 86_400_000));
    expect(overdueSms.overdueCustomerPence).toBe(12833);
    expect(overdueSms.overdueSupplierPence).toBe(10500);
    expect(overdueSms.outstandingArPence).toBe(12833);
    const incompleteSms = await getOwnerDailySummaryMetrics(prisma, smsBusiness, oldInstant);
    expect(incompleteSms.marginState).toBe('INCOMPLETE_COSTS');
    expect(incompleteSms.grossProfitPence).toBeNull();
    const incompleteText = buildOwnerDailySummarySms(incompleteSms);
    expect(incompleteText.send).toBe(true);
    if (incompleteText.send) {
      expect(incompleteText.body).toContain('Costs incomplete');
      expect(incompleteText.body).not.toMatch(/Gross profit|GP /);
      expect(gsm7SeptetCount(incompleteText.body)).not.toBeNull();
      expect(incompleteText.septets).toBeLessThanOrEqual(306);
    }
  });
});
