import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import {
  aggregateMoneyReceivedByMethod,
  requireMoneyReceivedMethodRows,
  resolveMoneyReceivedScope,
} from '@/lib/reports/money-received';
import { DEFAULT_BUSINESS_TIMEZONE } from '@/lib/notifications/utils';
import { evaluateMarginLines, evaluateMarginSet, type MarginInvoiceInput, type MarginReturnKind } from '@/lib/reports/margin-line';
import { rankRecognisedProductSales } from '@/lib/reports/product-rank';

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
  unallocatedSalesDifferencePence: number;
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
  lineVatPence: number;
  lineTotalPence: number;
  product: { name: string; defaultCostBasePence: number };
};

type DigestInvoice = {
  paymentStatus: string;
  discountPence: number;
  totalPence: number;
  vatPence: number;
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
      productId: line.productId,
      name: line.product.name,
    })),
  }));
}

async function _getWeeklyDigestData(
  businessId: string,
  weekStartIso: string,
  weekEndIso: string
): Promise<WeeklyDigestData> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekEndIso);
  const prevStart = new Date(weekStart.getTime() - 7 * 86_400_000);
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
        totalPence: true,
        vatPence: true,
        salesReturn: { select: { type: true } },
        lines: {
          select: {
            productId: true,
            qtyBase: true,
            lineSubtotalPence: true,
            lineDiscountPence: true,
            promoDiscountPence: true,
        lineCostPence: true,
        lineVatPence: true,
        lineTotalPence: true,
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
        totalPence: true,
        vatPence: true,
        salesReturn: { select: { type: true } },
        lines: {
          select: {
            productId: true,
            qtyBase: true,
            lineSubtotalPence: true,
            lineDiscountPence: true,
            promoDiscountPence: true,
        lineCostPence: true,
        lineVatPence: true,
        lineTotalPence: true,
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

  const sellerMap = new Map<string, { name: string; qty: number; revenue: number }>();
  let unallocatedSalesDifferencePence = 0;
  for (const invoice of marginInvoices) {
    const ranked = rankRecognisedProductSales({
      paymentStatus: invoice.paymentStatus,
      discountPence: invoice.discountPence,
      vatPence: invoice.vatPence,
      totalPence: invoice.totalPence,
      lines: invoice.lines.map((line) => ({
        productId: line.productId,
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineVatPence: line.lineVatPence,
        lineTotalPence: line.lineTotalPence,
      })),
    });
    if (!ranked.ok) {
      unallocatedSalesDifferencePence += ranked.differencePence;
      continue;
    }
    ranked.lines.forEach((rankedLine, index) => {
      const source = invoice.lines[index];
      const entry = sellerMap.get(rankedLine.productId) ?? { name: source?.product.name ?? rankedLine.productId, qty: 0, revenue: 0 };
      entry.qty += source?.qtyBase ?? 0;
      entry.revenue += rankedLine.amountPence;
      sellerMap.set(rankedLine.productId, entry);
    });
  }
  const topSellers = Array.from(sellerMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  if (unallocatedSalesDifferencePence !== 0) {
    topSellers.push({ name: 'Unallocated sales difference', qty: 0, revenue: unallocatedSalesDifferencePence });
  }
  const evaluatedLines = evaluateMarginLines(toMarginInvoices(marginInvoices));
  const marginByProduct = new Map<string, { name: string; revenue: number; profit: number }>();
  if (margin.state === 'READY') {
    for (const line of evaluatedLines.lines) {
      if (!line.ready || line.profitPence == null || !line.productId) continue;
      const entry = marginByProduct.get(line.productId) ?? { name: line.name ?? line.productId, revenue: 0, profit: 0 };
      entry.revenue += line.revenuePence;
      entry.profit += line.profitPence;
      marginByProduct.set(line.productId, entry);
    }
  }
  const topMargin = margin.state !== 'READY'
    ? []
    : Array.from(marginByProduct.values())
      .filter((product) => product.revenue > 0)
      .map((product) => ({
        name: product.name,
        revenue: product.revenue,
        marginPct: Math.round((product.profit / product.revenue) * 100),
      }))
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
    unallocatedSalesDifferencePence,
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
