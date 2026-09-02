import { getOwnerHomeCriticalShell } from '@/lib/owner-home/critical-shell';
import ChecklistReadinessSkeleton from './ChecklistReadinessSkeleton';
import OwnerReadinessSkeleton from './OwnerReadinessSkeleton';

/**
 * Instant Loading for Home (`/onboarding`). Uses the same journey gate as
 * OwnerReadinessContent (`needsFullReadiness`) so a first-sale-complete owner
 * does not flash the setup checklist before `onboardingCompletedAt` is written.
 */
export default async function Loading() {
  const shell = await getOwnerHomeCriticalShell();
  if (shell.needsFullReadiness) {
    return <ChecklistReadinessSkeleton />;
  }
  return <OwnerReadinessSkeleton />;
}
