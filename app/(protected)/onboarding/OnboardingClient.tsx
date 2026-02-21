'use client';

import ReadinessJourney from '@/components/ReadinessJourney';
import type { ReadinessData } from '@/app/actions/onboarding';

export default function OnboardingClient({ readiness }: { readiness: ReadinessData }) {
    return <ReadinessJourney initial={readiness} />;
}
