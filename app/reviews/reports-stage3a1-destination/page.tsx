import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isReportsStage3aAllowed } from '@/lib/reviews/reports-stage3a-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports destination presentation review',
  robots: { index: false, follow: false },
};

export default function ReportsStage3a1DestinationPage() {
  if (!isReportsStage3aAllowed()) notFound();
  return <DestinationReviewLoader />;
}

async function DestinationReviewLoader() {
  const { default: DestinationReview } = await import('./DestinationReview');
  return <DestinationReview />;
}
