/**
 * Test-only Instant Loading harness. Impossible to activate on Vercel Production.
 * Local/CI `next start` must set E2E_LOADING_HARNESS=1 explicitly.
 */
export function isE2eLoadingHarnessEnabled() {
  if (process.env.VERCEL_ENV === 'production') return false;
  const host = (process.env.NEXT_PUBLIC_APP_URL ?? '').toLowerCase();
  if (host.includes('tillflow.app')) return false;
  return process.env.E2E_LOADING_HARNESS === '1';
}
