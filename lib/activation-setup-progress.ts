import { unstable_cache } from 'next/cache';
import { computeActivationForBusiness } from '@/lib/activation-snapshot';
import { getSetupBannerCopy } from '@/lib/activation-display';
import type { ActivationReadinessStatus, ActivationStuckReason } from '@/lib/activation-readiness';

export type OwnerSetupBannerState = {
  setupProgressPercent: number;
  activationStatus: ActivationReadinessStatus;
  stuckReason: ActivationStuckReason;
  ownerMessage: string;
  title: string;
  detail: string;
  cta: string;
};

async function buildOwnerSetupBannerState(businessId: string): Promise<OwnerSetupBannerState> {
  const readiness = await computeActivationForBusiness(businessId);
  if (!readiness) {
    return {
      setupProgressPercent: 0,
      activationStatus: 'GETTING_STARTED' as ActivationReadinessStatus,
      stuckReason: null,
      ownerMessage: 'Complete your setup to start selling with confidence.',
      title: 'Start properly',
      detail: 'Begin with your business details and products.',
      cta: 'Begin setup',
    };
  }

  const banner = getSetupBannerCopy({
    setupProgressPercent: readiness.setupProgressPercent,
    activationStatus: readiness.activationStatus,
    stuckReason: readiness.stuckReason,
    ownerMessage: readiness.ownerMessage,
  });

  return {
    setupProgressPercent: readiness.setupProgressPercent,
    activationStatus: readiness.activationStatus,
    stuckReason: readiness.stuckReason,
    ownerMessage: readiness.ownerMessage,
    ...banner,
  };
}

/** Single setup % source: sync engine → DB → banner (invalidated via readiness tag). */
export async function getOwnerSetupBannerState(businessId: string): Promise<OwnerSetupBannerState> {
  return unstable_cache(
    () => buildOwnerSetupBannerState(businessId),
    ['owner-setup-banner', businessId],
    { tags: [`readiness-${businessId}`] }
  )();
}
