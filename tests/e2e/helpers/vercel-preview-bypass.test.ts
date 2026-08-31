import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLAYWRIGHT_ALLOW_LOCAL_BYPASS_ENV,
  VERCEL_AUTOMATION_BYPASS_SECRET_ENV,
  VERCEL_PROTECTION_BYPASS_HEADER,
  VERCEL_SET_BYPASS_COOKIE_HEADER,
  VercelPreviewBypassBlockedError,
  isLocalPlaywrightHost,
  isProductionPlaywrightHost,
  isVercelPreviewPlaywrightTarget,
  resolveVercelPreviewBypass,
} from './vercel-preview-bypass';

const root = join(__dirname, '..', '..', '..');
const PREVIEW_URL = 'https://supermarket-pos-git-audit-example.vercel.app';
const TEST_DOUBLE = 'unit-test-bypass-placeholder';

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Vercel Preview Playwright bypass', () => {
  it('injects Preview protection headers from the env value, never a hardcoded secret', () => {
    const resolved = resolveVercelPreviewBypass({
      baseURL: PREVIEW_URL,
      env: { [VERCEL_AUTOMATION_BYPASS_SECRET_ENV]: TEST_DOUBLE },
    });

    expect(isVercelPreviewPlaywrightTarget(PREVIEW_URL)).toBe(true);
    expect(resolved.extraHTTPHeaders).toEqual({
      [VERCEL_PROTECTION_BYPASS_HEADER]: TEST_DOUBLE,
      [VERCEL_SET_BYPASS_COOKIE_HEADER]: 'true',
    });
    expect(resolved.disableCapturingArtifacts).toBe(true);
    expect(resolved.extraHTTPHeaders?.[VERCEL_PROTECTION_BYPASS_HEADER]).toBe(TEST_DOUBLE);
  });

  it('blocks Production even when a bypass secret is present', () => {
    expect(isProductionPlaywrightHost('https://tillflow.app')).toBe(true);
    expect(isProductionPlaywrightHost('https://www.tillflow.app')).toBe(true);
    expect(isVercelPreviewPlaywrightTarget('https://www.tillflow.app')).toBe(false);

    for (const url of ['https://tillflow.app', 'https://www.tillflow.app']) {
      expect(() =>
        resolveVercelPreviewBypass({
          baseURL: url,
          env: { [VERCEL_AUTOMATION_BYPASS_SECRET_ENV]: TEST_DOUBLE },
        }),
      ).toThrow(VercelPreviewBypassBlockedError);

      try {
        resolveVercelPreviewBypass({
          baseURL: url,
          env: { [VERCEL_AUTOMATION_BYPASS_SECRET_ENV]: TEST_DOUBLE },
        });
        expect.unreachable();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toMatch(/Production/i);
        expect(message).not.toContain(TEST_DOUBLE);
      }
    }
  });

  it('blocks localhost unless PLAYWRIGHT_ALLOW_LOCAL_BYPASS=true, and never injects headers locally', () => {
    expect(isLocalPlaywrightHost('http://localhost:6200')).toBe(true);

    expect(() =>
      resolveVercelPreviewBypass({
        baseURL: 'http://localhost:6200',
        env: { [VERCEL_AUTOMATION_BYPASS_SECRET_ENV]: TEST_DOUBLE },
      }),
    ).toThrow(/localhost/i);

    const allowed = resolveVercelPreviewBypass({
      baseURL: 'http://localhost:6200',
      env: {
        [VERCEL_AUTOMATION_BYPASS_SECRET_ENV]: TEST_DOUBLE,
        [PLAYWRIGHT_ALLOW_LOCAL_BYPASS_ENV]: 'true',
      },
    });
    expect(allowed.extraHTTPHeaders).toBeUndefined();
    expect(allowed.disableCapturingArtifacts).toBe(false);
  });

  it('blocks any hostname that is not positively a Vercel Preview when a secret exists', () => {
    expect(() =>
      resolveVercelPreviewBypass({
        baseURL: 'https://preview.tillflow.app',
        env: { [VERCEL_AUTOMATION_BYPASS_SECRET_ENV]: TEST_DOUBLE },
      }),
    ).toThrow(/only allowed against a Vercel Preview host/);

    expect(() =>
      resolveVercelPreviewBypass({
        baseURL: 'https://example.com',
        env: { [VERCEL_AUTOMATION_BYPASS_SECRET_ENV]: TEST_DOUBLE },
      }),
    ).toThrow(VercelPreviewBypassBlockedError);
  });

  it('produces a clear safe blocker when protected Preview is missing the bypass secret', () => {
    expect(() =>
      resolveVercelPreviewBypass({
        baseURL: PREVIEW_URL,
        env: {},
      }),
    ).toThrow(VercelPreviewBypassBlockedError);

    try {
      resolveVercelPreviewBypass({ baseURL: PREVIEW_URL, env: { VERCEL_AUTOMATION_BYPASS_SECRET: '   ' } });
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain(VERCEL_AUTOMATION_BYPASS_SECRET_ENV);
      expect(message).toMatch(/protected Vercel Preview/i);
      expect(message).not.toMatch(/unit-test-bypass-placeholder/);
    }
  });

  it('does not inject headers on localhost when no secret is set', () => {
    const resolved = resolveVercelPreviewBypass({
      baseURL: 'http://localhost:6200',
      env: {},
    });
    expect(resolved.extraHTTPHeaders).toBeUndefined();
    expect(resolved.disableCapturingArtifacts).toBe(false);
  });

  it('never hardcodes a bypass secret in Playwright config, helper, or fixtures', () => {
    const files = [
      'playwright.config.ts',
      'tests/e2e/helpers/vercel-preview-bypass.ts',
      'tests/e2e/helpers/vercel-preview-bypass.test.ts',
    ].map((rel) => source(rel));

    for (const text of files) {
      expect(text).not.toMatch(
        /x-vercel-protection-bypass['"]\s*:\s*['"][A-Za-z0-9_-]{12,}/,
      );
      expect(text).not.toMatch(
        /VERCEL_AUTOMATION_BYPASS_SECRET\s*=\s*['"][A-Za-z0-9_-]{12,}/,
      );
    }

    const helper = source('tests/e2e/helpers/vercel-preview-bypass.ts');
    const config = source('playwright.config.ts');
    expect(helper).toContain('env.VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(helper).not.toContain('console.log');
    expect(helper).not.toContain('console.error');
    expect(config).toContain('resolveVercelPreviewBypass');
    expect(config).toContain('env: process.env');
    expect(config).toContain("bypass.disableCapturingArtifacts ? 'off'");
  });
});
