import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import {
  coerceReportDate,
  ensureSqliteReportDateColumnsNormalized,
  isDateBefore,
  isDateOnOrAfter,
  isDateWithinRange,
  isSqliteRuntime,
} from './sqlite-report-date-normalization';

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
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);

  const storeFilter = storeId ? { storeId } : {};

  const [salesRows, paymentRows, openSalesInvoices, outstandingPurchases, alertRows, balances, paidExpenses, momoPending, cashVarShifts, salesLines14d] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter },
      select: {
        totalPence: true,
        grossMarginPence: true,
        createdAt: true,
        paymentStatus: true,
        discountOverrideReason: true,
      },
    }),
    prisma.salesPayment.findMany({
      where: {
        salesInvoice: { businessId, ...(storeId ? { storeId } : {}) },
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
        createdAt: true,
        payments: { select: { amountPence: true } },
      },
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
    }),
    prisma.riskAlert.findMany({
      where: { businessId, severity: 'HIGH', status: 'OPEN' },
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
      where: { businessId, paymentStatus: 'PAID' },
      select: { amountPence: true, createdAt: true },
    }),
    prisma.mobileMoneyCollection.count({
      where: { businessId, status: 'PENDING' },
    }),
    prisma.shift.findMany({
      where: {
        till: { store: { businessId, ...(storeId ? { id: storeId } : {}) } },
        variance: { not: null },
      },
      select: { variance: true, closedAt: true },
      take: 200,
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: { businessId, ...(storeId ? { storeId } : {}) },
      },
      select: {
        lineTotalPence: true,
        qtyBase: true,
        product: { select: { id: true, defaultCostBasePence: true } },
        salesInvoice: { select: { createdAt: true, paymentStatus: true } },
      },
      take: 10000,
    }),
  ]);

  const validTodaySales = salesRows.filter((row) =>
    isDateWithinRange(row.createdAt, todayStart, todayEnd) && !['RETURNED', 'VOID'].includes(row.paymentStatus)
  );

  const totalSalesPence = validTodaySales.reduce((sum, row) => sum + row.totalPence, 0);
  const grossMarginPence = validTodaySales.reduce((sum, row) => sum + (row.grossMarginPence ?? 0), 0);
  const gpPercent = totalSalesPence > 0 ? Math.round((grossMarginPence / totalSalesPence) * 100) : 0;

  const paymentSplit: Record<string, number> = {};
  paymentRows
    .filter((row) => isDateWithinRange(row.receivedAt, todayStart, todayEnd))
    .forEach((row) => {
      paymentSplit[row.method] = (paymentSplit[row.method] ?? 0) + row.amountPence;
    });

  const outstandingARPence = Math.max(
    openSalesInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0) -
      openSalesInvoices.reduce((sum, invoice) => sum + invoice.payments.reduce((paid, payment) => paid + payment.amountPence, 0), 0),
    0,
  );
  const arOver60Pence = openSalesInvoices
    .filter((invoice) => isDateBefore(invoice.createdAt, sixtyDaysAgo))
    .reduce((sum, invoice) => sum + invoice.totalPence, 0);
  const arOver90Pence = openSalesInvoices
    .filter((invoice) => isDateBefore(invoice.createdAt, ninetyDaysAgo))
    .reduce((sum, invoice) => sum + invoice.totalPence, 0);

  const outstandingAPPence = outstandingPurchases.reduce((sum, inv) => {
    const paid = inv.payments.reduce((t, p) => t + p.amountPence, 0);
    return sum + Math.max(inv.totalPence - paid, 0);
  }, 0);

  const activeBalances = balances.filter((b) => b.product.active);
  const trackedProducts = activeBalances.filter((b) => b.product.reorderPointBase > 0);
  const productsAboveReorderPoint = trackedProducts.filter(
    (b) => b.qtyOnHandBase > b.product.reorderPointBase
  ).length;

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

    const cost = (line.product.defaultCostBasePence ?? 0) * line.qtyBase;
    const key = line.product.id;
    const existing = productMargins.get(key) ?? { revenue: 0, cost: 0 };
    existing.revenue += line.lineTotalPence;
    existing.cost += cost;
    productMargins.set(key, existing);
  }

  const negativeMarginProductCount = Array.from(productMargins.values()).filter(
    (p) => p.revenue > 0 && p.revenue < p.cost
  ).length;

  const stockoutImminentCount = trackedProducts.filter(
    (b) => b.qtyOnHandBase > 0 && b.qtyOnHandBase <= Math.ceil(b.product.reorderPointBase * 0.5)
  ).length;
  const urgentReorderCount = trackedProducts.filter(
    (b) => b.qtyOnHandBase <= b.product.reorderPointBase
  ).length;

  return {
    totalSalesPence,
    grossMarginPence,
    gpPercent,
    txCount: validTodaySales.length,
    outstandingARPence,
    outstandingAPPence,
    arOver60Pence,
    arOver90Pence,
    cashVarianceTotalPence,
    openHighAlerts: alertRows.filter((row) => isDateOnOrAfter(row.occurredAt, sevenDaysAgo)).length,
    totalTrackedProducts: trackedProducts.length,
    productsAboveReorderPoint,
    paymentSplit,
    avgDailyExpensesPence,
    cashOnHandEstimatePence: totalSalesPence,
    negativeMarginProductCount,
    momoPendingCount: momoPending,
    stockoutImminentCount,
    urgentReorderCount,
    thisWeekExpensesPence,
    fourWeekAvgExpensesPence,
    discountOverrideCount: salesRows.filter((row) => !!row.discountOverrideReason && isDateOnOrAfter(row.createdAt, sevenDaysAgo)).length,
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
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const storeFilter = storeId ? { storeId } : {};

  const [
    salesAgg,
    paymentsByMethod,
    arTotalAgg,
    arOver60Agg,
    arOver90Agg,
    arPaymentsAgg,
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
  ] = await Promise.all([
    // Today's sales — aggregate at DB level
    prisma.salesInvoice.aggregate({
      where: {
        businessId, ...storeFilter,
        createdAt: { gte: todayStart, lte: todayEnd },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      _sum: { totalPence: true, grossMarginPence: true },
      _count: { id: true },
    }),
    // Today's payments grouped by method — aggregate at DB level
    prisma.salesPayment.groupBy({
      by: ['method'],
      where: {
        receivedAt: { gte: todayStart, lte: todayEnd },
        salesInvoice: { businessId, ...(storeId ? { storeId } : {}) },
      },
      _sum: { amountPence: true },
    }),
    // AR total (sum of invoice face values for open invoices)
    prisma.salesInvoice.aggregate({
      where: { businessId, ...storeFilter, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      _sum: { totalPence: true },
    }),
    // AR over-60 bucket (by createdAt as approximation — avoids full table scan)
    prisma.salesInvoice.aggregate({
      where: {
        businessId, ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        createdAt: { lt: sixtyDaysAgo },
      },
      _sum: { totalPence: true },
    }),
    // AR over-90 bucket
    prisma.salesInvoice.aggregate({
      where: {
        businessId, ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        createdAt: { lt: ninetyDaysAgo },
      },
      _sum: { totalPence: true },
    }),
    // Total payments already applied to open invoices (for net AR calculation)
    prisma.salesPayment.aggregate({
      where: {
        salesInvoice: { businessId, ...storeFilter, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      },
      _sum: { amountPence: true },
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
        lineTotalPence: true,
        qtyBase: true,
        product: { select: { id: true, defaultCostBasePence: true } },
      },
      take: 10000,
    }),
  ]);

  // Sales KPIs — already aggregated by the DB
  const totalSalesPence = salesAgg._sum.totalPence ?? 0;
  const grossMarginPence = salesAgg._sum.grossMarginPence ?? 0;
  const gpPercent = totalSalesPence > 0 ? Math.round((grossMarginPence / totalSalesPence) * 100) : 0;

  // Payment split — already grouped by DB
  const paymentSplit: Record<string, number> = {};
  for (const p of paymentsByMethod) {
    paymentSplit[p.method] = p._sum.amountPence ?? 0;
  }

  // AR — derived from DB-level aggregates; no row loading needed
  const outstandingARPence = Math.max(
    (arTotalAgg._sum.totalPence ?? 0) - (arPaymentsAgg._sum.amountPence ?? 0),
    0,
  );
  const arOver60Pence = arOver60Agg._sum.totalPence ?? 0;
  const arOver90Pence = arOver90Agg._sum.totalPence ?? 0;

  // AP
  const outstandingAPPence = outstandingPurchases.reduce((s, inv) => {
    const paid = inv.payments.reduce((t, p) => t + p.amountPence, 0);
    return s + Math.max(inv.totalPence - paid, 0);
  }, 0);

  // Inventory
  const activeBalances = balances.filter((b) => b.product.active);
  const trackedProducts = activeBalances.filter((b) => b.product.reorderPointBase > 0);
  const productsAboveReorderPoint = trackedProducts.filter(
    (b) => b.qtyOnHandBase > b.product.reorderPointBase
  ).length;

  // Expenses — already aggregated by DB
  const totalExpenses30d = recentExpensesAgg._sum.amountPence ?? 0;
  const avgDailyExpensesPence = Math.round(totalExpenses30d / 30);

  // Cash estimate (sales today - expenses avg)
  const cashOnHandEstimatePence = totalSalesPence; // simplified — actual cash from today

  // Cash variances
  const cashVarianceTotalPence = cashVarShifts.reduce((s, v) => s + Math.abs(v.variance ?? 0), 0);

  // Negative margin products
  const productMargins = new Map<string, { revenue: number; cost: number }>();
  for (const line of salesLines14d) {
    const cost = (line.product.defaultCostBasePence ?? 0) * line.qtyBase;
    const key = line.product.id;
    const existing = productMargins.get(key) ?? { revenue: 0, cost: 0 };
    existing.revenue += line.lineTotalPence;
    existing.cost += cost;
    productMargins.set(key, existing);
  }
  // Count products where selling price < cost (simplified)
  const negativeMarginProductCount = Array.from(productMargins.values()).filter(
    (p) => p.revenue > 0 && p.revenue < p.cost
  ).length;

  // Stockout imminent (products with stock but very low relative to demand)
  // Simplified: products at or below reorder point with stock > 0
  const stockoutImminentCount = trackedProducts.filter(
    (b) => b.qtyOnHandBase > 0 && b.qtyOnHandBase <= Math.ceil(b.product.reorderPointBase * 0.5)
  ).length;

  const urgentReorderCount = trackedProducts.filter(
    (b) => b.qtyOnHandBase <= b.product.reorderPointBase
  ).length;

  const thisWeekExpensesPence = thisWeekExpensesAgg._sum.amountPence ?? 0;
  const fourWeekTotal = fourWeekExpensesAgg._sum.amountPence ?? 0;
  const fourWeekAvgExpensesPence = Math.round(fourWeekTotal / 4); // 4-week window (35d ago to 7d ago)

  return {
    totalSalesPence,
    grossMarginPence,
    gpPercent,
    txCount: salesAgg._count.id,
    outstandingARPence,
    outstandingAPPence,
    arOver60Pence,
    arOver90Pence,
    cashVarianceTotalPence,
    openHighAlerts,
    totalTrackedProducts: trackedProducts.length,
    productsAboveReorderPoint,
    paymentSplit,
    avgDailyExpensesPence,
    cashOnHandEstimatePence,
    negativeMarginProductCount,
    momoPendingCount: momoPending,
    stockoutImminentCount,
    urgentReorderCount,
    thisWeekExpensesPence,
    fourWeekAvgExpensesPence,
    discountOverrideCount: discountOverrides,
  };
}

const cachedTodayKPIs = unstable_cache(
  _getTodayKPIs,
  ['report-today-kpis'],
  // 5 s TTL so Owner Intelligence stays within 5 seconds of reality after a sale.
  // (was 30 s — long enough to show stale totals while a cashier was mid-session)
  { revalidate: 5, tags: ['reports'] }
);

export function getTodayKPIs(businessId: string, storeId?: string): Promise<TodayKPIs> {
  return cachedTodayKPIs(businessId, storeId ?? '');
}
