import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ReportActionGroup from '@/components/reports/ReportActionGroup';
import DateRangeFilterCard from '@/components/reports/DateRangeFilterCard';
import ReportSummaryCard, { ReportSummaryRow } from '@/components/reports/ReportSummaryCard';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import { getCashflow } from '@/lib/reports/financials';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';

export default async function CashflowPage({
  searchParams
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  if (!features.financialReports) {
    return (
      <AdvancedModeNotice
        title="Cashflow is available on Growth and Pro"
        description="Cashflow reporting is unlocked on businesses provisioned for Growth or Pro."
        featureName="Cashflow"
        minimumPlan="GROWTH"
      />
    );
  }

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { start, end, fromInputValue: fromStr, toInputValue: toStr } = resolveReportDateRange(searchParams, defaultStart, now);

  const cashflow = await getCashflow(business.id, start, end);
  const hasData = cashflow.beginningCash !== 0 || cashflow.netProfit !== 0 || cashflow.endingCash !== 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow"
        subtitle="Indirect cashflow (operations)."
        actions={
          <ReportActionGroup>
            <DownloadLink
              href={`/api/reports/financials?type=cashflow&from=${fromStr}&to=${toStr}`}
              fallbackFilename={`cashflow-${fromStr}.csv`}
              className="btn-secondary text-sm"
            >
              Export CSV
            </DownloadLink>
            <a href="/reports/cashflow-forecast" className="btn-secondary text-sm">Cashflow Forecast</a>
            <a href="/reports/command-center" className="btn-secondary text-sm">Command Center</a>
          </ReportActionGroup>
        }
      />

      {/* KPI Summary */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Beginning Cash"
          value={formatMoney(cashflow.beginningCash, business.currency)}
        />
        <StatCard
          label="Net Cash from Ops"
          value={formatMoney(cashflow.netCashFromOps, business.currency)}
          tone={cashflow.netCashFromOps >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          label="Ending Cash"
          value={formatMoney(cashflow.endingCash, business.currency)}
          tone="accent"
        />
        <StatCard
          label="Net Profit"
          value={formatMoney(cashflow.netProfit, business.currency)}
          tone={cashflow.netProfit >= 0 ? 'success' : 'danger'}
        />
      </div>

      <DateRangeFilterCard from={fromStr} to={toStr} />

      {!hasData ? (
        <EmptyState
          icon="chart"
          title="No cashflow data yet"
          subtitle="Record transactions to see your cashflow statement."
          cta={{ label: 'Open POS', href: '/pos' }}
          secondaryCta={{ label: 'Run Demo Day', href: '/onboarding#demo' }}
          hint="Demo Day generates realistic transactions to preview reports."
        />
      ) : (
        <ReportSummaryCard spacingClassName="space-y-2">
          <ReportSummaryRow
            label="Beginning Cash Balance"
            value={formatMoney(cashflow.beginningCash, business.currency)}
            tone="muted"
          />
          {cashflow.openingCapital > 0 && (
            <ReportSummaryRow
              label="Includes owner&apos;s capital"
              value={formatMoney(cashflow.openingCapital, business.currency)}
              inset
              tone="muted"
            />
          )}
          <ReportSummaryRow
            label="Net Profit"
            value={formatMoney(cashflow.netProfit, business.currency)}
            divider="subtle"
          />
          <ReportSummaryRow
            label="Change in Accounts Receivable"
            value={formatMoney(cashflow.arChange, business.currency)}
          />
          <ReportSummaryRow
            label="Change in Inventory"
            value={formatMoney(cashflow.invChange, business.currency)}
          />
          <ReportSummaryRow
            label="Change in Accounts Payable"
            value={formatMoney(cashflow.apChange, business.currency)}
          />
          <ReportSummaryRow
            label="Net Cash from Operations"
            value={formatMoney(cashflow.netCashFromOps, business.currency)}
            divider="default"
          />
          <ReportSummaryRow
            label="Ending Cash Balance"
            value={formatMoney(cashflow.endingCash, business.currency)}
            divider="default"
            emphasis="strong"
          />
        </ReportSummaryCard>
      )}
    </div>
  );
}
