import { requireUser } from '@/lib/auth';
import { getReadiness, completeOnboarding } from '@/app/actions/onboarding';
import OnboardingClient from './OnboardingClient';

export default async function OnboardingPage() {
    await requireUser();
    const readiness = await getReadiness();

    // Auto-mark onboarding done when all required steps are complete so the
    // "Complete your setup" banner stops appearing on every admin page.
    if (readiness.onboardingComplete && !readiness.onboardingCompletedAt) {
        await completeOnboarding();
    }

    return <OnboardingClient readiness={readiness} />;
}
