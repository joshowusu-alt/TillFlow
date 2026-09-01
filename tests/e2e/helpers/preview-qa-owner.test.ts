import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PreviewQaOwnerBlockedError,
  assertMobilePhase9Prereqs,
  ownerSessionLocatorHints,
  previewQaOwnerPageOutcomes,
  provisionPreviewQaOwner,
  readPreviewQaOwnerCredentials,
  shouldAddNamedTill,
  wrapPreviewQaOwnerFailure,
  classifyOnboardingBusinessType,
  classifyTill3ShiftState,
  shouldReadOnboardingPickerValue,
  PREVIEW_QA_PROBE_TIMEOUT_MS,
  PREVIEW_QA_STAGE_TIMEOUT_MS,
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

  it('wraps a closed-browser login failure with the login submitted stage', async () => {
    try {
      await provisionPreviewQaOwner({
        baseURL: PREVIEW_URL,
        env,
        driver: driver({
          login: async () => {
            throw new Error('locator.waitFor: Target page, context or browser has been closed');
          },
        }),
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PreviewQaOwnerBlockedError);
      const blocked = error as PreviewQaOwnerBlockedError;
      expect(blocked.stage).toBe('login submitted');
      expect(blocked.message).toMatch(/Blocked at login submitted/);
      expect(blocked.message).toMatch(/test timeout closed the browser/i);
      expect(blocked.message).not.toContain(EMAIL);
      expect(blocked.message).not.toContain(PASSWORD);
    }
  });

  it('preserves Playwright test timeout instead of replacing it with page-closed', () => {
    const wrapped = wrapPreviewQaOwnerFailure({
      error: new Error('Test timeout of 480000ms exceeded'),
      stage: 'login submitted',
      credentials: { email: EMAIL, password: PASSWORD },
    });
    expect(wrapped).toBeInstanceOf(PreviewQaOwnerBlockedError);
    expect(wrapped.stage).toBe('login submitted');
    expect(wrapped.message).toContain('Blocked at login submitted');
    expect(wrapped.message).toContain('Test timeout of 480000ms exceeded');
    expect(wrapped.message).not.toMatch(/page\/context\/browser has been closed/i);
    expect(wrapped.message).not.toContain(EMAIL);
    expect(wrapped.message).not.toContain(PASSWORD);
  });

  it('preserves Test timeout when the interrupt is also page-closed', () => {
    const wrapped = wrapPreviewQaOwnerFailure({
      error: new Error(
        'Test timeout of 480000ms exceeded\npage.waitForTimeout: Target page, context or browser has been closed',
      ),
      stage: 'business creation',
      credentials: { email: EMAIL, password: PASSWORD },
    });
    expect(wrapped.stage).toBe('business creation');
    expect(wrapped.message).toContain('Test timeout of 480000ms exceeded');
    expect(wrapped.message).not.toMatch(/test timeout closed the browser/i);
    expect(wrapped.message).not.toContain(EMAIL);
    expect(wrapped.message).not.toContain(PASSWORD);
  });

  it('names the last stage when a waitFor is interrupted by a closed browser', () => {
    const wrapped = wrapPreviewQaOwnerFailure({
      error: new Error(
        `locator.waitFor: Target page, context or browser has been closed after ${EMAIL}`,
      ),
      stage: 'login submitted',
      credentials: { email: EMAIL, password: PASSWORD },
    });
    expect(wrapped.stage).toBe('login submitted');
    expect(wrapped.message).toMatch(/Blocked at login submitted/);
    expect(wrapped.message).toMatch(/test timeout closed the browser/i);
    expect(wrapped.message).toMatch(/Last stage: login submitted/);
    expect(wrapped.message).toContain('Original:');
    expect(wrapped.message).not.toContain(EMAIL);
    expect(wrapped.message).not.toContain(PASSWORD);
  });

  it('records redacted stage breadcrumbs for existing-owner recovery', async () => {
    const stages: string[] = [];
    const result = await provisionPreviewQaOwner({
      baseURL: PREVIEW_URL,
      env,
      onStage: (stage) => stages.push(stage),
      driver: driver({
        login: async () => 'ok',
        register: async () => {
          throw new Error('register must not run for an existing owner');
        },
      }),
    });
    expect(result.mode).toBe('existing-login');
    expect(stages).toEqual(['identity', 'login submitted', 'owner session established']);
    expect(stages.join(' ')).not.toContain(EMAIL);
  });

  it('recovers a partial tenant by adding only missing Till 3', () => {
    expect(shouldAddNamedTill(['Till 1', 'Till 2'], 'Till 3')).toBe(true);
    expect(shouldAddNamedTill(['Till 1', 'Till 2', 'Till 3'], 'Till 3')).toBe(false);
    expect(shouldAddNamedTill(['till 3'], 'Till 3')).toBe(false);
  });

  it('does not treat a missing onboarding picker as a saved business type', () => {
    expect(
      classifyOnboardingBusinessType({
        pickerCount: 0,
        selectedValue: '',
        editVisible: false,
      }),
    ).toBe('not-ready');
    expect(
      classifyOnboardingBusinessType({
        pickerCount: 1,
        selectedValue: '',
        editVisible: false,
      }),
    ).toBe('needs-selection');
    expect(
      classifyOnboardingBusinessType({
        pickerCount: 1,
        selectedValue: 'SUPERMARKET',
        editVisible: false,
      }),
    ).toBe('needs-persist');
  });

  it('classifies already-complete when Edit is visible and the Business type combobox is gone', () => {
    expect(
      classifyOnboardingBusinessType({
        pickerCount: 0,
        selectedValue: '',
        editVisible: true,
      }),
    ).toBe('already-complete');
    expect(shouldReadOnboardingPickerValue(0)).toBe(false);
    expect(shouldReadOnboardingPickerValue(1)).toBe(true);
  });

  it('does not call inputValue when pickerCount is 0', () => {
    const helper = source('tests/e2e/helpers/preview-qa-owner.ts');
    const start = helper.indexOf('async function readOnboardingBusinessTypeState');
    const end = helper.indexOf('export async function completeOnboardingBusinessType');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fn = helper.slice(start, end);
    expect(fn).toContain('picker.count()');
    expect(fn).toContain('shouldReadOnboardingPickerValue(pickerCount)');
    expect(fn).toMatch(
      /shouldReadOnboardingPickerValue\(pickerCount\)\s*\?\s*\(await picker\.inputValue\(probeTimeout\)/,
    );
    expect(fn).not.toMatch(/inputValue\(\s*\)/);
    expect(helper).toMatch(/export function shouldReadOnboardingPickerValue/);
    expect(PREVIEW_QA_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(1_000);
    expect(PREVIEW_QA_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(3_000);
    expect(PREVIEW_QA_STAGE_TIMEOUT_MS).toBe(15_000);
  });

  it('bounds every waiting locator action so Date.now loops cannot inherit the 480s test timeout', () => {
    const helper = source('tests/e2e/helpers/preview-qa-owner.ts');
    for (const method of ['inputValue', 'isEnabled', 'waitFor', 'selectOption', 'textContent', 'fill'] as const) {
      const calls = [...helper.matchAll(new RegExp(`\\.${method}\\(([^)]*)\\)`, 'g'))];
      expect(calls.length, method).toBeGreaterThan(0);
      for (const [, args] of calls) {
        expect(args, `${method}(${args})`).toMatch(/timeout:|probeTimeout/);
      }
    }
    expect(helper).not.toMatch(/\.inputValue\(\s*\)/);
    expect(helper).not.toMatch(/\.isEnabled\(\s*\)/);
    expect(helper).toContain('_valueTracker');
    expect(helper).toContain('locator.fill(value, { timeout: PREVIEW_QA_STAGE_TIMEOUT_MS })');
  });

  it('does not treat another open till as Till 3 recovery', () => {
    expect(classifyTill3ShiftState({ shiftActiveVisible: true, till3Visible: false })).toBe(
      'other-till-open',
    );
    expect(classifyTill3ShiftState({ shiftActiveVisible: true, till3Visible: true })).toBe('till-3-open');
    expect(classifyTill3ShiftState({ shiftActiveVisible: false, till3Visible: true })).toBe('closed');
  });

  it('keeps stage locator hints free of credential values', () => {
    const hints = ownerSessionLocatorHints({
      pathname: '/onboarding',
      mainContentCount: 1,
      signOutCount: 1,
      loginEmailCount: 0,
      headingReadyCount: 1,
    });
    expect(hints).toContain('pathname=/onboarding');
    expect(hints).toContain('field=main-content');
    expect(hints).toContain('field=Sign out');
    expect(hints).not.toContain(EMAIL);
    expect(hints).not.toContain(PASSWORD);
  });

  it('disables automatic retries on the hosted reliability-journey project', () => {
    const config = source('playwright.config.ts');
    const start = config.indexOf("name: 'reliability-journey'");
    expect(start).toBeGreaterThan(-1);
    const project = config.slice(start, start + 500);
    expect(project).toMatch(/retries:\s*0/);
    expect(source('playwright/reliability-journey.spec.ts')).toContain('shouldAddNamedTill');
    expect(source('playwright/reliability-journey.spec.ts')).toContain('completeOnboardingBusinessType');
    expect(source('tests/e2e/helpers/preview-qa-owner.ts')).toContain("waitUntil: 'domcontentloaded'");
    expect(source('tests/e2e/helpers/preview-qa-owner.ts')).toContain('noWaitAfter: true');
    expect(source('tests/e2e/helpers/preview-qa-owner.ts')).not.toMatch(/waitUntil:\s*'load'/);
  });
});
