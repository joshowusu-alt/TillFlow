import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import {
  aggregateMoneyReceivedByMethod,
  requireMoneyReceivedMethodRows,
  resolveMoneyReceivedScope,
} from '@/lib/reports/money-received';
import { DEFAULT_BUSINESS_TIMEZONE } from '@/lib/notifications/utils';
import { businessDayWindow } from '@/lib/reports/reporting-clock';
import { evaluateMarginSet, resolveAuthoritativeLineCost, type MarginInvoiceInput, type MarginReturnKind } from '@/lib/reports/margin-line';
import { productRankRevenuePence } from '@/lib/reports/product-rank';

export type WeeklyDigestData = {
  totalSalesPence: number;
  grossProfitPence: number | null;
  gpPercent: number | null;
  marginState: 'READY' | 'INCOMPLETE_COSTS';
  incompleteLineCount: number;
  txCount: number;
  voidCount: number;
  returnCount: number;
  discountOverrides: number;
  adjustmentCount: number;
  paymentSplit: Record<string, number>;
  totalReceiptsPence: number;
  topSellers: { name: string; qty: number; revenue: number }[];
  topMargin: { name: string; revenue: number; marginPct: number }[];
  cashierPerf: { name: string; sales: number; tx: number; discounts: number }[];
  riskCashiers: { name: string; voids: number; discounts: number; cashVar: number }[];
  // Previous week for comparison
  prevTotalSalesPence: number;
  prevGrossProfitPence: number | null;
  prevTxCount: number;
};

type DigestLine = {
  productId: string;
  qtyBase: number;
  lineSubtotalPence: number;
  lineDiscountPence: number;
  promoDiscountPence: number;
  lineCostPence: number;
  product: { name: string; defaultCostBasePence: number };
};

type DigestInvoice = {
  paymentStatus: string;
  discountPence: number;
  salesReturn: { type: string } | null;
  lines: DigestLine[];
};

function digestReturnKind(invoice: DigestInvoice): MarginReturnKind {
  if (!invoice.salesReturn) return 'NONE';
  if (invoice.salesReturn.type === 'VOID' && invoice.paymentStatus === 'VOID') return 'FULL_VOID';
  if (invoice.salesReturn.type === 'RETURN' && invoice.paymentStatus === 'RETURNED') return 'FULL_RETURN';
  return 'BACKUP_OR_REPLAY';
}

function toMarginInvoices(invoices: DigestInvoice[]): MarginInvoiceInput[] {
  return invoices.map((invoice) => ({
    paymentStatus: invoice.paymentStatus,
    discountPence: invoice.discountPence,
    returnKind: digestReturnKind(invoice),
    lines: invoice.lines.map((line) => ({
      lineSubtotalPence: line.lineSubtotalPence,
      lineDiscountPence: line.lineDiscountPence,
      promoDiscountPence: line.promoDiscountPence,
      lineCostPence: line.lineCostPence,
      qtyBase: line.qtyBase,
      defaultCostBasePence: line.product.defaultCostBasePence,
    })),
  }));
}

