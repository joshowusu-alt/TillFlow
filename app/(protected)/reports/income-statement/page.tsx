import { isFoodBusiness } from '@/lib/food/business';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import DownloadLink from '@/components/DownloadLink';
import EmptyState from '@/components/EmptyState';
import PeriodChips, { readableReportPeriod } from '@/components/reports/PeriodChips';
import ReportSummaryCard, { ReportSummaryRow } from '@/components/reports/ReportSummaryCard';
import { ReportReadOnlyBanner, ReportScopeLabel } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { formatMoney } from '@/lib/format';
import { getIncomeStatement, getIncomeStatementBreakdown } from '@/lib/reports/financials';
import { INCOME_STATEMENT_METRICS, incomeStatementEntriesHref, type IncomeStatementMetric } from '@/lib/reports/income-statement-breakdown';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';

export default async function IncomeStatementPage(
  props: {
    searchParams?: Promise<{ from?: string; to?: string; periodChip?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const opened = await openLiveReport({
    surfaceId: 'income_statement',
    search: searchParams,
    range: ({ timezone, now }) => {
      if (searchParams?.from && searchParams?.to) {
        return { fromLocalDate: searchParams.from, toLocalDate: searchParams.to, preset: 'CUSTOM' };
      }
      const today = formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: `${today.slice(0, 7)}-01`, toLocalDate: today, preset: 'MONTH_TO_DATE' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;

  const now = new Date();
  const month = businessMonthWindow(now, requireReportTimeZone(business.timezone));
  const applied = opened.decision.appliedRange;
  const { start, end, fromInputValue: fromStr, toInputValue: toStr } = resolveReportDateRange(
    applied ? { from: applied.fromLocalDate, to: applied.toLocalDate } : searchParams,
    month.startInclusive,
    now,
    month.timeZone,
  );

  const statement = await getIncomeStatement(business.id, start, end);
  const breakdownLink = (metric: IncomeStatementMetric, value: ReactNode) => (
    <Link href={incomeStatementEntriesHref(metric, fromStr, toStr)}
      aria-label={`View ${INCOME_STATEMENT_METRICS[metric].label} supporting records: ${statement[metric] === null ? 'Costs incomplete' : formatMoney(statement[metric], business.currency)}`}
      className="inline-flex min-h-11 items-center rounded underline decoration-current/30 underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
      {value}
    </Link>
  );
  const costsIncomplete = statement.grossProfit == null || statement.netProfit == null || statement.cogs == null;
  const gpPct = !costsIncomplete && statement.revenue > 0 ? Math.round((statement.grossProfit! / statement.revenue) * 100) : 0;
  const npPct = !costsIncomplete && statement.revenue > 0 ? Math.round((statement.netProfit! / statement.revenue) * 100) : 0;
  const hasData =
    statement.revenue !== 0 ||
    statement.cogs !== 0 || statement.hasFoodCosts ||
    statement.otherExpenses !== 0 ||
    statement.otherOperatingIncome !== 0;
  // Keep the original figure-producing service. Load supporting records only
  // when a warning needs an exact count of affected sales rather than sale lines.
  const issueEntries = costsIncomplete ? (await getIncomeStatementBreakdown(business.id, start, end)).entries : [];
  const incompleteSales = issueEntries.filter(entry =>
    entry.kind === 'sale' && entry.incompleteLines?.some(line => line.reason !== 'UNSUPPORTED_RETURN')).length;
  const returnIssues = issueEntries.some(entry => entry.kind === 'sale' &&
    entry.profitPence === null && (!entry.incompleteLines?.length || entry.incompleteLines.some(line => line.reason === 'UNSUPPORTED_RETURN')));
  const profitWarning = incompleteSales
    ? `Profit is incomplete: ${incompleteSales} sale${incompleteSales === 1 ? ' has' : 's have'} no product cost.${returnIssues ? ' Some return records also need review.' : ''}`
    : statement.incompleteLineCount > 0 ? 'Profit is incomplete: some sale costs or return records need review.' : 'Profit is incomplete: a return record needs review.';
  const percent = (label: string, value: number) => <span>{label}{!costsIncomplete ? <small className="block text-xs font-normal text-slate-600">({value}% of sales)</small> : null}</span>;

  return (
    <div className="space-y-4">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      {applied?.label === 'Last 30 days' ? <ReportScopeLabel label="Last 30 days" /> : null}
      <ReportsDestinationHead
        title="Income Statement"
        scopeLabel={opened.branch.kind === 'label' && opened.stores?.length > 1 ? 'Whole business — not separated by branch' : undefined}
        periodLabel={readableReportPeriod(fromStr, toStr)}
      />
      <PeriodChips from={fromStr} to={toStr} timeZone={month.timeZone} now={now} selected={searchParams?.periodChip} />
      {costsIncomplete ? <p role="status" className="rounded-xl bg-amber-50 px-3 text-sm text-amber-950">{profitWarning} <Link className="inline-flex min-h-11 items-center font-semibold underline" href={incomeStatementEntriesHref('grossProfit', fromStr, toStr) + '&issues=1'}>Fix costs →</Link></p> : null}

      {!hasData ? (
        <EmptyState
          icon="chart"
          title="No financial activity recorded yet"
          subtitle="Record sales or expenses to see your income statement."
          cta={{ label: 'Open POS', href: '/pos' }}
          secondaryCta={{ label: 'Run Demo Day', href: '/onboarding#demo' }}
          hint="Demo Day generates a week of sample data so you can preview reports."
        />
      ) : (
        <ReportSummaryCard>
          <ReportSummaryRow
            label="Sales"
            value={breakdownLink('revenue', formatMoney(statement.revenue, business.currency))}
          />
          <ReportSummaryRow
            label="Cost of goods sold"
            value={breakdownLink('cogs', costsIncomplete ? 'Costs incomplete' : formatMoney(statement.cogs ?? 0, business.currency))}
          />
          {statement.hasFoodCosts && <>
            <ReportSummaryRow label="Food costs" value={formatMoney(statement.foodCosts, business.currency)} />
            <ReportSummaryRow label="Food waste" value={formatMoney(statement.foodWaste, business.currency)} />
          </>}
          <ReportSummaryRow
            label={percent('Gross profit', gpPct)}
            value={breakdownLink('grossProfit', costsIncomplete ? 'Costs incomplete' : formatMoney(statement.grossProfit ?? 0, business.currency))}
            divider="default"
            emphasis="strong"
          />
          {statement.otherOperatingIncome !== 0 && (
            <ReportSummaryRow
              label={<span className="text-black/70">Other income</span>}
              value={
                <span className="text-emerald-700">
                  {breakdownLink('otherOperatingIncome', formatMoney(statement.otherOperatingIncome, business.currency))}
                </span>
              }
            />
          )}
            <ReportSummaryRow
              label={<span className="text-black/70">Expenses</span>}
              value={<span className="text-rose-600">{breakdownLink('otherExpenses', `(${formatMoney(statement.otherExpenses, business.currency)})`)}</span>}
            />
          <ReportSummaryRow
            label={percent('Profit', npPct)}
            value={breakdownLink('netProfit', costsIncomplete ? 'Costs incomplete' : <span className={(statement.netProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'}>{formatMoney(statement.netProfit ?? 0, business.currency)}</span>)}
            divider="default"
            emphasis="strong"
          />
        </ReportSummaryCard>
      )}
      <p className="text-sm text-ink/60">Tap any amount to see the records behind it.</p>
      <p className="text-sm text-ink/60">Includes credit sales not yet paid, so this is profit, not cash in hand.</p>
      {isFoodBusiness(business.businessCategory) && statement.revenue > 0 &&
        statement.foodCosts === 0 && statement.foodWaste === 0 ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">No food costs are showing for this period; record ingredients used or cooked portions to keep profit accurate.</p> : null}
      {!costsIncomplete && statement.stockValueIncomplete && statement.incompleteStockMessage ? <p className="text-sm text-slate-600">{statement.incompleteStockMessage} This does not change this period&apos;s profit. <Link className="inline-flex min-h-11 items-center font-semibold underline" href="/products?issue=MISSING_COST">Add cost →</Link></p> : null}
      <DownloadLink href={`/api/reports/financials?type=income-statement&from=${fromStr}&to=${toStr}`}
        fallbackFilename={`income-statement-${fromStr}.csv`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">Export CSV</DownloadLink>
    </div>
  );
}
import Link from 'next/link';
import type { ReactNode } from 'react';
