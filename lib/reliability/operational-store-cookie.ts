import { cookies } from 'next/headers';
import { OPERATIONAL_STORE_COOKIE } from '@/lib/reliability/operational-store';

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
