import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

export type WeeklyDigestData = {
  totalSalesPence: number;
  grossProfitPence: number;
  gpPercent: number;
  txCount: number;
  voidCount: number;
  returnCount: number;
  discountOverrides: number;
  adjustmentCount: number;
  paymentSplit: Record<string, number>;
  topSellers: { name: string; qty: number; revenue: number }[];
  topMargin: { name: string; revenue: number; marginPct: number }[];
  cashierPerf: { name: string; sales: number; tx: number; discounts: number }[];
  riskCashiers: { name: string; voids: number; discounts: number; cashVar: number }[];
  // Previous week for comparison
  prevTotalSalesPence: number;
  prevGrossProfitPence: number;
  prevTxCount: number;
};

async function _getWeeklyDigestData(
  businessId: string,
  weekStartIso: string,
  weekEndIso: string
): Promise<WeeklyDigestData> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekEndIso);
  // Previous week dates for comparison
  const prevStart = new Date(weekStart);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(weekStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  prevEnd.setHours(23, 59, 59, 999);

  const [
    salesAgg,
    prevSalesAgg,
    paymentsByMethod,
    voids,
    returns,
    riskAlerts,
    discountOverrides,
    cashVarShifts,
    bestLines,
    adjustments,
    cashierSales,
  ] = await Promise.all([
    // This week sales — aggregate at DB level
    prisma.salesInvoice.aggregate({
      where: { businessId, createdAt: { gte: weekStart, lte: weekEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      _sum: { totalPence: true, grossMarginPence: true },
      _count: { id: true },
    }),
    // Previous week sales — aggregate at DB level
    prisma.salesInvoice.aggregate({
      where: { businessId, createdAt: { gte: prevStart, lte: prevEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      _sum: { totalPence: true, grossMarginPence: true },
      _count: { id: true },
    }),
    // Payments grouped by method — aggregate at DB level
    prisma.salesPayment.groupBy({
      by: ['method'],
      where: { receivedAt: { gte: weekStart, lte: weekEnd }, salesInvoice: { businessId } },
      _sum: { amountPence: true },
    }),
    prisma.salesInvoice.count({
      where: { businessId, createdAt: { gte: weekStart, lte: weekEnd }, paymentStatus: 'VOID' },
    }),
    prisma.salesReturn.count({
      where: { store: { businessId }, createdAt: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.riskAlert.findMany({
      where: { businessId, occurredAt: { gte: weekStart, lte: weekEnd } },
      select: { alertType: true, severity: true, cashierUser: { select: { name: true } } },
    }),
    prisma.salesInvoice.count({
      where: { businessId, createdAt: { gte: weekStart, lte: weekEnd }, discountOverrideReason: { not: null } },
    }),
    prisma.shift.findMany({
      where: {
        till: { store: { businessId } },
        closedAt: { gte: weekStart, lte: weekEnd },
        variance: { not: null },
      },
      select: { variance: true, user: { select: { id: true, name: true } } },
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: { businessId, createdAt: { gte: weekStart, lte: weekEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      },
      select: {
        productId: true, qtyBase: true, lineTotalPence: true,
        product: { select: { name: true, defaultCostBasePence: true } },
      },
    }),
    prisma.stockAdjustment.count({
      where: { store: { businessId }, createdAt: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.salesInvoice.findMany({
      where: { businessId, createdAt: { gte: weekStart, lte: weekEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: { totalPence: true, discountOverrideReason: true, cashierUser: { select: { id: true, name: true } } },
    }),
  ]);

  const totalSalesPence = salesAgg._sum.totalPence ?? 0;
  const grossProfitPence = salesAgg._sum.grossMarginPence ?? 0;
  const gpPercent = totalSalesPence > 0 ? Math.round((grossProfitPence / totalSalesPence) * 100) : 0;

  const prevTotalSalesPence = prevSalesAgg._sum.totalPence ?? 0;
  const prevGrossProfitPence = prevSalesAgg._sum.grossMarginPence ?? 0;

  const paymentSplit: Record<string, number> = {};
  for (const p of paymentsByMethod) {
    paymentSplit[p.method] = p._sum.amountPence ?? 0;
  }

  // Top sellers
  const productMap = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
  for (const line of bestLines) {
    const e = productMap.get(line.productId) ?? { name: line.product.name, qty: 0, revenue: 0, cost: line.product.defaultCostBasePence ?? 0 };
    e.qty += line.qtyBase;
    e.revenue += line.lineTotalPence;
    productMap.set(line.productId, e);
  }
  const topSellers = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topMargin = Array.from(productMap.values())
    .map((p) => {
      const estCost = (p.cost / 100) * p.qty;
      const margin = p.revenue - estCost * 100;
      const pct = p.revenue > 0 ? Math.round((margin / p.revenue) * 100) : 0;
      return { name: p.name, revenue: p.revenue, marginPct: pct };
    })
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, 5);

  // Risk by cashier
  const cashierRiskMap = new Map<string, { name: string; voids: number; discounts: number; cashVar: number }>();
  for (const alert of riskAlerts) {
    if (!alert.cashierUser) continue;
    const e = cashierRiskMap.get(alert.cashierUser.name) ?? { name: alert.cashierUser.name, voids: 0, discounts: 0, cashVar: 0 };
    if (alert.alertType === 'VOID_SALE') e.voids++;
    if (alert.alertType === 'DISCOUNT_OVERRIDE') e.discounts++;
    cashierRiskMap.set(alert.cashierUser.name, e);
  }
  for (const shift of cashVarShifts) {
    const e = cashierRiskMap.get(shift.user.name) ?? { name: shift.user.name, voids: 0, discounts: 0, cashVar: 0 };
    e.cashVar += Math.abs(shift.variance ?? 0);
    cashierRiskMap.set(shift.user.name, e);
  }

  // Cashier performance
  const cashierPerfMap = new Map<string, { name: string; sales: number; tx: number; discounts: number }>();
  for (const inv of cashierSales) {
    const e = cashierPerfMap.get(inv.cashierUser.id) ?? { name: inv.cashierUser.name, sales: 0, tx: 0, discounts: 0 };
    e.sales += inv.totalPence;
    e.tx++;
    if (inv.discountOverrideReason) e.discounts++;
    cashierPerfMap.set(inv.cashierUser.id, e);
  }

  return {
    totalSalesPence,
    grossProfitPence,
    gpPercent,
    txCount: salesAgg._count.id,
    voidCount: voids,
    returnCount: returns,
    discountOverrides,
    adjustmentCount: adjustments,
    paymentSplit,
    topSellers,
    topMargin,
    cashierPerf: Array.from(cashierPerfMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 5),
    riskCashiers: Array.from(cashierRiskMap.values()).filter((c) => c.voids + c.discounts + c.cashVar > 0),
    prevTotalSalesPence,
    prevGrossProfitPence,
    prevTxCount: prevSalesAgg._count.id,
  };
}

const cachedWeeklyDigest = unstable_cache(
  _getWeeklyDigestData,
  ['report-weekly-digest'],
  { revalidate: 3600, tags: ['reports'] }
);

export function getWeeklyDigestData(
  businessId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyDigestData> {
  return cachedWeeklyDigest(businessId, weekStart.toISOString(), weekEnd.toISOString());
}
