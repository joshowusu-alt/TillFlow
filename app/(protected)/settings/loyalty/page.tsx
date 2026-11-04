import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import LoyaltySettingsForm from '@/components/LoyaltySettingsForm';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function LoyaltySettingsPage(
  props: {
    searchParams?: Promise<{ error?: string; saved?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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

  const b = await prisma.business.findUnique({
    where: { id: business.id },
    select: { loyaltyEnabled: true, loyaltyPointsPerGhsPence: true, loyaltyGhsPerHundredPoints: true },
  });
  const loyaltyEnabled: boolean = b?.loyaltyEnabled ?? false;
  const loyaltyPointsPerGhsPence: number = b?.loyaltyPointsPerGhsPence ?? 1;
  const loyaltyGhsPerHundredPoints: number = b?.loyaltyGhsPerHundredPoints ?? 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loyalty Programme"
        subtitle="Reward customers with points for every purchase. Points can be redeemed at checkout."
      />

      <FormError error={searchParams?.error} />

      {searchParams?.saved === '1' && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Loyalty settings saved.</p>}
      <LoyaltySettingsForm key={[loyaltyEnabled, loyaltyPointsPerGhsPence, loyaltyGhsPerHundredPoints].join(':')} enabled={loyaltyEnabled} earnRate={loyaltyPointsPerGhsPence} redemptionPence={loyaltyGhsPerHundredPoints} />
    </div>
  );
}
