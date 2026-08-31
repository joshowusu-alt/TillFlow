import type { Locator, Page } from '@playwright/test';
import {
  RELIABILITY_PREVIEW_QA_BUSINESS_NAME,
  RELIABILITY_PREVIEW_QA_OWNER_NAME,
  RELIABILITY_PREVIEW_QA_TAG,
} from '../../../lib/reliability/preview-qa-tag';
import { diagnoseDisabledRegisterAdvance } from '../../../lib/register/advance';
import { getBaseUrl, isProductionPlaywrightTarget } from './env';
import { waitForProtectedShell } from './login';
import { isVercelPreviewPlaywrightTarget } from './vercel-preview-bypass';

export class PreviewQaOwnerBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewQaOwnerBlockedError';
  }
}

export type PreviewQaOwnerCredentials = {
  email: string;
  password: string;
};

export type PreviewDeployIdentity = {
  sha: string | null;
  vercelEnv: string | null;
  httpStatus: number;
};

export type PreviewQaOwnerDriver = {
  getIdentity: () => Promise<PreviewDeployIdentity>;
  login: (credentials: PreviewQaOwnerCredentials) => Promise<'ok' | 'invalid' | 'failed'>;
  register: (input: PreviewQaOwnerCredentials) => Promise<'ok' | 'exists' | 'failed'>;
};

export type PreviewQaOwnerMode = 'existing-login' | 'first-time-provision';

function redactCredentialNoise(text: string, credentials?: PreviewQaOwnerCredentials) {
  let safe = text;
  if (credentials?.email) safe = safe.split(credentials.email).join('[redacted-email]');
  if (credentials?.password) safe = safe.split(credentials.password).join('[redacted-password]');
  return safe;
}

export function readPreviewQaOwnerCredentials(env: {
  [key: string]: string | undefined;
  PLAYWRIGHT_OWNER_EMAIL?: string;
  PLAYWRIGHT_OWNER_PASSWORD?: string;
}): PreviewQaOwnerCredentials | null {
  const email = env.PLAYWRIGHT_OWNER_EMAIL?.trim() ?? '';
  const password = env.PLAYWRIGHT_OWNER_PASSWORD?.trim() ?? '';
  if (!email || !password) return null;
  return { email, password };
}

export function assertPreviewQaOwnerTarget(input: {
  baseURL: string;
  expectedSha?: string;
  identity: PreviewDeployIdentity;
}) {
  if (isProductionPlaywrightTarget(input.baseURL)) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: Preview QA owner provisioning cannot run against Production.',
    );
  }
  if (!isVercelPreviewPlaywrightTarget(input.baseURL)) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: Preview QA owner provisioning requires a Vercel Preview host.',
    );
  }
  if (input.identity.httpStatus < 200 || input.identity.httpStatus >= 300) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: Preview deploy-sha identity endpoint is unavailable.',
    );
  }
  if (input.identity.vercelEnv !== 'preview') {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: deploy-sha vercelEnv is not preview.',
    );
  }
  if (input.expectedSha && input.identity.sha !== input.expectedSha) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: Preview SHA does not match RELIABILITY_EXPECTED_SHA.',
    );
  }
}

export async function provisionPreviewQaOwner(input: {
  baseURL: string;
  env: {
    [key: string]: string | undefined;
    PLAYWRIGHT_OWNER_EMAIL?: string;
    PLAYWRIGHT_OWNER_PASSWORD?: string;
    RELIABILITY_EXPECTED_SHA?: string;
  };
  driver: PreviewQaOwnerDriver;
}): Promise<{ mode: PreviewQaOwnerMode }> {
  const credentials = readPreviewQaOwnerCredentials(input.env);
  if (!credentials) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: PLAYWRIGHT_OWNER_EMAIL and PLAYWRIGHT_OWNER_PASSWORD are required for Preview QA.',
    );
  }

  if (isProductionPlaywrightTarget(input.baseURL)) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: Preview QA owner provisioning cannot run against Production.',
    );
  }

  const identity = await input.driver.getIdentity();
  assertPreviewQaOwnerTarget({
    baseURL: input.baseURL,
    expectedSha: input.env.RELIABILITY_EXPECTED_SHA?.trim() || undefined,
    identity,
  });

  const login = await input.driver.login(credentials);
  if (login === 'ok') return { mode: 'existing-login' };

  if (login === 'failed') {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: Preview QA owner login failed before register could be attempted.',
    );
  }

  const registered = await input.driver.register(credentials);
  if (registered === 'ok') return { mode: 'first-time-provision' };
  if (registered === 'exists') {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: PLAYWRIGHT_OWNER_EMAIL already exists and authentication failed. Password was not overwritten.',
    );
  }
  throw new PreviewQaOwnerBlockedError('Blocked: Preview QA owner registration failed.');
}

function classifyLoginPage(url: string, banner: string | null): 'ok' | 'invalid' | 'pending' {
  if (/invalid (credentials|email or password)/i.test(banner ?? '')) return 'invalid';
  if (!/\/login(?:\?|$)/.test(url)) return 'ok';
  return 'pending';
}

function classifyRegisterPage(url: string): 'ok' | 'exists' | 'pending' {
  if (/[?&]error=exists(?:&|$)/.test(url)) return 'exists';
  if (!/\/register(?:\?|$)/.test(url)) return 'ok';
  return 'pending';
}

export const previewQaOwnerPageOutcomes = {
  classifyLoginPage,
  classifyRegisterPage,
  redactCredentialNoise,
};

const REGISTER_STEP_TIMEOUT_MS = 8_000;

