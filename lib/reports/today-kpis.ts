import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { getAccountBalance } from './financials';
import {
  ensureSqliteReportDateColumnsNormalized,
  isDateOnOrAfter,
  isSqliteRuntime,
} from './sqlite-report-date-normalization';
import { getReceivableAgeBucket, summarizeInventoryRisk } from './operational-metrics';
import { expectedCashPenceFromEntries } from '@/lib/reports/expected-cash';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import {
  aggregateConfirmedReceiptsThroughAsOf,
  aggregateMoneyReceivedByMethod,
  requireMoneyReceivedMethodRows,
  resolveMoneyReceivedScope,
} from '@/lib/reports/money-received';
import {
  addLocalDays,
  businessDayWindow,
  localDateInstant,
  localDateKey,
  requireReportTimeZone,
  zonedDateTimeParts,
} from '@/lib/reports/reporting-clock';
import { evaluateMarginSet, resolveAuthoritativeLineCost, type MarginInvoiceInput } from '@/lib/reports/margin-line';
import { ReportingScopeStoreError, requireAuthorisedStoreIds } from '@/lib/reports/reporting-scope';

export type CommandCenterKpiScope = {
  storeIds: readonly string[];
  startInclusive: Date;
  endExclusive: Date;
  now?: Date;
};

function storeIdentity(storeIds: readonly string[]): string | { in: string[] } {
  if (storeIds.length === 1) return storeIds[0]!;
  return { in: [...storeIds] };
}

function storeClause(storeIds: readonly string[]): { storeId: string | { in: string[] } } {
  return { storeId: storeIdentity(storeIds) };
}
export type TodayKPIs = {
  totalSalesPence: number;
  grossMarginPence: number | null;
  gpPercent: number | null;
  marginState: 'READY' | 'INCOMPLETE_COSTS';
  incompleteLineCount: number;
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
  cashOnHandEstimatePence: number; // cash + bank/MoMo/card/transfer, with payment-ledger fallback
  openExpectedCashPence: number | null;
  todayReceiptsPence: number;
  negativeMarginProductCount: number;
  momoPendingCount: number;
  stockoutImminentCount: number;
  urgentReorderCount: number;
  thisWeekExpensesPence: number;
  fourWeekAvgExpensesPence: number;
  discountOverrideCount: number;
};

async function openExpectedCashFromEntries(
  businessId: string,
  storeId?: string,
  authorisedStoreIds?: readonly string[],
): Promise<number | null> {
  const storeIdentity = authorisedStoreIds
    ? (authorisedStoreIds.length === 1 ? { id: authorisedStoreIds[0]! } : { id: { in: [...authorisedStoreIds] } })
    : (storeId ? { id: storeId } : {});
  const shifts = await prisma.shift.findMany({
    where: {
      status: 'OPEN',
      closedAt: null,
      till: { store: { businessId, ...storeIdentity } },
    },
    select: {
      id: true,
      tillId: true,
      till: { select: { storeId: true, store: { select: { businessId: true } } } },
      cashDrawerEntries: {
        select: {
          entryType: true,
          amountPence: true,
          businessId: true,
          storeId: true,
          tillId: true,
          shiftId: true,
        },
      },
    },
  });
  if (shifts.length === 0) return null;
  return shifts.reduce(
    (sum, shift) =>
      sum +
      expectedCashPenceFromEntries(shift.cashDrawerEntries, {
        businessId: shift.till.store.businessId,
        storeId: shift.till.storeId,
        tillId: shift.tillId,
        shiftId: shift.id,
      }),
    0,
  );
}