async function _getWeeklyDigestData(
  businessId: string,
  weekStartIso: string,
  weekEndIso: string
): Promise<WeeklyDigestData> {
  const callerStart = new Date(weekStartIso);
  const callerEnd = new Date(weekEndIso);
  const weekStart = businessDayWindow(callerStart, DEFAULT_BUSINESS_TIMEZONE).startInclusive;
  const weekEnd = businessDayWindow(callerEnd, DEFAULT_BUSINESS_TIMEZONE).endExclusive;
  const prevStart = businessDayWindow(new Date(weekStart.getTime() - 7 * 86_400_000), DEFAULT_BUSINESS_TIMEZONE).startInclusive;
  const prevEnd = weekStart;

  const [
    salesAgg,
    prevSalesAgg,
    paymentsByMethod,
    voids,
    returns,
    riskAlerts,
    discountOverrides,
    cashVarShifts,
    marginInvoices,
    prevMarginInvoices,
    adjustments,
    cashierSales,
  ] = await Promise.all([
    // This week sales — aggregate at DB level
    prisma.salesInvoice.aggregate({
      where: { businessId, createdAt: { gte: weekStart, lt: weekEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    // Previous week sales — aggregate at DB level
    prisma.salesInvoice.aggregate({
      where: { businessId, createdAt: { gte: prevStart, lt: prevEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    // Payments by method — canonical Money Received (CONFIRMED; no parent RETURNED/VOID)
    aggregateMoneyReceivedByMethod(
      prisma,
      resolveMoneyReceivedScope({
        businessId,
        currency: 'GHS',
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
        periodStart: weekStart,
        periodEndInclusive: weekEnd,
        absoluteBounds: true,
      }),
    ),
    prisma.salesInvoice.count({
      where: { businessId, createdAt: { gte: weekStart, lt: weekEnd }, paymentStatus: 'VOID' },
    }),
    prisma.salesReturn.count({
      where: { store: { businessId }, createdAt: { gte: weekStart, lt: weekEnd }, type: 'RETURN' },
    }),
    prisma.riskAlert.findMany({
      where: { businessId, occurredAt: { gte: weekStart, lt: weekEnd } },
      select: { alertType: true, severity: true, cashierUser: { select: { name: true } } },
    }),
    prisma.salesInvoice.count({
      where: {
        businessId,
        createdAt: { gte: weekStart, lt: weekEnd },
        discountOverrideReason: { not: null },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
    }),
    prisma.shift.findMany({
      where: {
        till: { store: { businessId } },
        closedAt: { gte: weekStart, lt: weekEnd },
        variance: { not: null },
      },
      select: { variance: true, user: { select: { id: true, name: true } } },
    }),
    prisma.salesInvoice.findMany({
      where: { businessId, createdAt: { gte: weekStart, lt: weekEnd } },
      select: {
        paymentStatus: true,
        discountPence: true,
        salesReturn: { select: { type: true } },
        lines: {
          select: {
            productId: true,
            qtyBase: true,
            lineSubtotalPence: true,
            lineDiscountPence: true,
            promoDiscountPence: true,
            lineCostPence: true,
            product: { select: { name: true, defaultCostBasePence: true } },
          },
        },
      },
    }),
    prisma.salesInvoice.findMany({
      where: { businessId, createdAt: { gte: prevStart, lt: prevEnd } },
      select: {
        paymentStatus: true,
        discountPence: true,
        salesReturn: { select: { type: true } },
        lines: {
          select: {
            productId: true,
            qtyBase: true,
            lineSubtotalPence: true,
            lineDiscountPence: true,
            promoDiscountPence: true,
            lineCostPence: true,
            product: { select: { name: true, defaultCostBasePence: true } },
          },
        },
      },
    }),
    prisma.stockAdjustment.count({
      where: { store: { businessId }, createdAt: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.salesInvoice.findMany({
      where: { businessId, createdAt: { gte: weekStart, lt: weekEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: { totalPence: true, discountOverrideReason: true, cashierUser: { select: { id: true, name: true } } },
    }),
  ]);

  const totalSalesPence = salesAgg._sum.totalPence ?? 0;
  const margin = evaluateMarginSet(toMarginInvoices(marginInvoices));
  const prevMargin = evaluateMarginSet(toMarginInvoices(prevMarginInvoices));
  const grossProfitPence = margin.grossProfitPence;
  const gpPercent = margin.grossProfitPercent;

  const prevTotalSalesPence = prevSalesAgg._sum.totalPence ?? 0;
  const prevGrossProfitPence = prevMargin.grossProfitPence;

  const paymentSplit: Record<string, number> = {};
  for (const p of requireMoneyReceivedMethodRows(paymentsByMethod)) {
    paymentSplit[p.method] = p.amountPence;
  }
  const totalReceiptsPence = Object.values(paymentSplit).reduce((sum, amount) => sum + amount, 0);

  const productMap = new Map<string, { name: string; qty: number; revenue: number; profit: number; incomplete: boolean }>();
  for (const invoice of marginInvoices) {
    if (invoice.paymentStatus === 'RETURNED' || invoice.paymentStatus === 'VOID') continue;
    if (digestReturnKind(invoice) !== 'NONE' && digestReturnKind(invoice) !== 'FULL_RETURN' && digestReturnKind(invoice) !== 'FULL_VOID') {
      continue;
    }
    for (const line of invoice.lines) {
      const revenue = productRankRevenuePence(line);
      const entry = productMap.get(line.productId) ?? {
        name: line.product.name,
        qty: 0,
        revenue: 0,
        profit: 0,
        incomplete: false,
      };
      entry.qty += line.qtyBase;
      entry.revenue += revenue;
      const cost = resolveAuthoritativeLineCost({
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineCostPence: line.lineCostPence,
        qtyBase: line.qtyBase,
        defaultCostBasePence: line.product.defaultCostBasePence,
      });
      if (cost.authoritative) entry.profit += revenue - cost.costPence;
      else entry.incomplete = true;
      productMap.set(line.productId, entry);
    }
  }
  const topSellers = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topMargin = margin.state === 'READY'
    ? Array.from(productMap.values())
      .filter((product) => !product.incomplete && product.revenue > 0)
      .map((product) => ({
        name: product.name,
        revenue: product.revenue,
        marginPct: Math.round((product.profit / product.revenue) * 100),
      }))
      .sort((a, b) => b.marginPct - a.marginPct)
      .slice(0, 5)
    : [];

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
    marginState: margin.state,
    incompleteLineCount: margin.incompleteLineCount,
    txCount: salesAgg._count.id,
    voidCount: voids,
    returnCount: returns,
    discountOverrides,
    adjustmentCount: adjustments,
    paymentSplit,
    totalReceiptsPence,
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
