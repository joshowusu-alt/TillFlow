import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { addCalendarDays } from '@/lib/entitlements/range';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import PageHeader from '@/components/PageHeader';
import PlanFeatureBadge from '@/components/PlanFeatureBadge';
import RefreshIndicator from '@/components/RefreshIndicator';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import ReportSectionSkeleton from '@/components/reports/ReportSectionSkeleton';
import { getFeatures } from '@/lib/features';
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

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="Reports"
        title="Trend Analytics"
        subtitle="Period-over-period trends, product performance, and peak trading windows."
        actions={
          <>
            <PlanFeatureBadge plan="GROWTH" />
            <RefreshIndicator fetchedAt={new Date().toISOString()} />
          </>
        }
      />
      <p className="text-xs text-black/45">
        Profit uses stored sale-line discounts and cost. Incomplete costs are shown instead of a firm gross profit.
      </p>
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
