import { getReadiness, markOnboardingCompleteAfterFirstSale } from '@/app/actions/onboarding';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import { getOwnerHomeCriticalShell } from '@/lib/owner-home/critical-shell';
import OwnerHomeCompletedStream from '@/components/owner-home/OwnerHomeCompletedStream';
import OnboardingClient from './OnboardingClient';

export default async function OwnerReadinessContent() {
  const shell = await getOwnerHomeCriticalShell();

  if (shell.needsFullReadiness) {
    const readiness = await measureServerOperation(
      'page.onboarding.owner-readiness',
      () => getReadiness(),
      { route: '/onboarding', role: 'OWNER' },
      { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
    );

    return <OnboardingClient readiness={readiness} />;
  }

  // Phase 1: complete only after a genuine successful sale — never from Start selling alone.
  if (shell.saleCount > 0 && !shell.onboardingCompletedAt) {
    await markOnboardingCompleteAfterFirstSale(shell.businessId);
  }

  return <OwnerHomeCompletedStream shell={shell} />;
}
