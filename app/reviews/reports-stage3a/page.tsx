import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isReportsStage3aAllowed } from '@/lib/reviews/reports-stage3a-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports experience review',
  robots: { index: false, follow: false },
};

export default function ReportsStage3aReviewPage() {
  if (!isReportsStage3aAllowed()) notFound();
  return <Stage3aReviewLoader />;
}

async function Stage3aReviewLoader() {
  const { default: Stage3aReview } = await import('./Stage3aReview');
  return <Stage3aReview />;
}
