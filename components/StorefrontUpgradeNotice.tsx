import Link from 'next/link';
import type { BusinessPlan } from '@/lib/features';

/**
 * Blocked-state notice shown to merchants who cannot access Online Storefront
 * features yet. The copy and CTA are plan-aware:
 *  - Growth (no add-on): upsell the +GHS 200/month storefront add-on.
 *  - Starter (and any other non-entitled plan): explain it needs Growth add-on
 *    or Pro.
 * Pro and Growth + add-on are entitled and never see this notice.
 */
export default function StorefrontUpgradeNotice({
  plan,
  featureName = 'Online Storefront',
}: {
  plan: BusinessPlan;
  featureName?: string;
}) {
  if (plan === 'GROWTH') {
    return (
      <div className="card p-6 space-y-3">
        <div className="text-lg font-display font-semibold">Add Online Storefront to your Growth plan</div>
        <p className="text-sm text-black/60">Let customers browse products and place pickup orders online.</p>
        <p className="text-sm font-semibold text-ink">Add it for GHS 200/month.</p>
        <Link
          href={`/settings/billing?feature=${encodeURIComponent(featureName)}`}
          className="btn-primary w-fit"
        >
          Contact support to activate
        </Link>
      </div>
    );
  }

  // Starter (and any other non-Growth, non-Pro fallback).
  return (
    <div className="card p-6 space-y-3">
      <div className="text-lg font-display font-semibold">{featureName} is not available on your plan</div>
      <p className="text-sm text-black/60">
        Online Storefront is available on Growth add-on or included in Pro.
      </p>
      <Link href="/settings/billing" className="btn-primary w-fit">
        Open billing and plans
      </Link>
    </div>
  );
}
