import { prisma } from '@/lib/prisma';

export const MISSING_STORE_CONTEXT_MSG =
  'Select a store before recording this transaction.';

export const INVALID_STORE_CONTEXT_MSG =
  'That store is not available for your business.';

export const STORE_MISMATCH_MSG =
  'The selected store does not match the store on this record.';

/**
 * Resolve a mutation store without substituting the first store among many.
 * A single authorised store is explicit by uniqueness. Multiple stores stay
 * unselected until the user (or URL) names one.
 */
export function resolveSoleOrSelectedStoreId(
  stores: { id: string }[],
  selectedParam?: string | null,
): string | null {
  const requested = selectedParam?.trim() ?? '';
  if (requested) {
    return stores.some((store) => store.id === requested) ? requested : null;
  }
  return stores.length === 1 ? stores[0].id : null;
}

/** Keep an explicit/sole store on shift navigation and refresh. */
export function withStoreQuery(path: string, storeId: string | null | undefined): string {
  const trimmed = storeId?.trim() ?? '';
  if (!trimmed) return path;
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('storeId', trimmed);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function requireExplicitStoreId(storeId: string | null | undefined): string {
  const trimmed = storeId?.trim() ?? '';
  if (!trimmed) {
    throw new Error(MISSING_STORE_CONTEXT_MSG);
  }
  return trimmed;
}

export function assertRequestedStoreMatchesSource(
  requestedStoreId: string | null | undefined,
  sourceStoreId: string,
): string {
  const source = requireExplicitStoreId(sourceStoreId);
  const requested = requestedStoreId?.trim() ?? '';
  if (requested && requested !== source) {
    throw new Error(STORE_MISMATCH_MSG);
  }
  return source;
}

export async function assertSelectedStoreForBusiness(
  businessId: string,
  storeId: string | null | undefined,
  db: { store: { findFirst: (args: any) => Promise<{ id: string } | null> } } = prisma as any,
): Promise<{ id: string }> {
  const selectedStoreId = requireExplicitStoreId(storeId);
  const store = await db.store.findFirst({
    where: { id: selectedStoreId, businessId },
    select: { id: true },
  });
  if (!store) {
    throw new Error(INVALID_STORE_CONTEXT_MSG);
  }
  return store;
}

export async function resolveStoreFromTill(
  businessId: string,
  tillId: string | null | undefined,
  requestedStoreId?: string | null,
  db: { till: { findFirst: (args: any) => Promise<{ id: string; storeId: string } | null> } } = prisma as any,
): Promise<{ tillId: string; storeId: string }> {
  const selectedTillId = tillId?.trim() ?? '';
  if (!selectedTillId) {
    throw new Error('Please select a till first.');
  }
  const till = await db.till.findFirst({
    where: { id: selectedTillId, store: { businessId } },
    select: { id: true, storeId: true },
  });
  if (!till) {
    throw new Error(INVALID_STORE_CONTEXT_MSG);
  }
  if (requestedStoreId?.trim() && requestedStoreId.trim() !== till.storeId) {
    throw new Error(STORE_MISMATCH_MSG);
  }
  return { tillId: till.id, storeId: till.storeId };
}
