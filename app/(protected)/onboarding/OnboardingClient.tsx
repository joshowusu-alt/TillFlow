'use client';

import LaunchSessionCompletion from '@/components/LaunchSessionCompletion';
import ReadinessJourney from '@/components/ReadinessJourney';
import type { ReadinessData } from '@/app/actions/onboarding';

export default function OnboardingClient({ readiness }: { readiness: ReadinessData }) {
    return (
        <>
            <LaunchSessionCompletion />
            <ReadinessJourney initial={readiness} />
        </>
    );
}
