import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { updateLoyaltySettingsAction } from '@/app/actions/settings';

export const dynamic = 'force-dynamic';

export default async function LoyaltySettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any
  );

  if (!features.loyaltyPoints) {
    return (
      <AdvancedModeNotice
        title="Loyalty Programme is available on Growth and Pro"
        description="Reward repeat customers with points they can redeem at checkout. Upgrade to Growth to enable."
        featureName="Loyalty Programme"
        minimumPlan="GROWTH"
      />
    );
  }

  const b = business as any;
  const loyaltyEnabled: boolean = b.loyaltyEnabled ?? false;
  const loyaltyPointsPerGhsPence: number = b.loyaltyPointsPerGhsPence ?? 1;
  const loyaltyGhsPerHundredPoints: number = b.loyaltyGhsPerHundredPoints ?? 100;

  // Example: spending GHS 10.00
  const exampleSpend = 10;
  const examplePoints = exampleSpend * loyaltyPointsPerGhsPence;
  const exampleRedemptionPesewas = Math.floor(examplePoints / 100) * loyaltyGhsPerHundredPoints;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loyalty Programme"
        subtitle="Reward customers with points for every purchase. Points can be redeemed at checkout."
      />

      <FormError error={searchParams?.error} />

      <div className="card p-4 sm:p-6">
        <form action={updateLoyaltySettingsAction} className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="font-semibold">Redemption at checkout is coming soon.</div>
            <p className="mt-1 text-amber-700">
              Customers can earn points now. The redemption settings below prepare checkout discounts for when redemption ships.
            </p>
          </div>

          {/* Enable toggle */}
          <div className="sm:col-span-2">
            <div className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-black/40">Loyalty toggle</div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  id="loyaltyEnabled"
                  type="checkbox"
                  name="loyaltyEnabled"
                  defaultChecked={loyaltyEnabled}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="loyaltyEnabled" className="text-sm font-medium">
                  Enable loyalty programme
                </label>
              </div>
              <p className="mt-1 text-xs text-black/50">
                When enabled, points are awarded at checkout and can be redeemed by the cashier.
              </p>
            </div>
          </div>

          {/* Earn rate */}
          <div>
            <label className="label">Points earned per GHS 1.00 spent</label>
            <input
              className="input"
              name="loyaltyPointsPerGhsPence"
              type="number"
              min={1}
              step={1}
              defaultValue={loyaltyPointsPerGhsPence}
            />
            <p className="mt-1 text-xs text-black/50">
              How many points a customer earns for every GHS 1.00 on their invoice.
              e.g. <strong>1</strong> = earn 1 point per GHS 1.00.
            </p>
          </div>

          {/* Redemption rate */}
          <div>
            <label className="label">Pesewas redeemable per 100 points</label>
            <input
              className="input"
              name="loyaltyGhsPerHundredPoints"
              type="number"
              min={1}
              step={1}
              defaultValue={loyaltyGhsPerHundredPoints}
            />
            <p className="mt-1 text-xs text-black/50">
              How much discount in pesewas every 100 points is worth at redemption.
              e.g. <strong>100</strong> = 100 points → GHS 1.00 off.
            </p>
          </div>

          {/* Live example */}
          <div className="sm:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
            <span className="font-semibold text-emerald-800">Example: </span>
            <span className="text-emerald-700">
              Customer spends GHS {exampleSpend.toFixed(2)} → earns{' '}
              <strong>{examplePoints}</strong> points. Redeeming those {examplePoints} points gives{' '}
              <strong>GHS {(exampleRedemptionPesewas / 100).toFixed(2)}</strong> off a future purchase.
            </span>
          </div>

          <div className="sm:col-span-2">
            <SubmitButton className="btn-primary" loadingText="Saving…">Save loyalty settings</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
