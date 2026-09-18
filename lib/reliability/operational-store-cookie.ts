import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import {
  ALL_BRANCHES_NOT_OPERATIONAL_MSG,
  FOREIGN_OPERATIONAL_STORE_MSG,
  MISSING_OPERATIONAL_STORE_MSG,
  OPERATIONAL_STORE_COOKIE,
  STALE_OPERATIONAL_STORE_MSG,
} from '@/lib/reliability/operational-store';

export const MISSING_OPERATIONAL_COOKIE_MSG = MISSING_OPERATIONAL_STORE_MSG;

/**
 * Authoritative mutation guard.
 * Multi-store: cookie must be present and equal the submitted store.
 * Sole-store: cookie may be omitted only after proving exactly one authorised store.
 * Never accepts ALL. Never infers the first of many.
 */
export function assertAuthoritativeOperationalStore(
  submittedStoreId: string,
  options?: { authorisedStoreCount?: number },
): string {
  const submitted = submittedStoreId?.trim() ?? '';
  if (!submitted) {
    throw new Error(MISSING_OPERATIONAL_STORE_MSG);
  }
  if (submitted === 'ALL') {
    throw new Error(ALL_BRANCHES_NOT_OPERATIONAL_MSG);
  }

  const cookie = readOperationalStoreCookie();
  const sole = options?.authorisedStoreCount === 1;
  if (!cookie) {
    if (sole) return submitted;
    throw new Error(MISSING_OPERATIONAL_COOKIE_MSG);
  }
  if (cookie !== submitted) {
    throw new Error(STALE_OPERATIONAL_STORE_MSG);
  }
  return submitted;
}

export function assertSubmittedStoreMatchesOperationalCookie(submittedStoreId: string) {
  return assertAuthoritativeOperationalStore(submittedStoreId);
}

export async function assertAuthoritativeMutationStore(
  businessId: string,
  submittedStoreId: string,
): Promise<string> {
  const submitted = submittedStoreId?.trim() ?? '';
  if (!submitted) throw new Error(MISSING_OPERATIONAL_STORE_MSG);
  if (submitted === 'ALL') throw new Error(ALL_BRANCHES_NOT_OPERATIONAL_MSG);

  const [submittedStore, authorisedStoreCount] = await Promise.all([
    prisma.store.findFirst({
      where: { id: submitted, businessId },
      select: { id: true },
    }),
    prisma.store.count({ where: { businessId } }),
  ]);
  if (!submittedStore) {
    throw new Error(FOREIGN_OPERATIONAL_STORE_MSG);
  }

  const cookie = readOperationalStoreCookie();
  if (cookie) {
    const cookieStore = await prisma.store.findFirst({
      where: { id: cookie, businessId },
      select: { id: true },
    });
    if (!cookieStore) {
      throw new Error(FOREIGN_OPERATIONAL_STORE_MSG);
    }
  }

  return assertAuthoritativeOperationalStore(submittedStore.id, { authorisedStoreCount });
}

export function readOperationalStoreCookie(): string | null {
  try {
    return cookies().get(OPERATIONAL_STORE_COOKIE)?.value?.trim() || null;
  } catch {
    return null;
  }
}

export function operationalStoreCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 90,
  };
}
