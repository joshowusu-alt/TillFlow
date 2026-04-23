import type { NextRequest } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';

/** Paths protected by CRON_SECRET instead of session cookie */
const CRON_SECRET_PATHS = ['/api/cron/', '/api/seed-once'];

export function isCronSecretPath(pathname: string) {
  return CRON_SECRET_PATHS.some((p) => pathname.startsWith(p));
}

export function isValidCronRequest(request: NextRequest) {
  return hasValidCronSecret(request);
}
