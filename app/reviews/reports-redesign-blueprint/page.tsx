import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isReportsBlueprintAllowed } from '@/lib/reviews/reports-blueprint-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports redesign prototype',
  robots: { index: false, follow: false },
};

export default async function ReportsBlueprintPage() {
  if (!isReportsBlueprintAllowed()) notFound();
  const { default: BlueprintReview } = await import('./BlueprintReview');
  return <BlueprintReview />;
}
