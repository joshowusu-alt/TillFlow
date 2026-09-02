import { getOwnerHomeLoadingKind } from '@/lib/owner-home/home-loading-kind';
import ChecklistReadinessSkeleton from './ChecklistReadinessSkeleton';
import OwnerReadinessSkeleton from './OwnerReadinessSkeleton';

/**
 * Instant Loading for Home. Sync-enough: uses layout-cached requireBusiness
 * plus at most one sale-existence lookup — never the generic parent fallback
 * and never the opposite journey skeleton.
 */
export default async function HomeInstantLoading() {
  const kind = await getOwnerHomeLoadingKind();
  if (kind === 'checklist') {
    return <ChecklistReadinessSkeleton />;
  }
  return <OwnerReadinessSkeleton />;
}
