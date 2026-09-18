import { cookies } from 'next/headers';
import {
  OPERATIONAL_STORE_COOKIE,
  STALE_OPERATIONAL_STORE_MSG,
} from '@/lib/reliability/operational-store';

export function assertSubmittedStoreMatchesOperationalCookie(submittedStoreId: string) {
  const cookie = readOperationalStoreCookie();
  if (cookie && cookie !== submittedStoreId) {
    throw new Error(STALE_OPERATIONAL_STORE_MSG);
  }
  return submittedStoreId;
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
