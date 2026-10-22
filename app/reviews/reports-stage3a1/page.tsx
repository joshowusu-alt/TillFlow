import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isReportsStage3aAllowed } from '@/lib/reviews/reports-stage3a-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports presentation review',
  robots: { index: false, follow: false },
};

export default function ReportsStage3a1ReviewPage() {
  if (!isReportsStage3aAllowed()) notFound();
  return <Stage3a1ReviewLoader />;
}

async function Stage3a1ReviewLoader() {
  const { default: Stage3a1Review } = await import('./Stage3a1Review');
  return <Stage3a1Review />;
}
