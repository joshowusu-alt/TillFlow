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
import { getIncomeStatementBreakdown } from '@/lib/reports/financials';
import { INCOME_STATEMENT_METRICS, incomeStatementEntriesHref, incomeStatementExpenseCategories, incomeStatementJournalCategories, type IncomeStatementMetric } from '@/lib/reports/income-statement-breakdown';
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

  // One consistent snapshot for the summary, category amounts and supporting records.
  const statement = await getIncomeStatementBreakdown(business.id, start, end);
  const expenseCategories = incomeStatementExpenseCategories(statement.entries);
  const expensesReconcile = expenseCategories.reduce((sum, category) => sum + category.amountPence, 0) === statement.otherExpenses;
  const incomeCategories = incomeStatementJournalCategories(statement.entries, 'otherOperatingIncome');
  const incomeReconciles = incomeCategories.reduce((sum, category) => sum + category.amountPence, 0) === statement.otherOperatingIncome;
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
    statement.otherExpenses !== 0 || expenseCategories.length > 0 ||
    statement.otherOperatingIncome !== 0 || incomeCategories.length > 0;
  const issueEntries = costsIncomplete ? statement.entries : [];
  const incompleteSales = issueEntries.filter(entry =>
    entry.kind === 'sale' && entry.incompleteLines?.some(line => line.reason !== 'UNSUPPORTED_RETURN')).length;
  const returnIssues = issueEntries.some(entry => entry.kind === 'sale' &&
    entry.profitPence === null && (!entry.incompleteLines?.length || entry.incompleteLines.some(line => line.reason === 'UNSUPPORTED_RETURN')));
  const profitWarning = incompleteSales
    ? `Profit is incomplete: ${incompleteSales} sale${incompleteSales === 1 ? ' has an unconfirmed historical product cost' : 's have unconfirmed historical product costs'}.${returnIssues ? ' Some return records also need review.' : ''}`
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
        showRefresh={false}
      />
      <PeriodChips from={fromStr} to={toStr} timeZone={month.timeZone} now={now} selected={searchParams?.periodChip} />
      {costsIncomplete ? <p role="status" className="rounded-xl bg-amber-50 px-3 text-sm text-amber-950">{profitWarning} <Link className="inline-flex min-h-11 items-center font-semibold underline" href={incomeStatementEntriesHref('grossProfit', fromStr, toStr) + '&issues=1'}>Review affected sales →</Link></p> : null}

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
        <ReportSummaryCard spacingClassName="space-y-1 [&>div]:items-center">
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
          {incomeCategories.length > 0 && incomeReconciles ? (
            <section aria-label="Other income categories" className="border-t border-black/10 pt-2">
              <h2 className="text-sm font-semibold">Other income</h2>
              {incomeCategories.map(category => (
                <div key={category.label} className="flex min-h-11 items-center justify-between gap-2 pl-2 text-sm">
                  <span className="min-w-0 break-words text-ink/70">{category.label}</span>
                  <Link href={incomeStatementEntriesHref('otherOperatingIncome', fromStr, toStr, category.label)}
                    aria-label={`View ${category.label} income records: ${formatMoney(category.amountPence, business.currency)}`}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end rounded underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    {formatMoney(category.amountPence, business.currency)}
                  </Link>
                </div>
              ))}
              {statement.entries.some(entry => entry.kind === 'other-income' && (entry.accountCode === '4100' || entry.source?.nonCash)) ? <p className="text-xs text-ink/60">Stock value adjustments are not cash received or sales.</p> : null}
            </section>
          ) : null}
          {!incomeReconciles ? <p role="status" className="text-sm text-amber-900">Other income details could not be reconciled to the total. Tap the total to review the records.</p> : null}
          {(statement.otherOperatingIncome !== 0 || incomeCategories.length > 0) && (
            <ReportSummaryRow
              label={<span className="text-black/70">{incomeCategories.length > 0 && incomeReconciles ? 'Total other income' : 'Other income'}</span>}
              value={
                <span className="text-emerald-700">
                  {breakdownLink('otherOperatingIncome', formatMoney(statement.otherOperatingIncome, business.currency))}
                </span>
              }
            />
          )}
          {expenseCategories.length > 0 && expensesReconcile ? (
            <section aria-label="Expense categories" className="border-t border-black/10 pt-2">
              <h2 className="text-sm font-semibold">Expenses</h2>
              {expenseCategories.map(category => (
                <div key={category.label} className="flex min-h-11 items-center justify-between gap-2 pl-2 text-sm">
                  <span className="min-w-0 break-words text-ink/70">{category.label}</span>
                  <Link href={incomeStatementEntriesHref('otherExpenses', fromStr, toStr, category.label)}
                    aria-label={`View ${category.label} expense records: ${formatMoney(category.amountPence, business.currency)}`}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end rounded text-rose-600 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
                    {formatMoney(category.amountPence, business.currency)}
                  </Link>
                </div>
              ))}
              {expenseCategories.some(category => category.label.toLowerCase() === 'operating expenses') ? <p className="text-xs text-ink/60">Operating expenses are recorded under a general account. Tap the amount to see the original notes and payees.</p> : null}
            </section>
          ) : null}
          {!expensesReconcile ? <p role="status" className="text-sm text-amber-900">Expense details could not be reconciled to the total. Tap the total to review the records.</p> : null}
          <ReportSummaryRow
            label={<span className="text-black/70">{expenseCategories.length > 0 && expensesReconcile ? 'Total expenses' : 'Expenses'}</span>}
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
