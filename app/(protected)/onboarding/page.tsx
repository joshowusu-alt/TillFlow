import { requireUser } from '@/lib/auth';
import { getReadiness } from '@/app/actions/onboarding';
import OnboardingClient from './OnboardingClient';

export default async function OnboardingPage() {
    await requireUser();
    const readiness = await getReadiness();
    return <OnboardingClient readiness={readiness} />;
}
