import TradingReportView from '@/components/reports/stage3b/TradingReportView';
import { prisma } from '@/lib/prisma';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { getIncomeStatement } from '@/lib/reports/financials';
import { loadTradingPeriodMargin } from '@/lib/reports/trading-margin';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { loadTradingOpenDocuments } from '@/lib/reports/trading-balances';
import { classifyInventoryState, getReceivableAgeBucket } from '@/lib/reports/operational-metrics';
import { unstable_cache } from 'next/cache';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import {
  getMoneyReceivedSummary,
  RECEIPT_METHOD_LABELS,
} from '@/lib/reports/money-received';
import {
  buildReportingScopeSearchParams,
  moneyReceivedHref,
  type ReportingPeriodKey,
  type ReportingScope,
} from '@/lib/reports/reporting-scope';
import { getSalesRevenueSummary } from '@/lib/reports/sales-revenue';

type TradingDashboardContentProps = {
  businessId: string;
  businessName: string;
  currency: string;
  timeZone: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  selectedStoreId: string;
  fromIso: string;
  toIso: string;
  periodKey: ReportingPeriodKey;
  /** Inclusive start ISO */
  startIso: string;
  /** Exclusive end ISO */
  endIso: string;
  isToday: boolean;
};

async function _getTradingDashboardSnapshot(
  businessId: string,
  currency: string,
  startIso: string,
  endIso: string,
  selectedStoreId: string,
) {
  const start = new Date(startIso);
  const endExclusive = new Date(endIso);
  // Income statement helper still uses inclusive end — pass last in-range instant.
  const storeFilter = selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId };
  const tradingBalances = await loadTradingOpenDocuments(
    businessId,
    selectedStoreId === 'ALL' ? undefined : selectedStoreId,
  );

  const [
    salesAgg,
    income,
    outstandingSales,
    outstandingPurchases,
    balances,
    bestSellerGroups,
    todayAdj,
    todayVoids,
    todayReturns,
    todayCashVar,
    costedMarginAgg,
    uncostedMarginGroups,
  ] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: {
        businessId,
        ...storeFilter,
        createdAt: { gte: start, lt: endExclusive },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      _sum: { totalPence: true },
    }),
    // Money Received method totals come from getMoneyReceivedSummary (canonical
    // CONFIRMED inclusion; no parent RETURNED/VOID exclusion) — not a parallel groupBy.
    getIncomeStatement(businessId, start, endExclusive),
    Promise.resolve(tradingBalances.outstandingSales),
    Promise.resolve(tradingBalances.outstandingPurchases),
    prisma.inventoryBalance.findMany({
      where: {
        ...(selectedStoreId === 'ALL'
          ? { store: { businessId } }
          : { storeId: selectedStoreId }),
      },
      select: {
        id: true,
        qtyOnHandBase: true,
        product: {
          select: {
            name: true,
            reorderPointBase: true,
            reorderQtyBase: true,
            productUnits: {
              select: {
                isBaseUnit: true,
                conversionToBase: true,
                unit: { select: { name: true, pluralName: true } },
              },
            },
          },
        },
      },
      take: 1000,
    }),
    prisma.salesInvoiceLine.groupBy({
      by: ['productId'],
      where: {
        salesInvoice: {
          businessId,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          createdAt: { gte: start, lt: endExclusive },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      _sum: {
        qtyBase: true,
        lineTotalPence: true,
      },
      orderBy: {
        _sum: {
          lineTotalPence: 'desc',
        },
      },
      take: 20,
    }),
    prisma.stockAdjustment.findMany({
      where: {
        store: { businessId },
        ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
        createdAt: { gte: start, lt: endExclusive },
      },
      select: {
        direction: true,
        qtyBase: true,
        product: { select: { name: true } },
        user: { select: { name: true } },
      },
      take: 8,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.salesInvoice.findMany({
      where: {
        businessId,
        ...storeFilter,
        createdAt: { gte: start, lt: endExclusive },
        paymentStatus: 'VOID',
      },
      select: { totalPence: true, cashierUser: { select: { name: true } } },
      take: 200,
    }),
    prisma.salesReturn.findMany({
      where: {
        store: { businessId },
        ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
        createdAt: { gte: start, lt: endExclusive },
        type: 'RETURN',
      },
      select: { refundAmountPence: true },
      take: 500,
    }),
    prisma.shift.findMany({
      where: {
        till: {
          store: {
            businessId,
            ...(selectedStoreId === 'ALL' ? {} : { id: selectedStoreId }),
          },
        },
        closedAt: { gte: start, lt: endExclusive },
        variance: { not: null },
      },
      select: { variance: true, user: { select: { name: true } } },
      take: 100,
    }),
    prisma.salesInvoiceLine.aggregate({
      where: {
        salesInvoice: {
          businessId,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          createdAt: { gte: start, lt: endExclusive },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      _sum: {
        lineSubtotalPence: true,
        lineCostPence: true,
      },
    }),
    prisma.salesInvoiceLine.groupBy({
      by: ['productId'],
      where: {
        salesInvoice: {
          businessId,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          createdAt: { gte: start, lt: endExclusive },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
        lineCostPence: 0,
      },
      _sum: {
        lineSubtotalPence: true,
        qtyBase: true,
      },
    }),
  ]);

  const bestSellerProductIds = bestSellerGroups.map((group) => group.productId);
  const uncostedProductIds = uncostedMarginGroups.map((group) => group.productId);
  const [bestSellerProducts, uncostedProducts] = await Promise.all([
    bestSellerProductIds.length
      ? prisma.product.findMany({
        where: { id: { in: bestSellerProductIds } },
        select: {
          id: true,
          name: true,
          productUnits: {
            select: {
              isBaseUnit: true,
              conversionToBase: true,
              unit: { select: { name: true, pluralName: true } },
            },
          },
        },
      })
      : Promise.resolve([]),
    uncostedProductIds.length
      ? prisma.product.findMany({
        where: { id: { in: uncostedProductIds } },
        select: { id: true, defaultCostBasePence: true },
      })
      : Promise.resolve([]),
  ]);

  return {
    currency,
    salesAgg,
    income,
    outstandingSales,
    outstandingPurchases,
    balances,
    bestSellerGroups,
    todayAdj,
    todayVoids,
    todayReturns,
    todayCashVar,
    costedMarginAgg,
    uncostedMarginGroups,
    bestSellerProducts,
    uncostedProducts,
  };
}

const getCachedTradingDashboardSnapshot = unstable_cache(
  _getTradingDashboardSnapshot,
  ['report-trading-dashboard'],
  { revalidate: 60, tags: ['reports', 'trading-dashboard'] },
);

export default async function TradingDashboardContent({
  businessId,
  currency,
  timeZone,
  selectedStoreId,
  fromIso,
  toIso,
  periodKey,
  startIso,
  endIso,
  isToday,
}: TradingDashboardContentProps) {
  const scope: ReportingScope = {
    businessId,
    timeZone,
    periodKey,
    startInclusive: new Date(startIso),
    endExclusive: new Date(endIso),
    fromInputValue: fromIso,
    toInputValue: toIso,
    storeId: selectedStoreId === 'ALL' ? 'ALL' : selectedStoreId,
  };

  const storeFilter = selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId };
  const tradingBalances = await loadTradingOpenDocuments(
    businessId,
    selectedStoreId === 'ALL' ? undefined : selectedStoreId,
  );

  const [
    snapshot,
    moneyReceived,
    salesRevenue,
  ] = await Promise.all([
    measureServerOperation(
      'report.trading-dashboard.snapshot',
      () => getCachedTradingDashboardSnapshot(
        businessId,
        currency,
        startIso,
        endIso,
        selectedStoreId,
      ),
      {
        businessId,
        storeId: selectedStoreId,
        route: '/reports/dashboard',
        cacheState: 'cached-wrapper',
      },
      { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' },
    ),
    measureServerOperation(
      'report.trading-dashboard.money-received',
      () => getMoneyReceivedSummary(scope),
      {
        businessId,
        storeId: selectedStoreId,
        route: '/reports/dashboard',
        cacheState: 'uncached-money-received',
      },
      { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' },
    ),
    measureServerOperation(
      'report.trading-dashboard.sales-revenue',
      () => getSalesRevenueSummary(scope),
      {
        businessId,
        storeId: selectedStoreId,
        route: '/reports/dashboard',
        cacheState: 'uncached-sales-revenue',
      },
      { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' },
    ),
  ]);

  const {
    salesAgg,
    income,
    outstandingSales,
    outstandingPurchases,
    balances,
    bestSellerGroups,
    todayAdj,
    todayVoids,
    todayReturns,
    todayCashVar,
    costedMarginAgg,
    uncostedMarginGroups,
    bestSellerProducts,
    uncostedProducts,
  } = snapshot;

  const bestSellerProductMap = new Map(bestSellerProducts.map((product) => [product.id, product]));
  const uncostedProductCostMap = new Map(uncostedProducts.map((product) => [product.id, product.defaultCostBasePence]));

  // Summarise sales — shared sales-revenue contract (matches Home)
  const totalSales = salesRevenue.salesRevenuePence;
  const tradingMargin = await loadTradingPeriodMargin({
    businessId,
    startInclusive: scope.startInclusive,
    endExclusive: scope.endExclusive,
    storeId: selectedStoreId === 'ALL' ? undefined : selectedStoreId,
  });
  const totalGrossMargin = tradingMargin.grossProfitPence;
  const gpPercent = tradingMargin.grossProfitPercent;
  const marginReady = tradingMargin.state === 'READY' && totalGrossMargin != null && gpPercent != null;
  const npPercent = marginReady && totalSales > 0
    ? Math.round(((totalGrossMargin - income.otherExpenses) / totalSales) * 100)
    : 0;
  void costedMarginAgg;
  void uncostedMarginGroups;
  void uncostedProductCostMap;

  // Money received — payment records (authoritative for method totals)
  const paymentSplit = moneyReceived.byMethod;
  const totalPaymentReceipts = moneyReceived.totalPence;
  void salesAgg;

  // AR / AP
  const outstandingAR = tradingBalances.customerDebt.customerDuePence;
  const outstandingAP = tradingBalances.outstandingAPPence;

  // Debtor ageing buckets
  const bucketKeys = ['0–30 d', '31–60 d', '61–90 d', '90+ d'] as const;
  const ageingBuckets: Record<string, number> = Object.fromEntries(bucketKeys.map((k) => [k, 0]));
  for (const inv of outstandingSales) {
    if (!inv.customer) continue;
    const balance = receivableDocumentBalance({
      paymentStatus: inv.paymentStatus,
      totalPence: inv.totalPence,
      payments: inv.payments,
    }).balancePence;
    if (balance <= 0) continue;
    const bucket = getReceivableAgeBucket(inv.dueDate, inv.createdAt);
    ageingBuckets[bucket] += balance;
  }
  const topDebtorList = tradingBalances.customerDebt.accounts
    .filter(account => account.balancePence > 0)
    .map(account => ({ id: account.id, name: account.name, balance: account.balancePence }))
    .sort((a, b) => b.balance - a.balance).slice(0, 5);

  // Low stock
  const lowStock = balances
    .filter((b) => classifyInventoryState(b.qtyOnHandBase, b.product.reorderPointBase) !== 'healthy')
    .slice(0, 8);

  // Best sellers by revenue
  const bestItems = bestSellerGroups
    .map((group) => {
      const product = bestSellerProductMap.get(group.productId);
      if (!product) return null;
      return {
        id: group.productId,
        name: product.name,
        qty: group._sum.qtyBase ?? 0,
        revenue: group._sum.lineTotalPence ?? 0,
        units: product.productUnits,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 5);

  // Activity highlights
  const voidTotal = todayVoids.reduce((s, v) => s + v.totalPence, 0);
  const returnTotal = todayReturns.reduce((s, r) => s + r.refundAmountPence, 0);
  const cashVarTotal = todayCashVar.reduce((s, v) => s + Math.abs(v.variance ?? 0), 0);
  const hasActivity = todayAdj.length > 0 || todayVoids.length > 0 || todayReturns.length > 0 || cashVarTotal > 0;

  // Live status: last sale time today and open shift count
  const [lastSaleRecord, openShifts] = await measureServerOperation(
    'report.trading-dashboard.live-pulse',
    () => Promise.all([
      prisma.salesInvoice.findFirst({
        where: {
          businessId,
          ...storeFilter,
          createdAt: { gte: scope.startInclusive },
          paymentStatus: { notIn: ['VOID', 'RETURNED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.shift.findMany({
        where: {
          till: {
            store: {
              businessId,
              ...(selectedStoreId === 'ALL' ? {} : { id: selectedStoreId }),
            },
          },
          closedAt: null,
        },
        select: { id: true, user: { select: { name: true } } },
        take: 20,
      }),
    ]),
    {
      businessId,
      storeId: selectedStoreId,
      route: '/reports/dashboard',
      cacheState: 'uncached-live-pulse',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'report' },
  );
  const lastSaleMinutesAgo = lastSaleRecord
    ? Math.floor((Date.now() - lastSaleRecord.createdAt.getTime()) / 60_000)
    : null;
  const activeCashierCount = openShifts.length;
  const scopeHelper =
    selectedStoreId === 'ALL'
      ? 'Figures use the selected period across all branches. Expenses and net profit use business-wide accounting records.'
      : 'Sales and gross profit are filtered to this branch. Expenses cover the whole business.';
  const cashDrawerParams = buildReportingScopeSearchParams(scope);
  const cashDrawerHref = `/reports/cash-drawer?${cashDrawerParams.toString()}`;
  const receiptsHref = moneyReceivedHref(scope);

  const lastSaleChipLabel =
    lastSaleMinutesAgo === null
      ? 'No sales yet today'
      : lastSaleMinutesAgo === 0
      ? 'Last sale just now'
      : lastSaleMinutesAgo < 60
      ? `Last sale ${lastSaleMinutesAgo}m ago`
      : `Last sale ${Math.floor(lastSaleMinutesAgo / 60)}h ${lastSaleMinutesAgo % 60}m ago`;
  const cashierChipLabel = `${activeCashierCount} cashier${activeCashierCount === 1 ? '' : 's'} on shift`;
  const headerPulse = isToday
    ? [
        { label: lastSaleChipLabel, tone: lastSaleRecord ? ('positive' as const) : ('neutral' as const) },
        { label: cashierChipLabel, tone: activeCashierCount > 0 ? ('positive' as const) : ('warning' as const) },
      ]
    : [];

  const quantityLabel = (qty: number, units: { isBaseUnit: boolean; conversionToBase: number; unit: { name: string; pluralName: string } }[]) => {
    const baseUnit = units.find(u => u.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(units.map(pu => ({ conversionToBase: pu.conversionToBase, unit: pu.unit })));
    return formatMixedUnit({ qtyBase: qty, baseUnit: baseUnit?.unit.name ?? 'unit', baseUnitPlural: baseUnit?.unit.pluralName,
      packagingUnit: packaging?.unit.name, packagingUnitPlural: packaging?.unit.pluralName, packagingConversion: packaging?.conversionToBase });
  };
  void hasActivity;
  return <TradingReportView data={{
    currency, totalSales, totalPaymentReceipts,
    grossProfit: marginReady ? totalGrossMargin : null, grossProfitPercent: marginReady ? gpPercent : null,
    incompleteLineCount: tradingMargin.incompleteLineCount, expenses: income.otherExpenses,
    profitAfterExpenses: marginReady ? totalGrossMargin - income.otherExpenses : null,
    netProfitPercent: npPercent, allBranches: selectedStoreId === 'ALL', scopeHelper,
    creditUnpaid: salesRevenue.creditSalesOutstandingPence, outstandingAR, outstandingAP,
    customerDebt: {
      invoiceDue: tradingBalances.customerDebt.customerInvoiceDuePence,
      excess: tradingBalances.customerDebt.customerExcessPence,
      creditBalance: tradingBalances.customerDebt.customerCreditPence,
      netBalance: tradingBalances.customerDebt.customerBalancePence,
      unlinkedDue: tradingBalances.customerDebt.unlinkedDuePence,
      unlinkedExcess: tradingBalances.customerDebt.unlinkedExcessPence,
      unlinkedCount: tradingBalances.customerDebt.unlinkedInvoiceCount,
      scope: selectedStoreId === 'ALL' ? 'Sales across all branches' : 'Sales in the selected branch',
      salesHref: `/sales?${new URLSearchParams({ storeId: selectedStoreId }).toString()}`,
    },
    receiptsHref, cashDrawerHref,
    analyticsHref: `/reports/analytics?${new URLSearchParams({ storeId: selectedStoreId }).toString()}`,
    reorderHref: `/reports/reorder-suggestions?${new URLSearchParams({ storeId: selectedStoreId }).toString()}`,
    receiptOrigins: [
      { label: 'Received at sale', pence: moneyReceived.receivedAtSalePence },
      { label: 'Later credit collected', pence: moneyReceived.laterCreditCollectionPence },
      { label: 'Historical — not classified', pence: moneyReceived.unknownHistoricalOriginPence },
    ],
    methods: (['CASH', 'MOBILE_MONEY', 'CARD', 'TRANSFER', 'UNKNOWN'] as const).map(key => ({
      label: RECEIPT_METHOD_LABELS[key], pence: paymentSplit[key], href: moneyReceivedHref(scope, key),
    })),
    voidCount: todayVoids.length, voidTotal, returnCount: todayReturns.length, returnTotal,
    cashShiftCount: todayCashVar.length, cashDiscrepancies: cashVarTotal,
    adjustments: todayAdj.map(row => ({ product: row.product.name, direction: row.direction, quantity: row.qtyBase, user: row.user.name })),
    ageing: bucketKeys.map(label => ({ label, pence: ageingBuckets[label] })), debtors: topDebtorList,
    lowStock: lowStock.map(row => ({ id: row.id, name: row.product.name, quantity: quantityLabel(row.qtyOnHandBase, row.product.productUnits), reorder: row.product.reorderQtyBase })),
    bestItems: bestItems.map(row => ({ id: row.id, name: row.name, quantity: quantityLabel(row.qty, row.units), revenue: row.revenue })),
    livePulse: headerPulse.map(chip => chip.label).join(' · '),
    onShift: isToday && activeCashierCount > 0 ? openShifts.slice(0, 3).map(s => s.user?.name ?? '—').join(', ') + (openShifts.length > 3 ? ` +${openShifts.length - 3} more` : '') : '',
  }} />;
}
