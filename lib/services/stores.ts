import { prisma } from '@/lib/prisma';

type StoreOption = { id: string; name: string };

export function resolveStoreSelection<T extends { id: string }>(
  stores: T[],
  selectedParam?: string,
  fallback: string | null = null,
): string | null {
  return selectedParam && stores.some((store) => store.id === selectedParam) ? selectedParam : fallback;
}

/**
 * Fetches all stores for a business and resolves the active store selection.
 *
 * @param businessId   - The business to query stores for.
 * @param selectedParam - The storeId query-param value from the URL (may be undefined).
 * @returns `stores` array plus `selectedStoreId` — `null` when no valid store is
 *   selected (i.e. "show all"). Callers that need a concrete fallback (e.g. first
 *   store) should handle the null case themselves.
 */
export async function getBusinessStores(
  businessId: string,
  selectedParam?: string,
): Promise<{ stores: { id: string; name: string }[]; selectedStoreId: string | null }> {
  const stores: StoreOption[] = await prisma.store.findMany({
    where: { businessId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const selectedStoreId = resolveStoreSelection(stores, selectedParam, null);
  return { stores, selectedStoreId };
}
