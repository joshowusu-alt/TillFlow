/** Synthetic fixtures only; customer loaders and databases are never imported. */
import type { AnalyticsData } from '@/app/(protected)/reports/analytics/AnalyticsClient';
import type { TradingViewData } from '@/components/reports/stage3b/TradingReportView';

export type Stage3bFixture = 'normal' | 'large' | 'negative' | 'empty' | 'incomplete' | 'failed' | 'debt' | 'credit';
export function stage3bTradingFixture(state: Stage3bFixture): TradingViewData {
  const sales = state === 'large' ? 1_234_567_890 : state === 'empty' ? 0 : 16_273_050;
  const receipt = state === 'large' ? 1_234_771_490 : state === 'empty' ? 0 : 16_476_650;
  const profit = state === 'incomplete' ? null : state === 'negative' ? -1_234_567_890 : state === 'empty' ? null : Math.round(sales * .25);
  const query = 'from=2026-09-01&to=2026-09-30&storeId=sample-branch';
  return {
    currency: 'GHS', totalSales: sales, totalPaymentReceipts: receipt,
    grossProfit: profit, grossProfitPercent: profit == null ? null : state === 'negative' ? -100 : 25, incompleteLineCount: state === 'incomplete' ? 4 : 0,
    expenses: state === 'empty' ? 0 : 100_000, profitAfterExpenses: profit == null ? null : profit - 100_000,
    netProfitPercent: 20, allBranches: false, creditUnpaid: state === 'empty' ? 0 : 500_000,
    outstandingAR: state === 'empty' ? 0 : state === 'debt' ? 64_850 : 750_000, outstandingAP: state === 'empty' ? 0 : 420_000,
    customerDebt: { invoiceDue: state === 'empty' ? 0 : state === 'debt' ? 64_850 : 750_000, excess: state === 'credit' ? 900_000 : 0, creditBalance: state === 'credit' ? 900_000 : 0, netBalance: state === 'credit' ? -150_000 : state === 'empty' ? 0 : state === 'debt' ? 64_850 : 750_000, unlinkedDue: state === 'debt' ? 1_876_900 : 0, unlinkedExcess: state === 'credit' ? 60_000 : 0, unlinkedCount: state === 'debt' ? 3 : state === 'credit' ? 1 : 0, scope: 'Sales in the selected branch', salesHref: '/sales?storeId=sample-branch' },
    scopeHelper: 'Sales and gross profit are filtered to this branch. Expenses cover the whole business.',
    receiptsHref: `/reports/money-received?${query}`, cashDrawerHref: `/reports/cash-drawer?${query}`,
    analyticsHref: '/reports/analytics?storeId=sample-branch', reorderHref: '/reports/reorder-suggestions?storeId=sample-branch',
    receiptOrigins: [{ label: 'Received at sale', pence: receipt - (receipt ? 500_000 : 0) }, { label: 'Later credit collected', pence: receipt ? 500_000 : 0 }, { label: 'Historical — not classified', pence: 0 }],
    methods: [{ label: 'Physical cash', pence: state === 'negative' ? receipt + 50_000 : receipt, href: `/reports/money-received?${query}&method=CASH` }, { label: 'Mobile Money (MoMo)', pence: state === 'negative' ? -50_000 : 0, href: `/reports/money-received?${query}&method=MOBILE_MONEY` }],
    voidCount: 0, voidTotal: 0, returnCount: state === 'empty' ? 0 : 2, returnTotal: state === 'empty' ? 0 : 245_600,
    cashShiftCount: state === 'empty' ? 0 : 3, cashDiscrepancies: state === 'empty' ? 0 : 110_050,
    adjustments: [], ageing: [{ label: '0–30 d', pence: state === 'empty' || state === 'debt' ? 0 : 750_000 }, { label: '31–60 d', pence: 0 }, { label: '61–90 d', pence: 0 }, { label: '90+ d', pence: state === 'debt' ? 64_850 : 0 }],
    debtors: state === 'empty' ? [] : [{ id: 'sample-customer', name: 'Sample customer', balance: state === 'debt' ? 64_850 : 750_000 }],
    lowStock: state === 'empty' ? [] : [{ id: 'sample-balance', name: 'Sample milk 1L', quantity: '2 cartons', reorder: 12 }],
    bestItems: state === 'empty' ? [] : [{ id: 'rice', name: 'Sample rice 5kg', quantity: '61 bags', revenue: 905_000 }], livePulse: '', onShift: '',
  };
}

export function stage3bAnalyticsFixture(state: Stage3bFixture): AnalyticsData {
  const sales = state === 'large' ? 1_234_567_890 : state === 'empty' ? 0 : 1_016_850;
  const previous = state === 'empty' ? 0 : Math.round(sales * .8);
  const values = state === 'empty' ? [0,0,0,0,0,0,0] : [120_000, 80_000, 150_000, 200_000, 90_000, 200_000, sales - 840_000];
  const labels = ['Mon 28', 'Tue 29', 'Wed 30', 'Thu 1', 'Fri 2', 'Sat 3', 'Sun 4'];
  return {
    currency: 'GHS', periodDays: 7, salesTrend: { labels, values }, profitTrend: { labels: [], values: [] },
    hourlyData: state === 'empty' ? [] : [{ day: 'Mon', hour: 12, sales: 9 }, { day: 'Mon', hour: 14, sales: 6 }, { day: 'Sat', hour: 10, sales: 20 }],
    categoryData: state === 'empty' ? [] : [{ name: 'Groceries', value: 700_000 }, { name: 'Household', value: sales - 700_000 }],
    productData: state === 'empty' ? [] : [{ name: 'Sample rice 5kg', revenue: Math.round(sales * .5), profit: 10_000, margin: 20 }, { name: 'Sample milk 1L', revenue: Math.round(sales * .2), profit: 5000, margin: 10 }],
    comparison: { labels, current: values, previous: values.map(value => value * .8) },
    kpis: { totalSales: sales, totalProfit: state === 'incomplete' || state === 'empty' ? null : state === 'negative' ? -1_234_567_890 : Math.round(sales * .25),
      marginPercent: state === 'incomplete' || state === 'empty' ? null : state === 'negative' ? -100 : 25,
      totalTransactions: state === 'empty' ? 0 : 90, avgTransaction: state === 'empty' ? 0 : sales / 90,
      growthPercent: state === 'empty' ? 0 : 25, previousPeriodSales: previous, topSellingProduct: state === 'empty' ? '' : 'Sample rice 5kg', peakHour: state === 'empty' ? '' : '10:00' },
  };
}
