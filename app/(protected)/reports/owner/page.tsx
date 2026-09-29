import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ReportScopeLabel } from '@/components/reports/ReportSurfaceDenial';
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
      <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Owner Brief</p>
        <p className="mt-1 text-sm font-semibold text-ink">{business.name}</p>
        <p className="mt-0.5 text-xs text-muted">{scopeLabel}</p>
      </div>

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
