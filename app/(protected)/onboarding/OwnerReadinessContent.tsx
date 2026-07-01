import { getReadiness, completeOnboarding } from '@/app/actions/onboarding';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import OnboardingClient from './OnboardingClient';

export default async function OwnerReadinessContent() {
  const readiness = await measureServerOperation(
    'page.onboarding.owner-readiness',
    () => getReadiness(),
    { route: '/onboarding', role: 'OWNER' },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );

  // Auto-mark onboarding done when all required steps are complete so the
  // "Complete your setup" banner stops appearing on every admin page.
  if (readiness.pct === 100 && !readiness.onboardingCompletedAt) {
    await completeOnboarding();
  }

  return <OnboardingClient readiness={readiness} />;
}
