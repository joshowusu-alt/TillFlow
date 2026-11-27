import { prisma } from '@/lib/prisma';
import { branchFromAllow, inspectLiveReport, visibleReportHrefs } from '@/lib/entitlements/live-report';
import type { OwnerHomeCriticalShell } from '@/lib/owner-home/critical-shell';
import { assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';
import { getUnreviewedHomeCashDifferences } from '@/lib/owner-home/cash-differences';
import { resolveReportingScope, tradingReportHref, moneyReceivedHref } from '@/lib/reports/reporting-scope';
import { getSalesRevenueSummary } from '@/lib/reports/sales-revenue';
import { computeMoneyReceivedBundle } from '@/lib/reports/money-received';
import { getIncomeStatementBreakdown } from '@/lib/reports/financials';
import { incomeStatementEntriesHref } from '@/lib/reports/income-statement-breakdown';
import { resolveReadinessExpectedCashPence } from '@/lib/reports/home-expected-cash';
import { requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { buildTodayWindows, shiftLocalDateKey } from '@/lib/reports/today/windows';
import { loadToday } from '@/lib/reports/today/load';
import { formatMoney } from '@/lib/format';
import type { HomeFigure, HomeAttentionRow } from './HomeOverviewView';

// Presentation adapter: all amounts come from the existing report contracts.
export async function loadHomeScope(shell: OwnerHomeCriticalShell, now: Date) {
  const search = shell.plan === 'PRO' ? { storeId: 'ALL' } : undefined;
  const report = await inspectLiveReport({
    surfaceId: 'command_center', search, now,
    range: ({ timezone }) => {
      const today = formatBusinessLocalDateKey(now, requireReportTimeZone(timezone));
      return { fromLocalDate: shiftLocalDateKey(today, -6), toLocalDate: today, preset: 'CUSTOM' };
    },
  });
  if (report.page.outcome !== 'allow' || report.business?.id !== shell.businessId) throw new Error('Home report unavailable');
  const branch = branchFromAllow('command_center', report.business.canonicalPlan, report.page.decision, report.stores);
  if (branch.kind !== 'stores' || !branch.storeIds.length) throw new Error('Choose a branch');
  const timeZone = requireReportTimeZone(report.business.timezone);
  const scope = resolveReportingScope({
    businessId: shell.businessId, timeZone, now, defaultPeriod: 'today',
    allowedStoreIds: report.stores.map(s => s.id),
    params: { period: 'today', storeId: branch.selected },
  });
  const today = scope.fromInputValue;
  const range = { fromLocalDate: today, toLocalDate: today, preset: 'CUSTOM' as const };
  const scopeLabel = branch.selected === 'ALL' ? 'All branches' : report.stores.find(s => s.id === branch.selected)?.name;
  if (!scopeLabel || !report.page.decision.appliedRange) throw new Error('Home scope unavailable');
  const windows = buildTodayWindows({
    now, timeZone, plan: report.business.canonicalPlan,
    authorisedFrom: report.page.decision.appliedRange.fromLocalDate,
    authorisedTo: report.page.decision.appliedRange.toLocalDate,
  });
  return { report, branch, scope, timeZone, today, range, scopeLabel, windows, now };
}

type Context = Awaited<ReturnType<typeof loadHomeScope>>;
const unavailable = (label: string): HomeFigure => ({ label, value: null });

export async function loadHomeFigures(shell: OwnerHomeCriticalShell, ctx: Context): Promise<HomeFigure[]> {
  assertHomeLoaderAllowed('performance');
  const { branch, scope, range, now } = ctx;
  const search = { storeId: branch.selected };
  const money = (pence: number) => formatMoney(pence, shell.currency);
  const [sales, received, profit] = await Promise.allSettled([
    (async () => {
      const gate = await inspectLiveReport({ surfaceId: 'trading_report', search, now, range });
      if (gate.page.outcome !== 'allow' || gate.business?.id !== shell.businessId) throw new Error('Sales unavailable');
      const summary = await getSalesRevenueSummary(scope);
      return summary;
    })(),
    (async () => {
      const gate = await inspectLiveReport({ surfaceId: 'money_received', search, now, range });
      if (gate.page.outcome !== 'allow' || gate.business?.id !== shell.businessId) throw new Error('Receipts unavailable');
      const bundle = await computeMoneyReceivedBundle({
        businessId: shell.businessId, currency: shell.currency, timeZone: ctx.timeZone,
        periodStart: scope.startInclusive, periodEndInclusive: scope.endExclusive,
        branchIds: branch.storeIds, absoluteBounds: true,
      });
      if (bundle.quality.overall === 'QUERY_FAILED' || bundle.byId.money_received.valuePence == null) throw new Error('Receipts unavailable');
      return bundle.byId.money_received.valuePence;
    })(),
    (async (): Promise<HomeFigure> => {
      if (shell.plan === 'STARTER') return { label: 'Profit', value: null, upgrade: true };
      const gate = await inspectLiveReport({ surfaceId: 'income_statement', now, range });
      if (gate.page.outcome !== 'allow' || gate.business?.id !== shell.businessId) throw new Error('Profit unavailable');
      const statement = await getIncomeStatementBreakdown(shell.businessId, scope.startInclusive, scope.endExclusive);
      const dates = new URLSearchParams({ from: ctx.today, to: ctx.today });
      const note = ctx.report.stores.length > 1 && branch.selected !== 'ALL' ? 'Whole business' : undefined;
      if (statement.netProfit == null || statement.grossProfit == null || statement.cogs == null) {
        return { label: 'Profit', value: null, incomplete: true, note, href: incomeStatementEntriesHref('grossProfit', ctx.today, ctx.today) + '&issues=1' };
      }
      return { label: 'Profit', value: money(statement.netProfit), note, href: '/reports/income-statement?' + dates };
    })(),
  ]);
  return [
    sales.status === 'fulfilled' ? { label: 'Sales', value: money(sales.value.salesRevenuePence), href: tradingReportHref(scope) } : unavailable('Sales'),
    received.status === 'fulfilled' ? {
      label: 'Money received', value: money(received.value), href: moneyReceivedHref(scope),
      note: sales.status !== 'fulfilled' || sales.value.transactionCount > 5000 ? 'Credit amount unavailable' :
        sales.value.creditSalesOutstandingPence > 0 ? money(sales.value.creditSalesOutstandingPence) + ' on credit today' : undefined,
    } : unavailable('Money received'),
    profit.status === 'fulfilled' ? profit.value : unavailable('Profit'),
    sales.status === 'fulfilled' ? { label: 'Transactions', value: String(sales.value.transactionCount), href: tradingReportHref(scope) } : unavailable('Transactions'),
  ];
}

export async function loadHomeTills(shell: OwnerHomeCriticalShell, ctx: Context) {
  const shifts = await prisma.shift.findMany({
    where: { status: 'OPEN', closedAt: null, till: { store: { businessId: shell.businessId, id: { in: ctx.branch.storeIds } } } },
    select: { id: true, tillId: true, till: { select: { storeId: true } }, cashDrawerEntries: { select: {
      entryType: true, amountPence: true, businessId: true, storeId: true, tillId: true, shiftId: true,
    } } },
  });
  const expected = await resolveReadinessExpectedCashPence({ openShifts: shifts.map(shift => ({
    businessId: shell.businessId, storeId: shift.till.storeId, tillId: shift.tillId, shiftId: shift.id, entries: shift.cashDrawerEntries,
  })) });
  return {
    count: shifts.length,
    expected: expected === null ? null : formatMoney(expected, shell.currency),
    href: ctx.branch.selected === 'ALL'
      ? '/reports?storeId=ALL'
      : '/shifts?' + new URLSearchParams({ storeId: ctx.branch.selected }),
  };
}

export async function loadHomeAttention(shell: OwnerHomeCriticalShell, ctx: Context): Promise<HomeAttentionRow[]> {
  assertHomeLoaderAllowed('attention');
  const { branch, windows, report } = ctx;
  const allowed = await visibleReportHrefs(ctx.now);
  const href = (path: string) => path + '?' + new URLSearchParams({ storeId: branch.selected, from: ctx.today, to: ctx.today });
  const todayHref = '/reports?' + new URLSearchParams({ storeId: branch.selected });
  const [snapshot, differences] = await Promise.all([
    loadToday(prisma, {
      businessId: shell.businessId, businessCategory: report.business?.businessCategory,
      ownedStoreIds: report.stores.map(s => s.id), storeIds: branch.storeIds,
      currency: shell.currency, timeZone: ctx.timeZone, plan: shell.plan, windows,
      showProfit: shell.plan !== 'STARTER' && allowed.has('/reports/margins'),
      consolidated: branch.selected === 'ALL', storeNames: report.stores,
      hrefForShift: todayHref, hrefForCash: allowed.has('/reports/cash-drawer') ? href('/reports/cash-drawer') : null,
      hrefForMomo: allowed.has('/reports/momo-confirmation') ? href('/reports/momo-confirmation') : null,
      hrefForNetwork: todayHref, hrefForCustomers: todayHref,
      hrefForSuppliers: allowed.has('/payments/supplier-aging') ? href('/payments/supplier-aging') : null,
      hrefForBelowCost: allowed.has('/reports/margins') ? href('/reports/margins') : null,
      hrefForLowStock: shell.plan === 'STARTER' ? todayHref : allowed.has('/reports/reorder-suggestions') ? href('/reports/reorder-suggestions') : null,
    }),
    getUnreviewedHomeCashDifferences(shell.businessId),
  ]);
  const cash = differences.filter(row => branch.storeIds.includes(row.storeId))
    .sort((a, b) => Number(b.large) - Number(a.large) || Math.abs(b.variancePence) - Math.abs(a.variancePence));
  return [
    ...snapshot.attention.filter(row => row.rank !== 2 || cash.length === 0).map(row => ({
      rank: row.rank, title: row.title, detail: row.detail, href: row.href, action: row.action,
    })),
    ...cash.map(row => ({
      rank: 2, title: 'Cash difference · ' + formatMoney(row.variancePence, shell.currency),
      detail: row.cashier + ' · ' + row.storeName + ' · ' + row.reason,
      href: '/shifts/variance/' + row.id, storeId: row.storeId, action: 'Review',
    })),
  ].sort((a, b) => a.rank - b.rank);
}
