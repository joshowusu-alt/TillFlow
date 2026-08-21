import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OwnerReadinessContent from './OwnerReadinessContent';
import ChecklistReadinessSkeleton from './ChecklistReadinessSkeleton';

export default async function OnboardingPage() {
  const user = await requireUser();
  // Cashiers and managers go straight to the POS — this page is owner-only
  if (user.role !== 'OWNER') redirect('/pos');

  // Default Instant Loading / Suspense fallback is checklist-shaped (light).
  // Completed-home dark shell lives in OwnerReadinessSkeleton for that layout only.
  return (
    <Suspense fallback={<ChecklistReadinessSkeleton />}>
      <OwnerReadinessContent />
    </Suspense>
  );
}
