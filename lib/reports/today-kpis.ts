import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

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

async function _getTodayKPIs(businessId: string, storeId?: string): Promise<TodayKPIs> {
  const now = new Date();
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
  { revalidate: 30, tags: ['reports'] }
);

export function getTodayKPIs(businessId: string, storeId?: string): Promise<TodayKPIs> {
  return cachedTodayKPIs(businessId, storeId ?? '');
}
