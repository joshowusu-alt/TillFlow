/**
 * Fail-closed Vercel Preview automation-bypass headers for Playwright.
 *
 * Headers are injected only when VERCEL_AUTOMATION_BYPASS_SECRET is set and
 * PLAYWRIGHT_BASE_URL is positively a Vercel Preview host (*.vercel.app).
 * Production, localhost (unless PLAYWRIGHT_ALLOW_LOCAL_BYPASS=true), and any
 * other hostname throw. Error text never includes the secret value.
 */

export const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';
export const VERCEL_SET_BYPASS_COOKIE_HEADER = 'x-vercel-set-bypass-cookie';
export const VERCEL_AUTOMATION_BYPASS_SECRET_ENV = 'VERCEL_AUTOMATION_BYPASS_SECRET';
export const PLAYWRIGHT_ALLOW_LOCAL_BYPASS_ENV = 'PLAYWRIGHT_ALLOW_LOCAL_BYPASS';

export class VercelPreviewBypassBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VercelPreviewBypassBlockedError';
  }
}

export type VercelPreviewBypassEnv = {
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
  PLAYWRIGHT_ALLOW_LOCAL_BYPASS?: string;
};

export type ResolvedVercelPreviewBypass = {
  extraHTTPHeaders?: Record<string, string>;
  /** When true, Playwright must not retain traces, screenshots, or JSON reports. */
  disableCapturingArtifacts: boolean;
};

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isProductionPlaywrightHost(url: string) {
  const host = hostnameOf(url);
  return host === 'tillflow.app' || host === 'www.tillflow.app';
}

export function isLocalPlaywrightHost(url: string) {
  const host = hostnameOf(url);
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** Git/unique Vercel deployment hosts only — never tillflow.app or localhost. */
export function isVercelPreviewPlaywrightTarget(url: string) {
  if (isProductionPlaywrightHost(url)) return false;
  if (isLocalPlaywrightHost(url)) return false;
  const host = hostnameOf(url);
  return Boolean(host) && host.endsWith('.vercel.app');
}

function secretFromEnv(env: VercelPreviewBypassEnv) {
  return env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? '';
}

export function resolveVercelPreviewBypass(input: {
  baseURL: string;
  env: VercelPreviewBypassEnv;
}): ResolvedVercelPreviewBypass {
  const secret = secretFromEnv(input.env);
  const hasSecret = secret.length > 0;
  const allowLocal = input.env.PLAYWRIGHT_ALLOW_LOCAL_BYPASS === 'true';
  const production = isProductionPlaywrightHost(input.baseURL);
  const local = isLocalPlaywrightHost(input.baseURL);
  const vercelPreview = isVercelPreviewPlaywrightTarget(input.baseURL);

  if (hasSecret && production) {
    throw new VercelPreviewBypassBlockedError(
      'Blocked: Vercel automation bypass cannot be used against Production (tillflow.app / www.tillflow.app).',
    );
  }

  if (hasSecret && local && !allowLocal) {
    throw new VercelPreviewBypassBlockedError(
      'Blocked: Vercel automation bypass cannot be used against localhost unless PLAYWRIGHT_ALLOW_LOCAL_BYPASS=true.',
    );
  }

  if (hasSecret && !vercelPreview && !(local && allowLocal)) {
    throw new VercelPreviewBypassBlockedError(
      'Blocked: Vercel automation bypass is only allowed against a Vercel Preview host.',
    );
  }

  if (vercelPreview && !hasSecret) {
    throw new VercelPreviewBypassBlockedError(
      'Blocked: protected Vercel Preview requires VERCEL_AUTOMATION_BYPASS_SECRET.',
    );
  }

  if (vercelPreview && hasSecret) {
    return {
      extraHTTPHeaders: {
        [VERCEL_PROTECTION_BYPASS_HEADER]: secret,
        [VERCEL_SET_BYPASS_COOKIE_HEADER]: 'true',
      },
      disableCapturingArtifacts: true,
    };
  }

  return { disableCapturingArtifacts: false };
}