function marginFromSaleLines(lines: Array<{
  lineSubtotalPence: number;
  lineDiscountPence?: number;
  promoDiscountPence?: number;
  lineCostPence: number;
  qtyBase: number;
  product: { defaultCostBasePence: number };
  salesInvoiceId?: string;
  salesInvoice?: { paymentStatus: string; discountPence?: number } | null;
}>): ReturnType<typeof evaluateMarginSet> {
  const grouped = new Map<string, MarginInvoiceInput>();
  lines.forEach((line, index) => {
    const key = line.salesInvoiceId ?? `line-${index}`;
    const invoice = grouped.get(key) ?? {
      paymentStatus: line.salesInvoice?.paymentStatus ?? 'PAID',
      discountPence: line.salesInvoice?.discountPence ?? 0,
      lines: [],
    };
    invoice.lines.push({
      lineSubtotalPence: line.lineSubtotalPence,
      lineDiscountPence: line.lineDiscountPence ?? 0,
      promoDiscountPence: line.promoDiscountPence ?? 0,
      lineCostPence: line.lineCostPence,
      qtyBase: line.qtyBase,
      defaultCostBasePence: line.product.defaultCostBasePence,
    });
    grouped.set(key, invoice);
  });
  return evaluateMarginSet([...grouped.values()]);
}

function summariseKpiReceivables(invoices: Array<{
  paymentStatus: string;
  totalPence: number;
  dueDate: Date | null;
  createdAt: Date;
  payments: Array<{ amountPence: number; status: string }>;
}>, now: Date) {
  let outstandingTotalPence = 0;
  let over60Pence = 0;
  let over90Pence = 0;
  for (const invoice of invoices) {
    const balancePence = receivableDocumentBalance(invoice).balancePence;
    outstandingTotalPence += balancePence;
    if (balancePence <= 0) continue;
    const bucket = getReceivableAgeBucket(invoice.dueDate, invoice.createdAt, now);
    if (bucket === '61–90 d' || bucket === '90+ d') over60Pence += balancePence;
    if (bucket === '90+ d') over90Pence += balancePence;
  }
  return { outstandingTotalPence, over60Pence, over90Pence };
}

function summariseKpiPayables(invoices: Array<{
  paymentStatus: string;
  totalPence: number;
  payments: Array<{ amountPence: number }>;
}>) {
  return invoices.reduce((sum, invoice) => sum + payableDocumentBalance(invoice).balancePence, 0);
}

async function getOperationalLiquidAssetsEstimatePence(
  businessId: string,
  asOfExclusive: Date,
  storeId?: string,
  authorisedStoreIds?: readonly string[],
) {
  const storeFilter = authorisedStoreIds ? storeClause(authorisedStoreIds) : (storeId ? { storeId } : {});

  const [
    business,
    openingBalances,
    salesPayments,
    purchasePayments,
    expensePayments,
  ] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { openingCapitalPence: true },
    }),
    prisma.openingBalance.findMany({
      where: {
        businessId,
        accountCode: { in: [ACCOUNT_CODES.cash, ACCOUNT_CODES.bank] },
      },
      select: { amountPence: true },
    }),
    // Canonical CONFIRMED receipts strictly before endExclusive — no parent RETURNED/VOID exclusion.
    aggregateConfirmedReceiptsThroughAsOf(prisma, {
      businessId,
      endExclusive: asOfExclusive,
      storeId: authorisedStoreIds ? undefined : storeId,
      storeIds: authorisedStoreIds ?? undefined,
    }),
    prisma.purchasePayment.aggregate({
      where: {
        paidAt: { lt: asOfExclusive },
        purchaseInvoice: { businessId, ...storeFilter },
      },
      _sum: { amountPence: true },
    }),
    prisma.expensePayment.aggregate({
      where: {
        businessId,
        ...storeFilter,
        paidAt: { lt: asOfExclusive },
      },
      _sum: { amountPence: true },
    }),
  ]);

  // Do not convert a Money Received query failure into zero receipts.
  if (salesPayments.queryFailed) return null;

  const openingPence = openingBalances.length > 0
    ? openingBalances.reduce((sum, row) => sum + row.amountPence, 0)
    : (business?.openingCapitalPence ?? 0);

  return Math.max(
    0,
    openingPence +
      salesPayments.amountPence -
      (purchasePayments._sum.amountPence ?? 0) -
      (expensePayments._sum.amountPence ?? 0)
  );
}

