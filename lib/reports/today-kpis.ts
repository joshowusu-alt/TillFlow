import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { getAccountBalance } from './financials';
import {
  ensureSqliteReportDateColumnsNormalized,
  isDateOnOrAfter,
  isDateWithinRange,
  isSqliteRuntime,
} from './sqlite-report-date-normalization';
import { summarizeInventoryRisk, summarizeReceivables } from './operational-metrics';

export type TodayKPIs = {
  totalSalesPence: number;
  grossMarginPence: number;
  gpPercent: number;
  txCount: number;
  outstandingARPence: number;
  outstandingAPPence: number;
  arOver60Pence: number;
  arOver90Pence: number;
  cashVarianceTotalPence: number;
  openHighAlerts: number;
  totalTrackedProducts: number;
  productsAboveReorderPoint: number;
  paymentSplit: Record<string, number>;
  avgDailyExpensesPence: number;
  cashOnHandEstimatePence: number;
  negativeMarginProductCount: number;
  momoPendingCount: number;
  stockoutImminentCount: number;
  urgentReorderCount: number;
  thisWeekExpensesPence: number;
  fourWeekAvgExpensesPence: number;
  discountOverrideCount: number;
};

async function getTodayKPIsSqlite(businessId: string, storeId: string | undefined, now: Date): Promise<TodayKPIs> {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyFiveDaysAgo = new Date(now);
  thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);

  const storeFilter = storeId ? { storeId } : {};

  const [salesRows, paymentRows, openSalesInvoices, outstandingPurchases, alertRows, balances, paidExpenses, momoPending, cashVarShifts, salesLines14d, cashOnHandEstimatePence] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter, createdAt: { gte: sevenDaysAgo } },
      select: {
        totalPence: true,
        createdAt: true,
        paymentStatus: true,
        discountOverrideReason: true,
      },
    }),
    prisma.salesPayment.findMany({
      where: {
        receivedAt: { gte: todayStart },
        salesInvoice: {
          businessId,
          ...(storeId ? { storeId } : {}),
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        method: true,
        amountPence: true,
        receivedAt: true,
      },
    }),
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      select: {
        totalPence: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amountPence: true } },
      },
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
    }),
    prisma.riskAlert.findMany({
      where: { businessId, severity: 'HIGH', status: 'OPEN', occurredAt: { gte: sevenDaysAgo } },
      select: { occurredAt: true },
    }),
    prisma.inventoryBalance.findMany({
      where: storeId ? { storeId } : { store: { businessId } },
      select: {
        qtyOnHandBase: true,
        product: { select: { reorderPointBase: true, active: true } },
      },
    }),
    prisma.expense.findMany({
      where: { businessId, paymentStatus: 'PAID', createdAt: { gte: thirtyFiveDaysAgo } },
      select: { amountPence: true, createdAt: true },
    }),
    prisma.mobileMoneyCollection.count({
      where: { businessId, status: 'PENDING' },
    }),
    prisma.shift.findMany({
      where: {
        till: { store: { businessId, ...(storeId ? { id: storeId } : {}) } },
        variance: { not: null },
        closedAt: { gte: sevenDaysAgo },
      },
      select: { variance: true, closedAt: true },
      take: 200,
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId, ...(storeId ? { storeId } : {}),
          createdAt: { gte: fourteenDaysAgo },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        lineSubtotalPence: true,
        lineCostPence: true,
        qtyBase: true,
        product: { select: { id: true, defaultCostBasePence: true } },
        salesInvoice: { select: { createdAt: true, paymentStatus: true } },
      },
    }),
    getAccountBalance(businessId, ACCOUNT_CODES.cash, todayEnd),
  ]);

  const validTodaySales = salesRows.filter((row) =>
    isDateWithinRange(row.createdAt, todayStart, todayEnd) && !['RETURNED', 'VOID'].includes(row.paymentStatus)
  );

  const totalSalesPence = validTodaySales.reduce((sum, row) => sum + row.totalPence, 0);

  // GP from sale lines — same source as margins/analytics
  const todaySaleLines = salesLines14d.filter((line) =>
    isDateWithinRange(line.salesInvoice.createdAt, todayStart, todayEnd) &&
    !['RETURNED', 'VOID'].includes(line.salesInvoice.paymentStatus)
  );
  const grossMarginPence = todaySaleLines.reduce((sum, line) => {
    const cost = line.lineCostPence > 0
      ? line.lineCostPence
      : (line.product.defaultCostBasePence * line.qtyBase);
    return sum + line.lineSubtotalPence - cost;
  }, 0);
  const gpPercent = totalSalesPence > 0 ? Math.round((grossMarginPence / totalSalesPence) * 100) : 0;

  const paymentSplit: Record<string, number> = {};
  paymentRows
    .filter((row) => isDateWithinRange(row.receivedAt, todayStart, todayEnd))
    .forEach((row) => {
      paymentSplit[row.method] = (paymentSplit[row.method] ?? 0) + row.amountPence;
    });

  const receivables = summarizeReceivables(openSalesInvoices, now);

  const outstandingAPPence = outstandingPurchases.reduce((sum, inv) => {
    const paid = inv.payments.reduce((t, p) => t + p.amountPence, 0);
    return sum + Math.max(inv.totalPence - paid, 0);
  }, 0);

  const activeBalances = balances.filter((b) => b.product.active);
  const inventorySummary = summarizeInventoryRisk(
    activeBalances.map((balance) => ({
      qtyOnHandBase: balance.qtyOnHandBase,
      reorderPointBase: balance.product.reorderPointBase,
    }))
  );

  const totalExpenses30d = paidExpenses
    .filter((expense) => isDateOnOrAfter(expense.createdAt, thirtyDaysAgo))
    .reduce((sum, expense) => sum + expense.amountPence, 0);
  const avgDailyExpensesPence = Math.round(totalExpenses30d / 30);
  const thisWeekExpensesPence = paidExpenses
    .filter((expense) => isDateOnOrAfter(expense.createdAt, sevenDaysAgo))
    .reduce((sum, expense) => sum + expense.amountPence, 0);
  const fourWeekTotal = paidExpenses
    .filter((expense) => isDateOnOrAfter(expense.createdAt, thirtyFiveDaysAgo) && !isDateOnOrAfter(expense.createdAt, sevenDaysAgo))
    .reduce((sum, expense) => sum + expense.amountPence, 0);
  const fourWeekAvgExpensesPence = Math.round(fourWeekTotal / 4);

  const cashVarianceTotalPence = cashVarShifts
    .filter((shift) => shift.closedAt && isDateOnOrAfter(shift.closedAt, sevenDaysAgo))
    .reduce((sum, shift) => sum + Math.abs(shift.variance ?? 0), 0);

  const productMargins = new Map<string, { revenue: number; cost: number }>();
  for (const line of salesLines14d) {
    if (!isDateOnOrAfter(line.salesInvoice.createdAt, fourteenDaysAgo)) continue;
    if (['RETURNED', 'VOID'].includes(line.salesInvoice.paymentStatus)) continue;

    const key = line.product.id;
    const existing = productMargins.get(key) ?? { revenue: 0, cost: 0 };
    existing.revenue += line.lineSubtotalPence;
    existing.cost += line.lineCostPence > 0
      ? line.lineCostPence
      : (line.product.defaultCostBasePence * line.qtyBase);
    productMargins.set(key, existing);
  }

  const negativeMarginProductCount = Array.from(productMargins.values()).filter(
    (p) => p.revenue > 0 && p.revenue < p.cost
  ).length;

  return {
    totalSalesPence,
    grossMarginPence,
    gpPercent,
    txCount: validTodaySales.length,
    outstandingARPence: receivables.outstandingTotalPence,
    outstandingAPPence,
    arOver60Pence: receivables.over60Pence,
    arOver90Pence: receivables.over90Pence,
    cashVarianceTotalPence,
    openHighAlerts: alertRows.filter((row) => isDateOnOrAfter(row.occurredAt, sevenDaysAgo)).length,
    totalTrackedProducts: inventorySummary.totalTrackedProducts,
    productsAboveReorderPoint: inventorySummary.productsAboveReorderPoint,
    paymentSplit,
    avgDailyExpensesPence,
    cashOnHandEstimatePence: Math.max(0, cashOnHandEstimatePence),
    negativeMarginProductCount,
    momoPendingCount: momoPending,
    stockoutImminentCount: inventorySummary.stockoutImminentCount,
    urgentReorderCount: inventorySummary.urgentReorderCount,
    thisWeekExpensesPence,
    fourWeekAvgExpensesPence,
    discountOverrideCount: salesRows.filter(
      (row) =>
        !!row.discountOverrideReason &&
        isDateOnOrAfter(row.createdAt, sevenDaysAgo) &&
        !['RETURNED', 'VOID'].includes(row.paymentStatus)
    ).length,
  };
}