async function fillReactInput(locator: Locator, value: string) {
  await locator.waitFor({ state: 'visible', timeout: 15_000 });
  await locator.click();
  await locator.evaluate((el, nextValue) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, nextValue);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextValue, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function visibleRegisterErrors(page: Page) {
  const texts = await page.locator('.border-rose-300, [role="alert"]').allTextContents();
  return texts.map((text) => text.trim()).filter(Boolean);
}

async function clickEnabledRegisterNext(locator: Locator, diagnosis: string) {
  const deadline = Date.now() + REGISTER_STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await locator.isEnabled().catch(() => false)) {
      await locator.click({ timeout: 5_000 });
      return;
    }
    await locator.page().waitForTimeout(100);
  }
  throw new PreviewQaOwnerBlockedError(diagnosis);
}

export type Phase9SharedSetup = {
  ownerReady: boolean;
  till3Ready: boolean;
};

export function assertMobilePhase9Prereqs(setup: Phase9SharedSetup) {
  if (!setup.ownerReady || !setup.till3Ready) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked: mobile Phase 9 cannot start because desktop provisioning/Till 3 setup did not complete.',
    );
  }
}

export async function createPlaywrightPreviewQaOwnerDriver(page: Page): Promise<PreviewQaOwnerDriver> {
  return {
    async getIdentity() {
      const res = await page.request.get('/api/qa/deploy-sha');
      const body = res.ok() ? ((await res.json()) as { sha?: string | null; vercelEnv?: string | null }) : {};
      return {
        sha: body.sha ?? null,
        vercelEnv: body.vercelEnv ?? null,
        httpStatus: res.status(),
      };
    },
    async login(credentials) {
      await page.goto('/login', { waitUntil: 'load' });
      await fillReactInput(page.locator('input[name="email"]'), credentials.email);
      await fillReactInput(page.locator('input[name="password"]'), credentials.password);
      await page.getByRole('button', { name: /sign in/i }).click();
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const banner = (await page.locator('.border-rose-300').first().textContent().catch(() => null))?.trim() ?? null;
        const outcome = classifyLoginPage(page.url(), banner);
        if (outcome === 'invalid') return 'invalid';
        if (outcome === 'ok') {
          await waitForProtectedShell(page);
          return 'ok';
        }
        await page.waitForTimeout(250);
      }
      return 'failed';
    },
    async register(credentials) {
      await page.goto('/register', { waitUntil: 'load' });
      const nextAccount = page.getByRole('button', { name: /Next — Account Details/i });
      await nextAccount.waitFor({ state: 'visible', timeout: 15_000 });
      const business = page.getByPlaceholder(/El-Shaddai Supermarket/i);
      const owner = page.getByPlaceholder(/Kingsley Atakorah/i);
      await fillReactInput(business, RELIABILITY_PREVIEW_QA_BUSINESS_NAME);
      await fillReactInput(owner, RELIABILITY_PREVIEW_QA_OWNER_NAME);
      await clickEnabledRegisterNext(
        nextAccount,
        diagnoseDisabledRegisterAdvance({
          step: 1,
          nextDisabled: true,
          businessName: await business.inputValue().catch(() => ''),
          ownerName: await owner.inputValue().catch(() => ''),
          visibleErrors: await visibleRegisterErrors(page),
        }),
      );

      const emailField = page.getByPlaceholder(/you@yourstore.com/i);
      const passwordField = page.getByPlaceholder(/At least 6 characters/i);
      await emailField.waitFor({ state: 'visible', timeout: 15_000 });
      await fillReactInput(emailField, credentials.email);
      await fillReactInput(passwordField, credentials.password);
      const passwordLength = (await passwordField.inputValue().catch(() => '')).length;
      await clickEnabledRegisterNext(
        page.getByRole('button', { name: /Next — Choose Plan/i }),
        diagnoseDisabledRegisterAdvance({
          step: 2,
          nextDisabled: true,
          businessName: RELIABILITY_PREVIEW_QA_BUSINESS_NAME,
          ownerName: RELIABILITY_PREVIEW_QA_OWNER_NAME,
          email: (await emailField.inputValue().catch(() => '')).trim() ? '[redacted-email]' : '',
          passwordLength,
          visibleErrors: await visibleRegisterErrors(page),
        }),
      );

      await page.getByRole('button', { name: /Next — Currency/i }).click({ timeout: REGISTER_STEP_TIMEOUT_MS });
      await page.locator('input[name="qaTag"]').evaluate((el, tag) => {
        (el as HTMLInputElement).value = tag;
      }, RELIABILITY_PREVIEW_QA_TAG);
      await page.getByRole('button', { name: /Create My Business/i }).click({ timeout: REGISTER_STEP_TIMEOUT_MS });
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const outcome = classifyRegisterPage(page.url());
        if (outcome === 'exists') return 'exists';
        if (outcome === 'ok') {
          await waitForProtectedShell(page);
          return 'ok';
        }
        await page.waitForTimeout(250);
      }
      return 'failed';
    },
  };
}

export async function ensurePreviewQaOwner(page: Page) {
  try {
    return await provisionPreviewQaOwner({
      baseURL: getBaseUrl(),
      env: process.env,
      driver: await createPlaywrightPreviewQaOwnerDriver(page),
    });
  } catch (error) {
    if (error instanceof PreviewQaOwnerBlockedError) {
      throw new PreviewQaOwnerBlockedError(
        redactCredentialNoise(error.message, readPreviewQaOwnerCredentials(process.env) ?? undefined),
      );
    }
    throw new PreviewQaOwnerBlockedError(
      redactCredentialNoise(
        error instanceof Error ? error.message : 'Preview QA owner provisioning failed.',
        readPreviewQaOwnerCredentials(process.env) ?? undefined,
      ),
    );
  }
}
