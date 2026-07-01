import { Suspense } from 'react';
import { requireBusiness } from '@/lib/auth';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import ReportSectionSkeleton from '@/components/reports/ReportSectionSkeleton';
import { getFeatures } from '@/lib/features';
import { getBusinessStores } from '@/lib/services/stores';
import OwnerDashboardBody from './OwnerDashboardBody';

export const dynamic = 'force-dynamic';

export default async function OwnerIntelligencePage() {
  const { business, user } = await requireBusiness(['OWNER']);
  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );
  if (!features.ownerIntelligence) {
    return (
      <AdvancedModeNotice
        title="Owner Dashboard is available on Pro"
        description="Executive oversight, leakage watch, and cross-business control views are unlocked on businesses provisioned for Pro."
        featureName="Owner Dashboard"
        minimumPlan="PRO"
      />
    );
  }

  const { stores } = await getBusinessStores(business.id);
  const scopeLabel =
    stores.length <= 1
      ? `Branch: ${stores[0]?.name ?? 'Main branch'}`
      : `Scope: All ${stores.length} branches`;

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
