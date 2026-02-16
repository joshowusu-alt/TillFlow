import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import OnboardingClient from './OnboardingClient';

export default async function OnboardingPage() {
    const user = await requireUser();

    // Check if onboarding already completed for this business
    const business = await prisma.business.findFirst({
        where: { id: user.businessId }
    });

    // If business has been customized (name changed from default), skip onboarding
    if (business?.name !== 'Supermarket Demo') {
        redirect('/pos');
    }

    return <OnboardingClient />;
}
