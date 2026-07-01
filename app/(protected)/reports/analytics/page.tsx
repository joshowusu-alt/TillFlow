import { Suspense } from 'react';
import { requireBusiness } from '@/lib/auth';
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
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return <div className="card p-6">Business not found.</div>;
  }
  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );
  if (!features.advancedReports) {
    return (
      <AdvancedModeNotice
        title="Analytics is available on Growth and Pro"
        description="Trend analysis and deeper trading analytics are unlocked on businesses provisioned for Growth or Pro."
        featureName="Analytics"
        minimumPlan="GROWTH"
      />
    );
  }

  const periodDays = resolvePeriodDays(searchParams?.period);

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
        Profit data uses stored sale-line cost where available; older lines fall back to current base
        cost until backfilled.
      </p>
      <AnalyticsPeriodSelector />
      <Suspense fallback={<ReportSectionSkeleton />}>
        <AnalyticsContent
          businessId={business.id}
          currency={business.currency}
          periodDays={periodDays}
        />
      </Suspense>
    </div>
  );
}
