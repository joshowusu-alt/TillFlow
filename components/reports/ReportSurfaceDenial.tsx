import Link from 'next/link';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import type { PageAccessResult } from '@/lib/entitlements/adapters';
import type { BusinessPlan } from '@/lib/features';

const RESTRICTED_BANNER =
  'Your account is restricted — reports are read-only until billing is resolved';

export function ReportReadOnlyBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p>{RESTRICTED_BANNER}</p>
      <Link href="/settings/billing" className="mt-1 inline-flex font-semibold underline underline-offset-2">
        View billing
      </Link>
    </div>
  );
}

export function ReportScopeLabel({ label }: { label: string }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{label}</p>
  );
}

/**
 * Contract B.6 page notices. Prices are not shown.
 * Redirects and notFound are handled before this renders.
 */
export default function ReportSurfaceDenial({
  access,
  minimumPlan,
  featureName,
}: {
  access: Extract<PageAccessResult, { outcome: 'notice' }>;
  minimumPlan?: BusinessPlan;
  featureName?: string;
}) {
  if (access.notice === 'plan' || access.notice === 'pos-lock') {
    return (
      <AdvancedModeNotice
        title={featureName ? `${featureName} is not on this plan` : 'This report is not on this plan'}
        description="This report is available on a higher plan. Open billing and plans to review the current plan."
        featureName={featureName}
        minimumPlan={minimumPlan}
      />
    );
  }

  if (access.notice === 'addon') {
    return (
      <AdvancedModeNotice
        title="Online storefront add-on required"
        description="Storefront Analytics is available on Pro, or on Growth with the online storefront add-on."
        featureName={featureName ?? 'Storefront Analytics'}
        minimumPlan={minimumPlan ?? 'GROWTH'}
      />
    );
  }

  if (access.notice === 'consolidated') {
    return (
      <AdvancedModeNotice
        title="All branches requires Pro"
        description="Starter and Growth reports use one branch. Consolidated reporting is available on Pro."
        featureName={featureName}
        minimumPlan="PRO"
      />
    );
  }

  if (access.notice === 'range') {
    const href = access.clampHref ?? '/settings/billing';
    return (
      <div className="card space-y-3 p-6">
        <div className="text-lg font-display font-semibold">That date range is outside this plan</div>
        <p className="text-sm text-black/60">
          Your plan includes the last 30 days on Starter, or the last 13 months on Growth. Choose a start date inside
          that window, or review plans.
        </p>
        <div className="flex flex-wrap gap-3">
          {access.clampHref ? (
            <Link href={access.clampHref} className="btn-primary w-fit">
              Show the earliest included date
            </Link>
          ) : null}
          <Link href="/settings/billing" className="btn-secondary w-fit">
            Review plans
          </Link>
          {!access.clampHref ? (
            <Link href={href} className="btn-secondary w-fit">
              Back
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  if (access.notice === 'branch') {
    return (
      <div className="card space-y-3 p-6">
        <div className="text-lg font-display font-semibold">Switch to this branch to report on it</div>
        <p className="text-sm text-black/60">
          This plan reports on the branch selected in the header. Choose that branch, then open the report again.
        </p>
      </div>
    );
  }

  if (access.notice === 'select-branch') {
    return (
      <div className="card space-y-3 p-6">
        <div className="text-lg font-display font-semibold">Select a branch</div>
        <p className="text-sm text-black/60">
          Choose one branch in the header before this report can load. No figures are shown until a branch is selected.
        </p>
      </div>
    );
  }

  if (access.notice === 'billing-restricted') {
    return <ReportReadOnlyBanner />;
  }

  return (
    <div className="card space-y-3 p-6">
      <div className="text-lg font-display font-semibold">This report is unavailable</div>
      <p className="text-sm text-black/60">The request was denied before any report figures were loaded.</p>
    </div>
  );
}
