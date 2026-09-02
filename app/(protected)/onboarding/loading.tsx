import { requireBusiness } from '@/lib/auth';
import ChecklistReadinessSkeleton from './ChecklistReadinessSkeleton';
import OwnerReadinessSkeleton from './OwnerReadinessSkeleton';

/**
 * Instant Loading for Home (`/onboarding`). Uses the layout-cached business
 * record so established owners see the control-centre skeleton immediately
 * without waiting on readiness KPIs or a second journey query.
 */
export default async function Loading() {
  const { business } = await requireBusiness(['OWNER']);
  if (business.onboardingCompletedAt) {
    return <OwnerReadinessSkeleton />;
  }
  return <ChecklistReadinessSkeleton />;
}
