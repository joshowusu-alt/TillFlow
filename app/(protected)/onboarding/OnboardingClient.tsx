'use client';

import LaunchSessionCompletion from '@/components/LaunchSessionCompletion';
import ReadinessJourney from '@/components/ReadinessJourney';
import type { ReadinessData } from '@/app/actions/onboarding';
import { useEffect } from 'react';
import { markTillflowPerformance } from '@/lib/performance/client-performance-marks';

export default function OnboardingClient({ readiness }: { readiness: ReadinessData }) {
    useEffect(() => {
        markTillflowPerformance('tillflow.launch.protected-content.mounted');
    }, []);

    return (
        <>
            <LaunchSessionCompletion />
            <ReadinessJourney initial={readiness} />
        </>
    );
}
