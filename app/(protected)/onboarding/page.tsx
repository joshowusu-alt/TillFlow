import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import OnboardingClient from './OnboardingClient';

export default async function OnboardingPage() {
    const user = await requireUser();

    // Always show the onboarding wizard — it's a helpful reference guide
    return <OnboardingClient />;
}
