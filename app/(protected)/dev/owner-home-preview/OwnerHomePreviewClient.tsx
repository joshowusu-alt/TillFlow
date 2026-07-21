'use client';

import ReadinessJourney from '@/components/ReadinessJourney';
import type { ReadinessData } from '@/app/actions/onboarding';

export default function OwnerHomePreviewClient({ readiness }: { readiness: ReadinessData }) {
  return <ReadinessJourney initial={readiness} />;
}