async function _getTodayKPIs(businessId: string, storeId?: string): Promise<TodayKPIs> {
  try {
    await ensureSqliteReportDateColumnsNormalized();
  } catch (error) {
    console.error('[today-kpis] SQLite date normalization failed', {
      businessId,
      storeId,
      error,
    });
  }

  const now = new Date();
  if (isSqliteRuntime()) {
    return getTodayKPIsSqlite(businessId, storeId, now);
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyFiveDaysAgo = new Date(now);
  thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

  const storeFilter = storeId ? { storeId } : {};

  const [
    salesAgg,
    paymentsByMethod,
    openSalesInvoices,
    outstandingPurchases,
    openHighAlerts,
    balances,
    recentExpensesAgg,
    thisWeekExpensesAgg,
    fourWeekExpensesAgg,
    momoPending,
    cashVarShifts,
    discountOverrides,
    salesLines14d,
    todayLinesForGP,
    cashOnHandEstimatePence,
  ] = await Promise.all([
    // Today's sales — aggregate at DB level
    prisma.salesInvoice.aggregate({
      where: {
        businessId, ...storeFilter,
        createdAt: { gte: todayStart, lte: todayEnd },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    // Today's payments grouped by method — aggregate at DB level
    prisma.salesPayment.groupBy({
      by: ['method'],
      where: {
        receivedAt: { gte: todayStart, lte: todayEnd },
        salesInvoice: {
          businessId,
          ...(storeId ? { storeId } : {}),
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      _sum: { amountPence: true },
    }),
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      select: {
        totalPence: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amountPence: true } },
      },
    }),
    // Outstanding AP — aggregate at DB level
    prisma.purchaseInvoice.findMany({
      where: {
        businessId, ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
    }),
    // Open HIGH risk alerts
    prisma.riskAlert.count({
      where: {
        businessId,
        severity: 'HIGH',
        status: 'OPEN',
        occurredAt: { gte: sevenDaysAgo },
      },
    }),
    // Inventory balances
    prisma.inventoryBalance.findMany({
      where: storeId
        ? { storeId }
        : { store: { businessId } },
      select: {
        qtyOnHandBase: true,
        product: { select: { reorderPointBase: true, active: true } },
      },
    }),
    // 30-day expenses — aggregate at DB level
    prisma.expense.aggregate({
      where: { businessId, createdAt: { gte: thirtyDaysAgo }, paymentStatus: 'PAID' },
      _sum: { amountPence: true },
    }),
    // This week expenses — aggregate at DB level
    prisma.expense.aggregate({
      where: { businessId, createdAt: { gte: sevenDaysAgo }, paymentStatus: 'PAID' },
      _sum: { amountPence: true },
    }),
    // 4-week expenses (35 days ago → 7 days ago = 28 days = 4 weeks) — aggregate at DB level
    prisma.expense.aggregate({
      where: { businessId, createdAt: { gte: thirtyFiveDaysAgo, lt: sevenDaysAgo }, paymentStatus: 'PAID' },
      _sum: { amountPence: true },
    }),
    // MoMo pending
    prisma.mobileMoneyCollection.count({
      where: { businessId, status: 'PENDING' },
    }),
    // Cash variances last 7 days
    prisma.shift.findMany({
      where: {
        till: { store: { businessId, ...(storeId ? { id: storeId } : {}) } },
        closedAt: { gte: sevenDaysAgo },
        variance: { not: null },
      },
      select: { variance: true },
      take: 200,
    }),
    // Discount overrides this week
    prisma.salesInvoice.count({
      where: {
        businessId,
        createdAt: { gte: sevenDaysAgo },
        discountOverrideReason: { not: null },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
    }),
    // Sales lines for negative margin check (14 days)
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId,
          createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        lineSubtotalPence: true,
        lineCostPence: true,
        qtyBase: true,
        product: { select: { id: true, defaultCostBasePence: true } },
      },
      take: 10000,
    }),
    // Today's sale lines for GP computation
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId,
          ...(storeId ? { storeId } : {}),
          createdAt: { gte: todayStart, lte: todayEnd },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        lineSubtotalPence: true,
        lineCostPence: true,
        qtyBase: true,
        product: { select: { defaultCostBasePence: true } },
      },
    }),
    getAccountBalance(businessId, ACCOUNT_CODES.cash, todayEnd),
  ]);

  // Sales KPIs — already aggregated by the DB
  const totalSalesPence = salesAgg._sum.totalPence ?? 0;

  // GP from sale lines — same source as margins/analytics
  const grossMarginPence = todayLinesForGP.reduce((sum, line) => {
    const cost = line.lineCostPence > 0
      ? line.lineCostPence
      : (line.product.defaultCostBasePence * line.qtyBase);
    return sum + line.lineSubtotalPence - cost;
  }, 0);
  const gpPercent = totalSalesPence > 0 ? Math.round((grossMarginPence / totalSalesPence) * 100) : 0;

  // Payment split — already grouped by DB
  const paymentSplit: Record<string, number> = {};
  for (const p of paymentsByMethod) {
    paymentSplit[p.method] = p._sum.amountPence ?? 0;
  }

  // AR — computed from open invoice balances so ageing buckets align with dashboard logic
  const receivables = summarizeReceivables(openSalesInvoices, now);

  // AP
  const outstandingAPPence = outstandingPurchases.reduce((s, inv) => {
    const paid = inv.payments.reduce((t, p) => t + p.amountPence, 0);
    return s + Math.max(inv.totalPence - paid, 0);
  }, 0);

  // Inventory
  const activeBalances = balances.filter((b) => b.product.active);
  const inventorySummary = summarizeInventoryRisk(
    activeBalances.map((balance) => ({
      qtyOnHandBase: balance.qtyOnHandBase,
      reorderPointBase: balance.product.reorderPointBase,
    }))
  );

  // Expenses — already aggregated by DB
  const totalExpenses30d = recentExpensesAgg._sum.amountPence ?? 0;
  const avgDailyExpensesPence = Math.round(totalExpenses30d / 30);

  // Cash variances
  const cashVarianceTotalPence = cashVarShifts.reduce((s, v) => s + Math.abs(v.variance ?? 0), 0);

  // Negative margin products
  const productMargins = new Map<string, { revenue: number; cost: number }>();
  for (const line of salesLines14d) {
    const key = line.product.id;
    const existing = productMargins.get(key) ?? { revenue: 0, cost: 0 };
    existing.revenue += line.lineSubtotalPence;
    existing.cost += line.lineCostPence > 0
      ? line.lineCostPence
      : (line.product.defaultCostBasePence * line.qtyBase);
    productMargins.set(key, existing);
  }
  // Count products where selling price < cost (simplified)
  const negativeMarginProductCount = Array.from(productMargins.values()).filter(
    (p) => p.revenue > 0 && p.revenue < p.cost
  ).length;

  // Stockout imminent (products with stock but very low relative to demand)
  // Simplified: products at or below reorder point with stock > 0
  const thisWeekExpensesPence = thisWeekExpensesAgg._sum.amountPence ?? 0;
  const fourWeekTotal = fourWeekExpensesAgg._sum.amountPence ?? 0;
  const fourWeekAvgExpensesPence = Math.round(fourWeekTotal / 4); // 4-week window (35d ago to 7d ago)

  return {
    totalSalesPence,
    grossMarginPence,
    gpPercent,
    txCount: salesAgg._count.id,
    outstandingARPence: receivables.outstandingTotalPence,
    outstandingAPPence,
    arOver60Pence: receivables.over60Pence,
    arOver90Pence: receivables.over90Pence,
    cashVarianceTotalPence,
    openHighAlerts,
    totalTrackedProducts: inventorySummary.totalTrackedProducts,
    productsAboveReorderPoint: inventorySummary.productsAboveReorderPoint,
    paymentSplit,
    avgDailyExpensesPence,
    cashOnHandEstimatePence: Math.max(0, cashOnHandEstimatePence),
    negativeMarginProductCount,
    momoPendingCount: momoPending,
    stockoutImminentCount: inventorySummary.stockoutImminentCount,
    urgentReorderCount: inventorySummary.urgentReorderCount,
    thisWeekExpensesPence,
    fourWeekAvgExpensesPence,
    discountOverrideCount: discountOverrides,
  };
}

const cachedTodayKPIs = unstable_cache(
  _getTodayKPIs,
  ['report-today-kpis'],
  // 30 s TTL. Sales, expenses, and purchases all call revalidateTag('reports')
  // immediately after commit, so the nav counter refreshes within seconds of
  // a real transaction. The TTL is only the fallback for background processes
  // (cron jobs, webhooks) that don't know to bust the tag.
  { revalidate: 30, tags: ['reports'] }
);

export function getTodayKPIs(businessId: string, storeId?: string): Promise<TodayKPIs> {
  return cachedTodayKPIs(businessId, storeId ?? '');
}
