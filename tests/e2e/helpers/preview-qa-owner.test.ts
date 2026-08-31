import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PreviewQaOwnerBlockedError,
  assertMobilePhase9Prereqs,
  previewQaOwnerPageOutcomes,
  provisionPreviewQaOwner,
  readPreviewQaOwnerCredentials,
  type PreviewQaOwnerDriver,
} from './preview-qa-owner';

const root = join(__dirname, '..', '..', '..');
const EMAIL = 'preview-qa-owner@tillflow-test.invalid';
const PASSWORD = 'unit-test-preview-password';
const PREVIEW_URL = 'https://supermarket-pos-git-audit-example.vercel.app';
const SHA = '9fb69d60f7b262188fba90dbd39c98e030d386e2';

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function driver(overrides: Partial<PreviewQaOwnerDriver> = {}): PreviewQaOwnerDriver {
  return {
    getIdentity: async () => ({ sha: SHA, vercelEnv: 'preview', httpStatus: 200 }),
    login: async () => 'invalid',
    register: async () => 'ok',
    ...overrides,
  };
}

const env = {
  PLAYWRIGHT_OWNER_EMAIL: EMAIL,
  PLAYWRIGHT_OWNER_PASSWORD: PASSWORD,
  RELIABILITY_EXPECTED_SHA: SHA,
};

describe('Preview QA owner provisioning', () => {
  it('provisions on first-time Preview register when the email is new', async () => {
    const result = await provisionPreviewQaOwner({
      baseURL: PREVIEW_URL,
      env,
      driver: driver({ login: async () => 'invalid', register: async () => 'ok' }),
    });
    expect(result.mode).toBe('first-time-provision');
  });

  it('reuses an existing Preview account when login succeeds', async () => {
    let registered = 0;
    const result = await provisionPreviewQaOwner({
      baseURL: PREVIEW_URL,
      env,
      driver: driver({
        login: async () => 'ok',
        register: async () => {
          registered += 1;
          return 'ok';
        },
      }),
    });
    expect(result.mode).toBe('existing-login');
    expect(registered).toBe(0);
  });

  it('stops when the email exists and the password does not authenticate', async () => {
    try {
      await provisionPreviewQaOwner({
        baseURL: PREVIEW_URL,
        env,
        driver: driver({ login: async () => 'invalid', register: async () => 'exists' }),
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PreviewQaOwnerBlockedError);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/already exists and authentication failed/i);
      expect(message).not.toContain(EMAIL);
      expect(message).not.toContain(PASSWORD);
    }
  });

  it('rejects Production hosts before any login or register', async () => {
    let called = 0;
    const blockedDriver = driver({
      getIdentity: async () => {
        called += 1;
        return { sha: SHA, vercelEnv: 'production', httpStatus: 200 };
      },
    });
    await expect(
      provisionPreviewQaOwner({
        baseURL: 'https://www.tillflow.app',
        env,
        driver: blockedDriver,
      }),
    ).rejects.toThrow(/cannot run against Production/);
    expect(called).toBe(0);
  });

  it('rejects a Preview SHA mismatch', async () => {
    await expect(
      provisionPreviewQaOwner({
        baseURL: PREVIEW_URL,
        env,
        driver: driver({
          getIdentity: async () => ({
            sha: '0000000000000000000000000000000000000000',
            vercelEnv: 'preview',
            httpStatus: 200,
          }),
        }),
      }),
    ).rejects.toThrow(/does not match RELIABILITY_EXPECTED_SHA/);
  });

  it('reuses the same tenant credentials for a second mobile session', async () => {
    let logins = 0;
    let registers = 0;
    const shared: PreviewQaOwnerDriver = {
      getIdentity: async () => ({ sha: SHA, vercelEnv: 'preview', httpStatus: 200 }),
      login: async () => {
        logins += 1;
        return registers > 0 ? 'ok' : 'invalid';
      },
      register: async () => {
        registers += 1;
        return 'ok';
      },
    };

    const first = await provisionPreviewQaOwner({ baseURL: PREVIEW_URL, env, driver: shared });
    const mobile = await provisionPreviewQaOwner({ baseURL: PREVIEW_URL, env, driver: shared });
    expect(first.mode).toBe('first-time-provision');
    expect(mobile.mode).toBe('existing-login');
    expect(registers).toBe(1);
    expect(logins).toBe(2);
  });

  it('fails mobile immediately when desktop provisioning did not complete', () => {
    expect(() => assertMobilePhase9Prereqs({ ownerReady: false, till3Ready: false })).toThrow(
      /desktop provisioning\/Till 3 setup did not complete/,
    );
    expect(() => assertMobilePhase9Prereqs({ ownerReady: true, till3Ready: false })).toThrow(
      /desktop provisioning\/Till 3 setup did not complete/,
    );
    expect(() => assertMobilePhase9Prereqs({ ownerReady: true, till3Ready: true })).not.toThrow();
  });

  it('never hardcodes owner credentials and keeps them out of errors', () => {
    expect(readPreviewQaOwnerCredentials({})).toBeNull();
    const files = [
      'tests/e2e/helpers/preview-qa-owner.ts',
      'playwright/reliability-journey.spec.ts',
      'app/actions/register.ts',
    ].map((rel) => source(rel));
    for (const text of files) {
      expect(text).not.toMatch(/PLAYWRIGHT_OWNER_PASSWORD\s*=\s*['"][^'"]+['"]/);
      expect(text).not.toMatch(/reliability-\$\{stamp\}@example\.com/);
    }
    const redacted = previewQaOwnerPageOutcomes.redactCredentialNoise(
      `failed for ${EMAIL} / ${PASSWORD}`,
      { email: EMAIL, password: PASSWORD },
    );
    expect(redacted).not.toContain(EMAIL);
    expect(redacted).not.toContain(PASSWORD);
  });
});
