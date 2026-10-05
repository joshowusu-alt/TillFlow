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
        <AnalyticsContent
          businessId={business.id}
          currency={business.currency}
          periodDays={periodDays}
          timeZone={business.timezone}
          storeIds={opened.branch.storeIds}
        />
      </Suspense>
    </div>
  );
}
