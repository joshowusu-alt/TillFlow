/**
 * Dev/test-only deferred Home loader failure injection.
 * Disabled in production unless HOME_FORCE_FAIL_ALLOW_PROD=1 (ops break-glass only).
 * Ordinary production users cannot enable this via HOME_FORCE_FAIL alone.
 */
export type HomeForceFailSection = 'performance' | 'attention' | 'iyr' | 'extras';

export function getHomeForceFailSections(): Set<HomeForceFailSection> {
  if (process.env.NODE_ENV === 'production' && process.env.HOME_FORCE_FAIL_ALLOW_PROD !== '1') {
    return new Set();
  }
  const raw = process.env.HOME_FORCE_FAIL?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean) as HomeForceFailSection[],
  );
}

export function assertHomeLoaderAllowed(section: HomeForceFailSection) {
  if (getHomeForceFailSections().has(section)) {
    throw new Error(`HOME_FORCE_FAIL:${section}`);
  }
}
