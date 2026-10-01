import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isReportsStage3aAllowed } from '@/lib/reviews/reports-stage3a-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports destination context review',
  robots: { index: false, follow: false },
};

export default function ReportsStage3aContextReviewPage() {
  if (!isReportsStage3aAllowed()) notFound();
  return <Stage3aContextReviewLoader />;
}

async function Stage3aContextReviewLoader() {
  const { default: Stage3aContextReview } = await import('./Stage3aContextReview');
  return <Stage3aContextReview />;
}
