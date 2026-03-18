import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ReportActionGroup from '@/components/reports/ReportActionGroup';
import DateRangeFilterCard from '@/components/reports/DateRangeFilterCard';
import ReportSummaryCard, { ReportSummaryRow } from '@/components/reports/ReportSummaryCard';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { getIncomeStatement } from '@/lib/reports/financials';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';

export default async function IncomeStatementPage({
  searchParams
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { start, end, fromInputValue: fromStr, toInputValue: toStr } = resolveReportDateRange(searchParams, defaultStart, now);

  const statement = await getIncomeStatement(business.id, start, end);
  const gpPct = statement.revenue > 0 ? Math.round((statement.grossProfit / statement.revenue) * 100) : 0;
  const npPct = statement.revenue > 0 ? Math.round((statement.netProfit / statement.revenue) * 100) : 0;
  const hasData = statement.revenue !== 0 || statement.cogs !== 0 || statement.otherExpenses !== 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income Statement"
        subtitle="Revenue, COGS, expenses, and profit for the selected period."
        actions={
          <ReportActionGroup>
            <DownloadLink
              href={`/api/reports/financials?type=income-statement&from=${fromStr}&to=${toStr}`}
              fallbackFilename={`income-statement-${fromStr}.csv`}
              className="btn-secondary text-sm"
            >
              Export CSV
            </DownloadLink>
            <a href="/reports/command-center" className="btn-secondary text-sm">Command Center</a>
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
          label="COGS"
          value={formatMoney(statement.cogs, business.currency)}
        />
        <StatCard
          label={`Gross Profit (${gpPct}%)`}
          value={formatMoney(statement.grossProfit, business.currency)}
          tone={gpPct >= 20 ? 'success' : gpPct >= 0 ? 'warn' : 'danger'}
        />
        <StatCard
          label={`Net Profit (${npPct}%)`}
          value={formatMoney(statement.netProfit, business.currency)}
          tone={npPct >= 10 ? 'success' : npPct >= 0 ? 'warn' : 'danger'}
        />
      </div>

      <DateRangeFilterCard from={fromStr} to={toStr} />

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Revenue and COGS are derived from sale transactions. Operating expenses are from accounting journals. The Balance Sheet remains fully journal-based.
      </div>

      {!hasData ? (
        <EmptyState
          icon="chart"
          title="No journal entries yet"
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
            label="Cost of Goods Sold"
            value={formatMoney(statement.cogs, business.currency)}
          />
          <ReportSummaryRow
            label="Gross Profit"
            value={formatMoney(statement.grossProfit, business.currency)}
            divider="default"
            emphasis="strong"
          />
          {statement.otherExpenses !== 0 && (
            <ReportSummaryRow
              label={<span className="text-black/70">Operating Expenses</span>}
              value={<span className="text-rose-600">({formatMoney(statement.otherExpenses, business.currency)})</span>}
            />
          )}
          <ReportSummaryRow
            label="Net Profit"
            value={<span className={statement.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}>{formatMoney(statement.netProfit, business.currency)}</span>}
            divider="default"
            emphasis="strong"
          />
        </ReportSummaryCard>
      )}
    </div>
  );
}
