/**
 * Preview evidence fetches that must never go through Playwright APIRequestContext.
 * APIRequestContext call logs print extraHTTPHeaders, cookies, and session tokens.
 */
import type { Page } from '@playwright/test';
import { getBaseUrl, isProductionPlaywrightTarget } from './env';
import { resolveVercelPreviewBypass } from './vercel-preview-bypass';

/** Measured Preview reliability-snapshot: 7733–8273ms. Bound above that, never above 60s. */
export const RELIABILITY_SNAPSHOT_TIMEOUT_MS = 30_000;
export const RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS = 60_000;
/** deploy-sha measured ~991ms. Keep it in the navigation class, not the 8s action class. */
export const RELIABILITY_IDENTITY_TIMEOUT_MS = 15_000;

const SENSITIVE_HEADER_NAMES = [
  'x-vercel-protection-bypass',
  'x-vercel-set-bypass-cookie',
  'cookie',
  'set-cookie',
  'authorization',
] as const;

export type RedactedFetchResult<T> = {
  status: number;
  json: T;
  durationMs: number;
};

function blocked(detail: string): never {
  throw new Error(`Till 3 accounting gate blocked: ${detail}`);
}

function secretCandidates(explicit?: { email?: string; password?: string; bypass?: string }) {
  return [
    { label: 'bypass', value: explicit?.bypass ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET },
    { label: 'password', value: explicit?.password ?? process.env.PLAYWRIGHT_OWNER_PASSWORD },
    { label: 'email', value: explicit?.email ?? process.env.PLAYWRIGHT_OWNER_EMAIL },
  ];
}

export function redactSensitivePlaywrightNoise(
  text: string,
  explicit?: { email?: string; password?: string; bypass?: string },
) {
  let safe = text;
  for (const { label, value } of secretCandidates(explicit)) {
    const secret = value?.trim() ?? '';
    if (secret.length < 4) continue;
    safe = safe.split(secret).join(`[redacted-${label}]`);
  }
  for (const header of SENSITIVE_HEADER_NAMES) {
    safe = safe.replace(new RegExp(`${header}\\s*:\\s*[^\\n]+`, 'gi'), `${header}: [redacted]`);
  }
  safe = safe.replace(/pos_session_[^=\s;]*=\S+/gi, 'pos_session_[redacted]');
  safe = safe.replace(/(?:session|auth|token)=[^\s;&]+/gi, '[redacted-token]');
  return safe;
}

export function assertNoSensitivePlaywrightNoise(
  text: string,
  explicit?: { email?: string; password?: string; bypass?: string },
) {
  const lower = text.toLowerCase();
  for (const { label, value } of secretCandidates(explicit)) {
    const secret = value?.trim() ?? '';
    if (secret.length >= 4 && text.includes(secret)) {
      blocked(`error output leaked ${label}.`);
    }
  }
  if (/x-vercel-protection-bypass\s*:\s*(?!\[redacted\])\S+/i.test(text)) {
    blocked('error output leaked a bypass header value.');
  }
  if (/\bcookie\s*:\s*(?!\[redacted\])\S+/i.test(text)) {
    blocked('error output leaked a cookie header.');
  }
  if (/pos_session_[^=\s;]+=\S+/i.test(text)) {
    blocked('error output leaked a session token.');
  }
  if (lower.includes('set-cookie:') && !lower.includes('set-cookie: [redacted]')) {
    blocked('error output leaked a set-cookie header.');
  }
  return text;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return 'AbortError';
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return error.name;
    return error.name || 'Error';
  }
  return 'fetch_failed';
}

function throwRedacted(detail: string, error?: unknown): never {
  const raw = error ? `${detail} (${safeErrorMessage(error)})` : detail;
  blocked(assertNoSensitivePlaywrightNoise(redactSensitivePlaywrightNoise(raw)));
}

export async function fetchPreviewJsonRedacted<T>(
  path: string,
  timeoutMs: number,
): Promise<RedactedFetchResult<T>> {
  if (!path.startsWith('/')) blocked(`refusing non-absolute evidence path.`);
  if (timeoutMs > RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS) {
    blocked(`evidence fetch timeout ${timeoutMs}ms exceeds ${RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS}ms.`);
  }
  const baseURL = getBaseUrl();
  if (isProductionPlaywrightTarget(baseURL)) {
    blocked('evidence fetch cannot run against Production.');
  }
  const bypass = resolveVercelPreviewBypass({ baseURL, env: process.env });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(new URL(path, baseURL), {
      method: 'GET',
      headers: bypass.extraHTTPHeaders,
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    const text = await res.text();
    if (!res.ok) blocked(`${path} HTTP ${res.status} after ${durationMs}ms`);
    try {
      return { status: res.status, json: JSON.parse(text) as T, durationMs };
    } catch {
      blocked(`${path} returned non-JSON after ${durationMs}ms`);
    }
  } catch (error) {
    const durationMs = Date.now() - started;
    if (safeErrorMessage(error) === 'AbortError') {
      throwRedacted(`${path} timed out after ${timeoutMs}ms (waited ${durationMs}ms)`);
    }
    throwRedacted(`${path} failed after ${durationMs}ms`, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPageJsonRedacted<T>(
  page: Page,
  path: string,
  timeoutMs: number,
): Promise<RedactedFetchResult<T>> {
  if (!path.startsWith('/')) blocked(`refusing non-absolute evidence path.`);
  if (timeoutMs > RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS) {
    blocked(`evidence fetch timeout ${timeoutMs}ms exceeds ${RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS}ms.`);
  }

  type BrowserFetchResult = {
    status: number;
    durationMs: number;
    body: string;
    errorName?: string;
  };

  let result: BrowserFetchResult;
  try {
    result = await page.evaluate(
      async ({ path: requestPath, timeoutMs: boundMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), boundMs);
        const started = Date.now();
        try {
          const res = await fetch(requestPath, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          });
          const body = await res.text();
          return { status: res.status, durationMs: Date.now() - started, body };
        } catch (error) {
          const errorName =
            error instanceof DOMException
              ? error.name
              : error instanceof Error
                ? error.name
                : 'FetchError';
          return { status: 0, durationMs: Date.now() - started, body: '', errorName };
        } finally {
          clearTimeout(timer);
        }
      },
      { path, timeoutMs },
    );
  } catch (error) {
    throwRedacted(`${path} browser fetch failed`, error);
  }

  const redactedError = result.errorName
    ? assertNoSensitivePlaywrightNoise(redactSensitivePlaywrightNoise(result.errorName))
    : undefined;
  if (result.errorName === 'AbortError') {
    blocked(`${path} timed out after ${timeoutMs}ms (waited ${result.durationMs}ms)`);
  }
  if (result.errorName) {
    blocked(`${path} failed after ${result.durationMs}ms (${redactedError})`);
  }
  if (result.status < 200 || result.status >= 300) {
    blocked(`${path} HTTP ${result.status} after ${result.durationMs}ms`);
  }
  try {
    return {
      status: result.status,
      json: JSON.parse(result.body) as T,
      durationMs: result.durationMs,
    };
  } catch {
    blocked(`${path} returned non-JSON after ${result.durationMs}ms`);
  }
}