async function getLiquidAssetsPence(businessId: string, asOfExclusive: Date, storeId?: string) {
  const [accountingLiquidPence, operationalLiquidPence] = await Promise.all([
    Promise.all([
      getAccountBalance(businessId, ACCOUNT_CODES.cash, asOfExclusive),
      getAccountBalance(businessId, ACCOUNT_CODES.bank, asOfExclusive),
    ]).then(([cash, bank]) => cash + bank),
    getOperationalLiquidAssetsEstimatePence(businessId, asOfExclusive, storeId),
  ]);

  // Prefer the formal accounting balance when it exists. If a business has
  // sales/payments but historical journal repair has not been run yet, fall
  // back to the operational payment ledger so deeper owner intelligence still
  // has a practical cash-position signal. If the operational receipt query
  // failed, do not invent a zero-receipt cash position.
  if (accountingLiquidPence > 0) return accountingLiquidPence;
  if (operationalLiquidPence === null) return accountingLiquidPence;
  return operationalLiquidPence;
}

function lookbackStart(now: Date, timeZone: string, daysBack: number): Date {
  const key = localDateKey(addLocalDays(zonedDateTimeParts(now, timeZone), -daysBack));
  return localDateInstant(key, 'start', timeZone) ?? now;
}

async function getTodayKPIsSqlite(
  businessId: string,
  storeId: string | undefined,
  now: Date,
  timeZone: string,
  scope?: CommandCenterKpiScope,
): Promise<TodayKPIs> {
  const todayWindow = businessDayWindow(now, timeZone);
  const todayStart = todayWindow.startInclusive;
  const todayEnd = scope?.endExclusive ?? todayWindow.endExclusive;
  const authorisedStores = scope ? requireAuthorisedStoreIds(scope.storeIds) : null;
  const earliest = scope?.startInclusive;

  const sevenDaysAgoNatural = lookbackStart(now, timeZone, 7);
  const thirtyDaysAgoNatural = lookbackStart(now, timeZone, 30);
  const thirtyFiveDaysAgoNatural = lookbackStart(now, timeZone, 35);
  const fourteenDaysAgoNatural = lookbackStart(now, timeZone, 14);
  const sevenDaysAgo = earliest && sevenDaysAgoNatural < earliest ? earliest : sevenDaysAgoNatural;
  const fourteenDaysAgo = earliest && fourteenDaysAgoNatural < earliest ? earliest : fourteenDaysAgoNatural;
  const includeThirty = !earliest || thirtyDaysAgoNatural >= earliest;
  const includeFourWeek = !earliest || thirtyFiveDaysAgoNatural >= earliest;
  const thirtyDaysAgo = includeThirty ? thirtyDaysAgoNatural : earliest!;
  const thirtyFiveDaysAgo = includeFourWeek ? thirtyFiveDaysAgoNatural : earliest!;
  const expenseReadStart = includeFourWeek ? thirtyFiveDaysAgoNatural : (includeThirty ? thirtyDaysAgoNatural : sevenDaysAgo);
  // Recency floor for KPI monitoring queries. Invoices older than 90 days that
  // are still unpaid are not filtered out from authoritative balances (customers
  // page / supplier ledger) — only from the today-KPI dashboard cards.
  const storeFilter = authorisedStores ? storeClause(authorisedStores) : (storeId ? { storeId } : {});
  const enforced = authorisedStores ? storeFilter : {};

  const [salesRows, paymentRows, openSalesInvoices, outstandingPurchases, alertRows, balances, paidExpenses, momoPending, cashVarShifts, salesLines14d, cashOnHandEstimatePence] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter, createdAt: { gte: sevenDaysAgo, lt: todayEnd } },
      select: {
        totalPence: true,
        createdAt: true,
        paymentStatus: true,
        discountOverrideReason: true,
      },
    }),
    aggregateMoneyReceivedByMethod(
      prisma,
      resolveMoneyReceivedScope({
        businessId,
        currency: 'GHS',
        timeZone,
        periodStart: todayStart,
        periodEndInclusive: todayEnd,
        branchIds: authorisedStores ?? (storeId ? [storeId] : null),
        absoluteBounds: true,
      }),
    ),
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: {
        paymentStatus: true,
        totalPence: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amountPence: true, status: true } },
      },
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true } } },
    }),
    prisma.riskAlert.findMany({
      where: { businessId, ...enforced, severity: 'HIGH', status: 'OPEN', occurredAt: { gte: sevenDaysAgo, lt: todayEnd } },
      select: { occurredAt: true },
    }),
    prisma.inventoryBalance.findMany({
      where: authorisedStores ? storeFilter : (storeId ? { storeId } : { store: { businessId } }),
      select: {
        qtyOnHandBase: true,
        product: { select: { reorderPointBase: true, active: true } },
      },
    }),
    prisma.expense.findMany({
      where: { businessId, ...enforced, paymentStatus: 'PAID', createdAt: { gte: expenseReadStart, lt: todayEnd } },
      select: { amountPence: true, createdAt: true },
    }),
    prisma.mobileMoneyCollection.count({
      where: { businessId, ...enforced, status: 'PENDING' },
    }),
    prisma.shift.findMany({
      where: {
        till: {
          store: {
            businessId,
            ...(authorisedStores
              ? { id: storeIdentity(authorisedStores) }
              : (storeId ? { id: storeId } : {})),
          },
        },
        variance: { not: null },
        closedAt: { gte: sevenDaysAgo, lt: todayEnd },
      },
      select: { variance: true, closedAt: true },
      take: 200,
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId, ...storeFilter,
          createdAt: { gte: fourteenDaysAgo, lt: todayEnd },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        salesInvoiceId: true,
        lineSubtotalPence: true,
        lineDiscountPence: true,
        promoDiscountPence: true,
        lineCostPence: true,
        qtyBase: true,
        product: { select: { id: true, defaultCostBasePence: true } },
        salesInvoice: { select: { createdAt: true, paymentStatus: true, discountPence: true } },
      },
    }),
    authorisedStores
      ? getOperationalLiquidAssetsEstimatePence(businessId, todayEnd, undefined, authorisedStores)
      : getLiquidAssetsPence(businessId, todayEnd, storeId),
  ]);

  const validTodaySales = salesRows.filter((row) =>
    row.createdAt >= todayStart && row.createdAt < todayEnd && !['RETURNED', 'VOID'].includes(row.paymentStatus)
  );

  const totalSalesPence = validTodaySales.reduce((sum, row) => sum + row.totalPence, 0);

  // GP from sale lines — same source as margins/analytics
  const todaySaleLines = salesLines14d.filter((line) =>
    line.salesInvoice.createdAt >= todayStart && line.salesInvoice.createdAt < todayEnd &&
    !['RETURNED', 'VOID'].includes(line.salesInvoice.paymentStatus)
  );
  const todayMargin = marginFromSaleLines(todaySaleLines);
  const grossMarginPence = todayMargin.grossProfitPence;
  const gpPercent = todayMargin.grossProfitPercent;

  const paymentSplit: Record<string, number> = {};
  for (const row of requireMoneyReceivedMethodRows(paymentRows)) {
    paymentSplit[row.method] = (paymentSplit[row.method] ?? 0) + row.amountPence;
  }
  const todayReceiptsPence = Object.values(paymentSplit).reduce((sum, amount) => sum + amount, 0);

  const receivables = summariseKpiReceivables(openSalesInvoices, now);

  const outstandingAPPence = summariseKpiPayables(outstandingPurchases);

  const activeBalances = balances.filter((b) => b.product.active);
  const inventorySummary = summarizeInventoryRisk(
    activeBalances.map((balance) => ({
      qtyOnHandBase: balance.qtyOnHandBase,
      reorderPointBase: balance.product.reorderPointBase,
    }))
  );

  const totalExpenses30d = includeThirty
    ? paidExpenses
      .filter((expense) => isDateOnOrAfter(expense.createdAt, thirtyDaysAgo))
      .reduce((sum, expense) => sum + expense.amountPence, 0)
    : 0;
  const avgDailyExpensesPence = Math.round(totalExpenses30d / 30);
  const thisWeekExpensesPence = paidExpenses
    .filter((expense) => isDateOnOrAfter(expense.createdAt, sevenDaysAgo))
    .reduce((sum, expense) => sum + expense.amountPence, 0);
  const fourWeekTotal = includeFourWeek
    ? paidExpenses
      .filter((expense) => isDateOnOrAfter(expense.createdAt, thirtyFiveDaysAgo) && !isDateOnOrAfter(expense.createdAt, sevenDaysAgo))
      .reduce((sum, expense) => sum + expense.amountPence, 0)
    : 0;
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
    const resolvedCost = resolveAuthoritativeLineCost({
      lineSubtotalPence: line.lineSubtotalPence,
      lineDiscountPence: line.lineDiscountPence ?? 0,
      promoDiscountPence: line.promoDiscountPence ?? 0,
      lineCostPence: line.lineCostPence,
      qtyBase: line.qtyBase,
      defaultCostBasePence: line.product.defaultCostBasePence,
    });
    existing.cost += resolvedCost.authoritative ? resolvedCost.costPence : 0;
    productMargins.set(key, existing);
  }

  const negativeMarginProductCount = Array.from(productMargins.values()).filter(
    (p) => p.revenue > 0 && p.revenue < p.cost
  ).length;

  return {
    totalSalesPence,
    grossMarginPence,
    gpPercent,
    marginState: todayMargin.state,
    incompleteLineCount: todayMargin.incompleteLineCount,
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
    cashOnHandEstimatePence: Math.max(0, cashOnHandEstimatePence ?? 0),
    openExpectedCashPence: await openExpectedCashFromEntries(businessId, storeId, authorisedStores ?? undefined),
    todayReceiptsPence,
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

async function _getTodayKPIs(
  businessId: string,
  storeId?: string,
  scope?: CommandCenterKpiScope,
): Promise<TodayKPIs> {
  const authorisedStores = scope ? requireAuthorisedStoreIds(scope.storeIds) : null;
  if (scope && !(scope.startInclusive < scope.endExclusive)) {
    throw new ReportingScopeStoreError('Authorised reporting window is required');
  }

  try {
    await ensureSqliteReportDateColumnsNormalized();
  } catch (error) {
    console.error('[today-kpis] SQLite date normalization failed', {
      businessId,
      storeId,
      error,
    });
  }

  const now = scope?.now ?? new Date();
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  const timeZone = requireReportTimeZone(business?.timezone);
  if (isSqliteRuntime()) {
    return getTodayKPIsSqlite(businessId, storeId, now, timeZone, scope);
  }

  const todayWindow = businessDayWindow(now, timeZone);
  const earliest = scope?.startInclusive;
  const todayStart = earliest && todayWindow.startInclusive < earliest ? earliest : todayWindow.startInclusive;
  const todayEnd = scope?.endExclusive && scope.endExclusive < todayWindow.endExclusive
    ? scope.endExclusive
    : todayWindow.endExclusive;

  const sevenDaysAgoNatural = lookbackStart(now, timeZone, 7);
  const thirtyDaysAgoNatural = lookbackStart(now, timeZone, 30);
  const thirtyFiveDaysAgoNatural = lookbackStart(now, timeZone, 35);
  const fourteenDaysAgoNatural = lookbackStart(now, timeZone, 14);
  const sevenDaysAgo = earliest && sevenDaysAgoNatural < earliest ? earliest : sevenDaysAgoNatural;
  const fourteenDaysAgo = earliest && fourteenDaysAgoNatural < earliest ? earliest : fourteenDaysAgoNatural;
  const includeThirty = !earliest || thirtyDaysAgoNatural >= earliest;
  const includeFourWeek = !earliest || thirtyFiveDaysAgoNatural >= earliest;
  // Recency floor for KPI monitoring queries only.
  const storeFilter = authorisedStores ? storeClause(authorisedStores) : (storeId ? { storeId } : {});
  const enforced = authorisedStores ? storeFilter : {};

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
        createdAt: { gte: todayStart, lt: todayEnd },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    // Today's payments — canonical Money Received (CONFIRMED; no parent RETURNED/VOID)
    aggregateMoneyReceivedByMethod(
      prisma,
      resolveMoneyReceivedScope({
        businessId,
        currency: 'GHS',
        timeZone,
        periodStart: todayStart,
        periodEndInclusive: todayEnd,
        branchIds: authorisedStores ?? (storeId ? [storeId] : null),
        absoluteBounds: true,
      }),
    ),
    prisma.salesInvoice.findMany({
      where: { businessId, ...storeFilter, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: {
        paymentStatus: true,
        totalPence: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amountPence: true, status: true } },
      },
    }),
    // Outstanding AP — aggregate at DB level
    prisma.purchaseInvoice.findMany({
      where: {
        businessId, ...storeFilter,
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      select: { paymentStatus: true, totalPence: true, payments: { select: { amountPence: true } } },
    }),
    // Open HIGH risk alerts
    prisma.riskAlert.count({
      where: {
        businessId,
        ...enforced,
        severity: 'HIGH',
        status: 'OPEN',
        occurredAt: { gte: sevenDaysAgo, lt: todayEnd },
      },
    }),
    // Inventory balances
    prisma.inventoryBalance.findMany({
      where: authorisedStores
        ? storeFilter
        : (storeId ? { storeId } : { store: { businessId } }),
      select: {
        qtyOnHandBase: true,
        product: { select: { reorderPointBase: true, active: true } },
      },
    }),
    // 30-day expenses — skipped when that start is outside the authorised envelope
    includeThirty
      ? prisma.expense.aggregate({
        where: { businessId, ...enforced, createdAt: { gte: thirtyDaysAgoNatural, lt: todayEnd }, paymentStatus: 'PAID' },
        _sum: { amountPence: true },
      })
      : Promise.resolve({ _sum: { amountPence: null as number | null } }),
    // This week expenses — aggregate at DB level
    prisma.expense.aggregate({
      where: { businessId, ...enforced, createdAt: { gte: sevenDaysAgo, lt: todayEnd }, paymentStatus: 'PAID' },
      _sum: { amountPence: true },
    }),
    // 4-week expenses are a 35-date read. Command Center does not issue them unless the authorised envelope covers that start.
    includeFourWeek
      ? prisma.expense.aggregate({
        where: { businessId, ...enforced, createdAt: { gte: thirtyFiveDaysAgoNatural, lt: sevenDaysAgoNatural }, paymentStatus: 'PAID' },
        _sum: { amountPence: true },
      })
      : Promise.resolve({ _sum: { amountPence: null as number | null } }),
    // MoMo pending
    prisma.mobileMoneyCollection.count({
      where: { businessId, ...enforced, status: 'PENDING' },
    }),
    // Cash variances last 7 days
    prisma.shift.findMany({
      where: {
        till: {
          store: {
            businessId,
            ...(authorisedStores
              ? { id: storeIdentity(authorisedStores) }
              : (storeId ? { id: storeId } : {})),
          },
        },
        closedAt: { gte: sevenDaysAgo, lt: todayEnd },
        variance: { not: null },
      },
      select: { variance: true },
      take: 200,
    }),
    // Discount overrides this week
    prisma.salesInvoice.count({
      where: {
        businessId,
        ...enforced,
        createdAt: { gte: sevenDaysAgo, lt: todayEnd },
        discountOverrideReason: { not: null },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
    }),
    // Sales lines for negative margin check (14 days)
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId,
          ...enforced,
          createdAt: { gte: fourteenDaysAgo, lt: todayEnd },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        lineSubtotalPence: true,
        lineDiscountPence: true,
        promoDiscountPence: true,
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
          ...storeFilter,
          createdAt: { gte: todayStart, lt: todayEnd },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        salesInvoiceId: true,
        lineSubtotalPence: true,
        lineDiscountPence: true,
        promoDiscountPence: true,
        lineCostPence: true,
        qtyBase: true,
        product: { select: { defaultCostBasePence: true } },
        salesInvoice: { select: { paymentStatus: true, discountPence: true } },
      },
    }),
    authorisedStores
      ? getOperationalLiquidAssetsEstimatePence(businessId, todayEnd, undefined, authorisedStores)
      : getLiquidAssetsPence(businessId, todayEnd, storeId),
  ]);

  // Sales KPIs — already aggregated by the DB
  const totalSalesPence = salesAgg._sum.totalPence ?? 0;

  // GP from sale lines — same source as margins/analytics
  const todayMargin = marginFromSaleLines(todayLinesForGP);
  const grossMarginPence = todayMargin.grossProfitPence;
  const gpPercent = todayMargin.grossProfitPercent;

  // Payment split — canonical Money Received aggregation
  const paymentSplit: Record<string, number> = {};
  for (const p of requireMoneyReceivedMethodRows(paymentsByMethod)) {
    paymentSplit[p.method] = (paymentSplit[p.method] ?? 0) + p.amountPence;
  }
  const todayReceiptsPence = Object.values(paymentSplit).reduce((sum, amount) => sum + amount, 0);

  // AR — computed from open invoice balances so ageing buckets align with dashboard logic
  const receivables = summariseKpiReceivables(openSalesInvoices, now);

  const outstandingAPPence = summariseKpiPayables(outstandingPurchases);

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
    const resolvedCost = resolveAuthoritativeLineCost({
      lineSubtotalPence: line.lineSubtotalPence,
      lineDiscountPence: line.lineDiscountPence ?? 0,
      promoDiscountPence: line.promoDiscountPence ?? 0,
      lineCostPence: line.lineCostPence,
      qtyBase: line.qtyBase,
      defaultCostBasePence: line.product.defaultCostBasePence,
    });
    existing.cost += resolvedCost.authoritative ? resolvedCost.costPence : 0;
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
    marginState: todayMargin.state,
    incompleteLineCount: todayMargin.incompleteLineCount,
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
    cashOnHandEstimatePence: Math.max(0, cashOnHandEstimatePence ?? 0),
    openExpectedCashPence: await openExpectedCashFromEntries(businessId, storeId, authorisedStores ?? undefined),
    todayReceiptsPence,
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

/** Command Center only. Requires the authorised store list and half-open window before any query. */
export function getCommandCenterKpis(businessId: string, scope: CommandCenterKpiScope): Promise<TodayKPIs> {
  try {
    requireAuthorisedStoreIds(scope.storeIds);
    if (!(scope.startInclusive < scope.endExclusive)) {
      throw new ReportingScopeStoreError('Authorised reporting window is required');
    }
  } catch (error) {
    return Promise.reject(error);
  }
  return _getTodayKPIs(businessId, undefined, scope);
}

export function getTodayKPIs(businessId: string, storeId?: string): Promise<TodayKPIs> {
  return measureServerOperation(
    'report.today-kpis.snapshot',
    () => cachedTodayKPIs(businessId, storeId ?? ''),
    {
      businessId,
      storeId: storeId ?? 'ALL',
      route: '/reports/dashboard',
      cacheState: 'cached-wrapper',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'report' }
  );
}
