import { notFound } from 'next/navigation';
import { CONSOLIDATED_LABEL } from '@/lib/entitlements/types';
import DownloadLink from '@/components/DownloadLink';
import EmptyState from '@/components/EmptyState';
import MoneyReceivedReportView, { MONEY_DRILL_OPTIONS } from '@/components/reports/MoneyReceivedReportView';
import ReportsRefresh from '@/components/reports/ReportsRefresh';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { prisma } from '@/lib/prisma';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { defaultTenantLocalRange } from '@/lib/reports/reporting-clock';
import { getBusinessStores } from '@/lib/services/stores';
import {
  computeMoneyReceivedBundle,
  drillDownForMetric,
  resolveMoneyReceivedAccess,
  type MoneyReceivedMetricId,
} from '@/lib/reports/money-received';

export const dynamic = 'force-dynamic';

export default async function MoneyReceivedReportPage(
  props: {
    searchParams?: Promise<{
      from?: string;
      to?: string;
      storeId?: string;
      businessId?: string;
      metric?: string;
      page?: string;
      pageSize?: string;
      periodChip?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const opened = await openLiveReport({
    surfaceId: 'money_received',
    search: searchParams,
  });
  if (!opened.ok) return opened.denial;
  const { business, user } = opened;
  if (opened.branch.kind !== 'stores') notFound();
  if (!business) {
    return (
      <div className="card p-6">
        <EmptyState
          icon="chart"
          title="Setup required"
          subtitle="Complete your business setup to unlock Money Received."
          cta={{ label: 'Complete Setup', href: '/onboarding' }}
        />
      </div>
    );
  }

  const { stores } = await getBusinessStores(business.id, searchParams?.storeId);
  const access = resolveMoneyReceivedAccess({
    actor: { role: user.role, businessId: user.businessId },
    requestedBusinessId: searchParams?.businessId,
    requestedStoreId: opened.branch.selected,
    authorisedStoreIds: stores.map((s) => s.id),
  });
  if (!access.ok) {
    return (
      <div className="card p-6">
        <EmptyState
          icon="chart"
          title="Access denied"
          subtitle={
            access.reason === 'BRANCH_NOT_AUTHORISED'
              ? 'That branch is not available for your business.'
              : access.reason === 'TENANT_MISMATCH'
                ? 'You cannot open another business from this account.'
                : 'You do not have access to Money Received.'
          }
        />
      </div>
    );
  }

  const businessTz = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: { timezone: true },
  });
  const now = new Date();
  const fallback = defaultTenantLocalRange(now, businessTz?.timezone, 7);
  const timeZone = fallback.timeZone;
  const { start: from, end: to, fromInputValue: fromIso, toInputValue: toIso } =
    resolveReportDateRange(searchParams, fallback.startInclusive, now, timeZone);
  const metricParam = (searchParams?.metric ?? 'money_received') as MoneyReceivedMetricId;
  const drillMetricId = MONEY_DRILL_OPTIONS.some(o => o.id === metricParam) ? metricParam : 'money_received';
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams?.pageSize ?? '25', 10) || 25));
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const periodEndExclusive = to;

  const bundle = await computeMoneyReceivedBundle({
    businessId: access.businessId,
    currency: business.currency,
    timeZone,
    periodStart: from,
    periodEndInclusive: periodEndExclusive,
    branchIds: access.branchIds,
    absoluteBounds: true,
  });
  const drill = await drillDownForMetric(prisma, bundle, drillMetricId, page, pageSize);
  const queryFailed = bundle.quality.overall === 'QUERY_FAILED';
  const selectedStoreId = access.selectedStoreId;
  const exportQs = new URLSearchParams({ from: fromIso, to: toIso, storeId: selectedStoreId, metric: drillMetricId });

  return <div className="space-y-4">
    {opened.readOnly ? <ReportReadOnlyBanner /> : null}
    <MoneyReceivedReportView bundle={bundle} drill={drill} metric={drillMetricId}
      from={fromIso} to={toIso} now={now} periodChip={searchParams?.periodChip}
      storeId={selectedStoreId}
      scopeLabel={selectedStoreId === 'ALL' ? CONSOLIDATED_LABEL : stores.find(s => s.id === selectedStoreId)?.name ?? selectedStoreId}
      choices={opened.branch.choices} offerAll={opened.branch.offerAll} pageSize={pageSize}
      actions={<div className="flex flex-wrap items-center gap-2">
        <ReportsRefresh fetchedAt={now.toISOString()} />
        {!opened.readOnly && <DownloadLink href={`/exports/money-received?${exportQs.toString()}`}
          fallbackFilename={`money-received-${fromIso}-${toIso}.csv`}
          className="btn-secondary justify-center text-sm" disabled={queryFailed}>Export CSV</DownloadLink>}
        {queryFailed && !opened.readOnly && <p className="text-xs text-muted">Refresh to load the figures before downloading.</p>}
      </div>} />
  </div>;
}
