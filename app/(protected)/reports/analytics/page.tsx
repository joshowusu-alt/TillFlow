import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { addCalendarDays } from '@/lib/entitlements/range';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import ReportHeader from '@/components/reports/stage3b/ReportHeader';
import { reportScopeLabel } from '@/lib/reports/scope-labels';
import { getBusinessStores } from '@/lib/services/stores';
import ReportSectionSkeleton from '@/components/reports/ReportSectionSkeleton';
import AnalyticsContent from './AnalyticsContent';
import AnalyticsPeriodSelector from './AnalyticsPeriodSelector';
import ClassificationPerformance from './ClassificationPerformance';
import { defaultTenantLocalRange } from '@/lib/reports/reporting-clock';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';

export const dynamic = 'force-dynamic';

const VALID_PERIODS = ['7', '14', '30', '90'] as const;

function resolvePeriodDays(period: string | undefined) {
  return VALID_PERIODS.includes(period as (typeof VALID_PERIODS)[number])
    ? parseInt(period!, 10)
    : 7;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const periodDays = resolvePeriodDays(searchParams?.period);
  const opened = await openLiveReport({
    surfaceId: 'sales_analytics',
    search: searchParams,
    range: ({ timezone, now }) => {
      const today = formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: addCalendarDays(today, -(periodDays - 1)), toLocalDate: today, preset: 'CUSTOM' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;
  if (opened.branch.kind !== 'stores') notFound();
  const { stores } = await getBusinessStores(business.id, undefined);
  const scopeLabel = reportScopeLabel(opened.branch.selected, stores);
  const appliedRange = opened.decision.appliedRange;
  const fallbackPeriod = defaultTenantLocalRange(new Date(), business.timezone, periodDays);
  const classificationRange = resolveReportDateRange(appliedRange ? { from: appliedRange.fromLocalDate, to: appliedRange.toLocalDate } : undefined,
    fallbackPeriod.startInclusive, new Date(), business.timezone);

  return (
    <div className="space-y-4 sm:space-y-5">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      <ReportHeader
        title="Sales analytics"
        scopeLabel={scopeLabel}
        periodLabel={appliedRange ? `${appliedRange.fromLocalDate} to ${appliedRange.toLocalDate} · ${business.timezone}` : `${periodDays} days, including today · ${business.timezone}`}
      />
      <AnalyticsPeriodSelector />
      <Suspense fallback={<ReportSectionSkeleton />}>
        <ClassificationPerformance businessId={business.id} currency={business.currency} storeIds={opened.branch.storeIds}
          start={classificationRange.start} end={classificationRange.end} />
      </Suspense>
      <Suspense fallback={<ReportSectionSkeleton />}>
        <AnalyticsContent
          businessId={business.id}
          currency={business.currency}
          periodDays={periodDays}
          timeZone={business.timezone}
          storeIds={opened.branch.storeIds}
          periodStart={classificationRange.start}
          periodEndExclusive={classificationRange.end}
        />
      </Suspense>
    </div>
  );
}
