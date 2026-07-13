import { getReadiness, markOnboardingCompleteAfterFirstSale } from '@/app/actions/onboarding';
import { requireBusiness } from '@/lib/auth';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import OnboardingClient from './OnboardingClient';

export default async function OwnerReadinessContent() {
  const readiness = await measureServerOperation(
    'page.onboarding.owner-readiness',
    () => getReadiness(),
    { route: '/onboarding', role: 'OWNER' },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );

  // Phase 1: complete only after a genuine successful sale — never from Start selling alone.
  if (readiness.saleCount > 0 && !readiness.onboardingCompletedAt) {
    const { business } = await requireBusiness(['OWNER']);
    await markOnboardingCompleteAfterFirstSale(business.id);
  }

  return <OnboardingClient readiness={readiness} />;
}
