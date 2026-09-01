import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RELIABILITY_IDENTITY_TIMEOUT_MS,
  RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS,
  RELIABILITY_SNAPSHOT_TIMEOUT_MS,
  assertNoSensitivePlaywrightNoise,
  redactSensitivePlaywrightNoise,
} from './preview-qa-redacted-fetch';
import { RELIABILITY_ACTION_TIMEOUT_MS } from './preview-qa-locators';

const root = join(__dirname, '..', '..', '..');
const source = (rel: string) => readFileSync(join(root, rel), 'utf8');

const BYPASS = 'unit-test-bypass-placeholder';
const PASSWORD = 'unit-test-owner-password';
const EMAIL = 'owner@example.test';
const SESSION = 'pos_session_abc=secret-session-token-value';
const COOKIE_HEADER = `cookie: ${SESSION}; theme=light`;

function playwrightApiRequestLeak() {
  return [
    'apiRequestContext.get: Timeout 8000ms exceeded.',
    '=========================== logs ===========================',
    '→ GET https://example.vercel.app/api/qa/reliability-snapshot',
    `  x-vercel-protection-bypass: ${BYPASS}`,
    '  x-vercel-set-bypass-cookie: true',
    `  ${COOKIE_HEADER}`,
    `  password: ${PASSWORD}`,
    `  email: ${EMAIL}`,
  ].join('\n');
}

describe('redacted Preview evidence fetch', () => {
  it('keeps a snapshot timeout above the measured 8s action class and at or below 60s', () => {
    expect(RELIABILITY_SNAPSHOT_TIMEOUT_MS).toBeGreaterThan(RELIABILITY_ACTION_TIMEOUT_MS);
    expect(RELIABILITY_SNAPSHOT_TIMEOUT_MS).toBeGreaterThan(8_273);
    expect(RELIABILITY_SNAPSHOT_TIMEOUT_MS).toBeLessThanOrEqual(RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS);
    expect(RELIABILITY_SNAPSHOT_TIMEOUT_MAX_MS).toBe(60_000);
    expect(RELIABILITY_IDENTITY_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(RELIABILITY_ACTION_TIMEOUT_MS).toBe(8_000);
  });

  it('strips bypass secrets, passwords, cookies, and session tokens from timeout output', () => {
    const leaked = playwrightApiRequestLeak();
    const redacted = redactSensitivePlaywrightNoise(leaked, {
      bypass: BYPASS,
      password: PASSWORD,
      email: EMAIL,
    });
    expect(redacted).not.toContain(BYPASS);
    expect(redacted).not.toContain(PASSWORD);
    expect(redacted).not.toContain(EMAIL);
    expect(redacted).not.toContain('secret-session-token-value');
    expect(redacted).not.toMatch(/pos_session_abc=/);
    expect(redacted).toContain('x-vercel-protection-bypass: [redacted]');
    expect(redacted).toContain('cookie: [redacted]');
    expect(() =>
      assertNoSensitivePlaywrightNoise(redacted, {
        bypass: BYPASS,
        password: PASSWORD,
        email: EMAIL,
      }),
    ).not.toThrow();
  });

  it('fails closed when timeout or error text still contains secrets', () => {
    const leaked = playwrightApiRequestLeak();
    expect(() =>
      assertNoSensitivePlaywrightNoise(leaked, {
        bypass: BYPASS,
        password: PASSWORD,
        email: EMAIL,
      }),
    ).toThrow(/leaked/);
    expect(() =>
      assertNoSensitivePlaywrightNoise(`cookie: ${SESSION}`, { bypass: BYPASS }),
    ).toThrow(/cookie|session/i);
  });

  it('does not send Till 3 evidence through APIRequestContext whose call log prints headers', () => {
    const helper = source('tests/e2e/helpers/preview-qa-till3-accounting.ts');
    const fetchHelper = source('tests/e2e/helpers/preview-qa-redacted-fetch.ts');
    const spec = source('playwright/reliability-till3-accounting.spec.ts');
    const scanned = `${helper}\n${spec}`;
    expect(scanned).not.toContain('page.request');
    expect(scanned).not.toContain('APIRequestContext');
    expect(scanned).not.toMatch(/request\.get\(/);
    expect(fetchHelper).not.toMatch(/import\s+[^;]*APIRequestContext/);
    expect(fetchHelper).not.toContain('page.request');
    expect(fetchHelper).not.toMatch(/request\.get\(/);
    expect(fetchHelper).toContain('credentials: \'include\'');
    expect(fetchHelper).toContain('fetchPageJsonRedacted');
    expect(fetchHelper).toContain('redactSensitivePlaywrightNoise');
    expect(helper).toContain('RELIABILITY_SNAPSHOT_TIMEOUT_MS');
    expect(helper).toContain('fetchPageJsonRedacted');
    expect(helper).not.toContain('fetchPreviewJsonRedacted');
  });

  it('does not raise the Till 3 UI action timeout to absorb snapshot latency', () => {
    const config = source('playwright.config.ts');
    expect(config).toMatch(/name: 'reliability-till3-accounting'[\s\S]*?actionTimeout:\s*8_000/);
    expect(config).toMatch(/name: 'reliability-till3-accounting'[\s\S]*?navigationTimeout:\s*15_000/);
    expect(config).not.toMatch(
      /name: 'reliability-till3-accounting'[\s\S]*?actionTimeout:\s*(?:[3-9]\d_000|[1-9]\d{2,}_000)/,
    );
  });
});
