import { prisma } from '@/lib/prisma';

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

export async function getTodayKPIs(businessId: string, storeId?: string): Promise<TodayKPIs> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

  const storeFilter = storeId ? { storeId } : {};

  const [
    salesRows,
    paymentsRows,
    outstandingSales,
    outstandingPurchases,
    openHighAlerts,
    balances,
    recentExpenses,
    thisWeekExpenses,
    fourWeekExpenses,
    momoPending,
    cashVarShifts,
    discountOverrides,
    salesLines14d,
  ] = await Promise.all([
    // Today's sales
    prisma.salesInvoice.findMany({
      where: {
        businessId, ...storeFilter,
        createdAt: { gte: todayStart, lte: todayEnd },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      select: { totalPence: true, grossMarginPence: true },
      take: 2000,
    }),
    // Today's payments
    prisma.salesPayment.findMany({
      where: {
        receivedAt: { gte: todayStart, lte: todayEnd },
        salesInvoice: { businessId, ...(storeId ? { storeId } : {}) },
      },
      select: { method: true, amountPence: true },
      take: 5000,
    }),
    // Outstanding AR
    prisma.salesInvoice.findMany({
      where: {
        businessId, ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: {
        totalPence: true, dueDate: true, createdAt: true,
        payments: { select: { amountPence: true } },
      },
      take: 500,
    }),
    // Outstanding AP
    prisma.purchaseInvoice.findMany({
      where: {
        businessId, ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
      take: 500,
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
      take: 2000,
    }),
    // 30-day expenses for avg
    prisma.expense.findMany({
      where: { businessId, createdAt: { gte: thirtyDaysAgo }, paymentStatus: 'PAID' },
      select: { amountPence: true },
    }),
    // This week expenses
    prisma.expense.findMany({
      where: { businessId, createdAt: { gte: sevenDaysAgo }, paymentStatus: 'PAID' },
      select: { amountPence: true },
    }),
    // 4-week expenses
    prisma.expense.findMany({
      where: { businessId, createdAt: { gte: fourWeeksAgo, lt: sevenDaysAgo }, paymentStatus: 'PAID' },
      select: { amountPence: true },
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
      take: 100,
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
        product: { select: { defaultCostBasePence: true } },
      },
      take: 5000,
    }),
  ]);

  // Sales KPIs
  const totalSalesPence = salesRows.reduce((s, x) => s + x.totalPence, 0);
  const grossMarginPence = salesRows.reduce((s, x) => s + (x.grossMarginPence ?? 0), 0);
  const gpPercent = totalSalesPence > 0 ? Math.round((grossMarginPence / totalSalesPence) * 100) : 0;

  // Payment split
  const paymentSplit: Record<string, number> = {};
  for (const p of paymentsRows) {
    paymentSplit[p.method] = (paymentSplit[p.method] ?? 0) + p.amountPence;
  }

  // AR
  let outstandingARPence = 0;
  let arOver60Pence = 0;
  let arOver90Pence = 0;
  for (const inv of outstandingSales) {
    const paid = inv.payments.reduce((t, p) => t + p.amountPence, 0);
    const balance = Math.max(inv.totalPence - paid, 0);
    if (balance <= 0) continue;
    outstandingARPence += balance;

    const ref = inv.dueDate ?? inv.createdAt;
    const ageDays = Math.floor((now.getTime() - new Date(ref).getTime()) / 86_400_000);
    if (ageDays > 60) arOver60Pence += balance;
    if (ageDays > 90) arOver90Pence += balance;
  }

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

  // Expenses
  const totalExpenses30d = recentExpenses.reduce((s, e) => s + e.amountPence, 0);
  const avgDailyExpensesPence = Math.round(totalExpenses30d / 30);

  // Cash estimate (sales today - expenses avg)
  const cashOnHandEstimatePence = totalSalesPence; // simplified — actual cash from today

  // Cash variances
  const cashVarianceTotalPence = cashVarShifts.reduce((s, v) => s + Math.abs(v.variance ?? 0), 0);

  // Negative margin products
  const productMargins = new Map<string, { revenue: number; cost: number }>();
  for (const line of salesLines14d) {
    const cost = (line.product.defaultCostBasePence ?? 0) * line.qtyBase;
    // Use a key combining product data; simplified here
    const key = `${line.product.defaultCostBasePence}`;
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

  const thisWeekExpensesPence = thisWeekExpenses.reduce((s, e) => s + e.amountPence, 0);
  const fourWeekTotal = fourWeekExpenses.reduce((s, e) => s + e.amountPence, 0);
  const fourWeekAvgExpensesPence = Math.round(fourWeekTotal / 3); // 3 weeks in the period

  return {
    totalSalesPence,
    grossMarginPence,
    gpPercent,
    txCount: salesRows.length,
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
