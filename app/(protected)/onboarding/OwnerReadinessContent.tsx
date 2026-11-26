import { redirect } from 'next/navigation';
import { getReadiness, markOnboardingCompleteAfterFirstSale } from '@/app/actions/onboarding';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import { getOwnerHomeCriticalShell } from '@/lib/owner-home/critical-shell';
import OwnerHomeCompletedStream from '@/components/owner-home/OwnerHomeCompletedStream';
import OnboardingClient from './OnboardingClient';
import HomeCashDifferencesSlot from '@/components/owner-home/HomeCashDifferencesSlot';

async function IncompleteOwnerHome() {
  // Use the already-cached critical shell; await both pieces in this segment.
  // The incomplete checklist intentionally has no nested Suspense boundary.
  const shell = await getOwnerHomeCriticalShell();
  const [readiness, cashDifferences] = await Promise.all([
    measureServerOperation(
      'page.onboarding.owner-readiness',
      () => getReadiness(),
      { route: '/onboarding', role: 'OWNER' },
      { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
    ),
    HomeCashDifferencesSlot({ businessId: shell.businessId, currency: shell.currency }),
  ]);
  return <>{cashDifferences}<OnboardingClient readiness={readiness} /></>;
}

export default async function OwnerReadinessContent({ destination }: { destination?: "home" | "onboarding" } = {}) {
  const shell = await getOwnerHomeCriticalShell();

  if (destination === 'home' && shell.needsFullReadiness) redirect('/onboarding');
  if (destination === 'onboarding' && !shell.needsFullReadiness) redirect('/home');
  if (shell.needsFullReadiness) {
    // Await the checklist in this segment. A nested Suspense fallback under
    // loading.tsx never resolved after a client transition, so /onboarding
    // stayed on "Preparing setup checklist" until a full reload. loading.tsx
    // is the only skeleton; this return replaces it with the checklist.
    return await IncompleteOwnerHome();
  }

  // Phase 1: complete only after a genuine successful sale — never from Start selling alone.
  if (shell.saleCount > 0 && !shell.onboardingCompletedAt) {
    await markOnboardingCompleteAfterFirstSale(shell.businessId);
  }

  return <OwnerHomeCompletedStream shell={shell} />;
}
