import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { openLiveReport } from '@/lib/entitlements/live-report';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import ReportSectionSkeleton from '@/components/reports/ReportSectionSkeleton';
import { getFeatures } from '@/lib/features';
import { getBusinessStores } from '@/lib/services/stores';
import OwnerDashboardBody from './OwnerDashboardBody';

export const dynamic = 'force-dynamic';

export default async function OwnerIntelligencePage({
  searchParams,
}: {
  searchParams?: { storeId?: string; businessId?: string };
}) {
  const opened = await openLiveReport({
    surfaceId: 'owner_brief',
    search: searchParams,
  });
  if (!opened.ok) return opened.denial;
  const { business, user } = opened;
  if (opened.branch.kind !== 'label') notFound();
  const features = getFeatures(business.canonicalPlan, business.storeMode as 'SINGLE_STORE' | 'MULTI_STORE' | null);
  const scopeLabel = opened.branch.label;

  return (
    <div className="space-y-5 pb-2 sm:space-y-6">
      <ReportsDestinationHead title="Owner Brief" scopeLabel={scopeLabel} periodLabel={business.name} showRefresh={false} />

      <Suspense fallback={<ReportSectionSkeleton />}>
        <OwnerDashboardBody
          businessId={business.id}
          businessName={business.name}
          currency={business.currency}
          userId={user.id}
          userName={user.name}
          userEmail={user.email}
          userRole={user.role}
          scopeLabel={scopeLabel}
          advancedReports={features.advancedReports}
        />
      </Suspense>
    </div>
  );
}
