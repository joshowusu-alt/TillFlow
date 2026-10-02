import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import DownloadLink from '@/components/DownloadLink';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ReportActionGroup from '@/components/reports/ReportActionGroup';
import DateRangeFilterCard from '@/components/reports/DateRangeFilterCard';
import ReportSummaryCard, { ReportSummaryRow } from '@/components/reports/ReportSummaryCard';
import { ReportReadOnlyBanner, ReportScopeLabel } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { formatMoney } from '@/lib/format';
import { getIncomeStatement } from '@/lib/reports/financials';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';

export default async function IncomeStatementPage({
  searchParams
}: {
  searchParams?: { from?: string; to?: string };
}) {
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
  const costsIncomplete = statement.grossProfit == null || statement.netProfit == null || statement.cogs == null;
  const gpPct = !costsIncomplete && statement.revenue > 0 ? Math.round((statement.grossProfit! / statement.revenue) * 100) : 0;
  const npPct = !costsIncomplete && statement.revenue > 0 ? Math.round((statement.netProfit! / statement.revenue) * 100) : 0;
  const hasData =
    statement.revenue !== 0 ||
    statement.cogs !== 0 ||
    statement.otherExpenses !== 0 ||
    statement.otherOperatingIncome !== 0;

  return (
    <div className="space-y-6">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      {applied?.label === 'Last 30 days' ? <ReportScopeLabel label="Last 30 days" /> : null}
      <ReportsDestinationHead
        title="Income Statement"
        scopeLabel={opened.branch.kind === 'label' ? opened.branch.label : undefined}
        periodLabel={`${fromStr} to ${toStr}`}
        actions={
          <ReportActionGroup>
            <DownloadLink
              href={`/api/reports/financials?type=income-statement&from=${fromStr}&to=${toStr}`}
              fallbackFilename={`income-statement-${fromStr}.csv`}
              className="btn-secondary text-sm"
            >
              Export CSV
            </DownloadLink>
          </ReportActionGroup>
        }
      />

      {/* KPI Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMoney(statement.revenue, business.currency)}
          tone="accent"
        />
        <StatCard
          label="Cost of products sold"
          value={costsIncomplete ? 'Costs incomplete' : formatMoney(statement.cogs ?? 0, business.currency)}
        />
        <StatCard
          label={costsIncomplete ? 'Gross Profit' : `Gross Profit (${gpPct}%)`}
          value={costsIncomplete ? 'Costs incomplete' : formatMoney(statement.grossProfit ?? 0, business.currency)}
          tone={costsIncomplete ? 'warn' : gpPct >= 20 ? 'success' : gpPct >= 0 ? 'warn' : 'danger'}
          helper={costsIncomplete ? `${statement.incompleteLineCount} line${statement.incompleteLineCount === 1 ? '' : 's'} without authoritative cost` : undefined}
        />
        <StatCard
          label={costsIncomplete ? 'Net Profit' : `Net Profit (${npPct}%)`}
          value={costsIncomplete ? 'Costs incomplete' : formatMoney(statement.netProfit ?? 0, business.currency)}
          tone={costsIncomplete ? 'warn' : npPct >= 10 ? 'success' : npPct >= 0 ? 'warn' : 'danger'}
        />
      </div>

      <DateRangeFilterCard from={fromStr} to={toStr} />

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Sales and product costs come from your recorded sales. Expenses come from recorded business costs. Sales figures include credit sales not yet collected — this report shows profit performance, not cash in the bank.
      </div>

      {statement.incompleteStockMessage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Stock value is incomplete</p>
          <p className="mt-1">{statement.incompleteStockMessage}</p>
          {statement.profitMayBeIncomplete ? (
            <p className="mt-1">Profit may also be incomplete until those costs are confirmed.</p>
          ) : null}
        </div>
      ) : null}

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
            label="Revenue"
            value={formatMoney(statement.revenue, business.currency)}
          />
          <ReportSummaryRow
            label="Cost of products sold"
            value={costsIncomplete ? 'Costs incomplete' : formatMoney(statement.cogs ?? 0, business.currency)}
          />
          <ReportSummaryRow
            label="Gross Profit"
            value={costsIncomplete ? 'Costs incomplete' : formatMoney(statement.grossProfit ?? 0, business.currency)}
            divider="default"
            emphasis="strong"
          />
          {statement.otherOperatingIncome !== 0 && (
            <ReportSummaryRow
              label={<span className="text-black/70">Other operating income</span>}
              value={
                <span className="text-emerald-700">
                  {formatMoney(statement.otherOperatingIncome, business.currency)}
                </span>
              }
            />
          )}
          {statement.otherExpenses !== 0 && (
            <ReportSummaryRow
              label={<span className="text-black/70">Operating Expenses</span>}
              value={<span className="text-rose-600">({formatMoney(statement.otherExpenses, business.currency)})</span>}
            />
          )}
          <ReportSummaryRow
            label="Net Profit"
            value={costsIncomplete ? 'Costs incomplete' : <span className={(statement.netProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'}>{formatMoney(statement.netProfit ?? 0, business.currency)}</span>}
            divider="default"
            emphasis="strong"
          />
        </ReportSummaryCard>
      )}
    </div>
  );
}
