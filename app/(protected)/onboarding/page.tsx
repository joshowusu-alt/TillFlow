import { requireUser } from '@/lib/auth';
import { getReadiness, completeOnboarding } from '@/app/actions/onboarding';
import OnboardingClient from './OnboardingClient';
import { redirect } from 'next/navigation';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

export default async function OnboardingPage() {
    const user = await requireUser();
    // Cashiers and managers go straight to the POS — this page is owner-only
    if (user.role !== 'OWNER') redirect('/pos');
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
