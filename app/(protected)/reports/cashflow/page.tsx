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
import { businessMonthWindow } from '@/lib/reports/reporting-clock';

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
  const month = businessMonthWindow(now, business.timezone);
  const { start, end, fromInputValue: fromStr, toInputValue: toStr } = resolveReportDateRange(searchParams, month.startInclusive, now, month.timeZone);

  const cashflow = await getCashflow(business.id, start, end);
  const costsIncomplete = cashflow.netProfit == null || cashflow.netCashFromOps == null || cashflow.endingCash == null;
  const hasData = cashflow.beginningCash !== 0 || cashflow.netProfit !== 0 || cashflow.endingCash !== 0 || costsIncomplete;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow"
        subtitle="See how money moved in and out of the business during the selected period."
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
          label="Net change in cash"
          value={costsIncomplete ? 'Costs incomplete' : formatMoney(cashflow.netCashFromOps ?? 0, business.currency)}
          tone={costsIncomplete ? 'default' : (cashflow.netCashFromOps ?? 0) >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          label="Ending Cash"
          value={costsIncomplete ? 'Costs incomplete' : formatMoney(cashflow.endingCash ?? 0, business.currency)}
          tone="accent"
        />
        <StatCard
          label="Net Profit"
          value={costsIncomplete ? 'Costs incomplete' : formatMoney(cashflow.netProfit ?? 0, business.currency)}
          tone={costsIncomplete ? 'default' : (cashflow.netProfit ?? 0) >= 0 ? 'success' : 'danger'}
          helper="Starting point for this cashflow calculation"
        />
      </div>

      <DateRangeFilterCard from={fromStr} to={toStr} />

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Cashflow is not the same as profit. It shows money movement. Credit sales may increase profit before the cash is collected.
      </div>

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
            label="Net profit starting point"
            value={costsIncomplete ? 'Costs incomplete' : formatMoney(cashflow.netProfit ?? 0, business.currency)}
            divider="subtle"
          />
          <ReportSummaryRow
            label="Customer credit not yet collected"
            value={formatMoney(cashflow.arChange, business.currency)}
          />
          <ReportSummaryRow
            label="Cash tied up in stock"
            value={formatMoney(cashflow.invChange, business.currency)}
          />
          <ReportSummaryRow
            label="Supplier bills not yet paid"
            value={formatMoney(cashflow.apChange, business.currency)}
          />
          <ReportSummaryRow
            label="Net cash movement"
            value={costsIncomplete ? 'Costs incomplete' : formatMoney(cashflow.netCashFromOps ?? 0, business.currency)}
            divider="default"
          />
          <ReportSummaryRow
            label="Ending Cash Balance"
            value={costsIncomplete ? 'Costs incomplete' : formatMoney(cashflow.endingCash ?? 0, business.currency)}
            divider="default"
            emphasis="strong"
          />
        </ReportSummaryCard>
      )}
    </div>
  );
}
