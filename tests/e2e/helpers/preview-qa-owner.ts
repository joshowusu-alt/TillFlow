import type { Locator, Page } from '@playwright/test';
import {
  RELIABILITY_PREVIEW_QA_BUSINESS_NAME,
  RELIABILITY_PREVIEW_QA_OWNER_NAME,
  RELIABILITY_PREVIEW_QA_TAG,
} from '../../../lib/reliability/preview-qa-tag';
import { diagnoseDisabledRegisterAdvance } from '../../../lib/register/advance';
import { getBaseUrl, isProductionPlaywrightTarget } from './env';
import { isVercelPreviewPlaywrightTarget } from './vercel-preview-bypass';

export class PreviewQaOwnerBlockedError extends Error {
  readonly stage: string;
  readonly interruptedBy?: unknown;

  constructor(message: string, options?: { stage?: string; cause?: unknown }) {
    super(message);
    this.name = 'PreviewQaOwnerBlockedError';
    this.stage = options?.stage ?? 'unknown';
    this.interruptedBy = options?.cause;
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

export type PreviewQaProvisionStage =
  | 'identity'
  | 'login submitted'
  | 'registration step 1'
  | 'account details'
  | 'business creation'
  | 'owner session established'
  | 'Till setup';

export type PreviewQaOwnerDriver = {
  getIdentity: () => Promise<PreviewDeployIdentity>;
  login: (credentials: PreviewQaOwnerCredentials) => Promise<'ok' | 'invalid' | 'failed'>;
  register: (input: PreviewQaOwnerCredentials) => Promise<'ok' | 'exists' | 'failed'>;
};

export type PreviewQaOwnerMode = 'existing-login' | 'first-time-provision';

/** Short per-stage bound. Do not raise this to absorb Preview load hangs. */
export const PREVIEW_QA_STAGE_TIMEOUT_MS = 15_000;
const REGISTER_STEP_TIMEOUT_MS = 8_000;

export function redactCredentialNoise(text: string, credentials?: PreviewQaOwnerCredentials) {
  let safe = text;
  if (credentials?.email) safe = safe.split(credentials.email).join('[redacted-email]');
  if (credentials?.password) safe = safe.split(credentials.password).join('[redacted-password]');
  return safe;
}

export function pathnameOnly(url: string) {
  try {
    const parsed = new URL(url, 'https://preview.example');
    return parsed.pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

export function isClosedTargetError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Target page, context or browser has been closed/i.test(message);
}

export function isPlaywrightTimeoutMessage(message: string) {
  return /Test timeout of \d+ms exceeded/i.test(message) || /Timeout \d+ms exceeded/i.test(message);
}

export function ownerSessionLocatorHints(input: {
  pathname: string;
  mainContentCount: number;
  signOutCount: number;
  loginEmailCount: number;
  headingReadyCount: number;
}) {
  return [
    `pathname=${input.pathname}`,
    'field=main-content',
    `status=count:${input.mainContentCount}`,
    'field=Sign out',
    `status=count:${input.signOutCount}`,
    'field=email',
    `status=count:${input.loginEmailCount}`,
    'field=Getting ready',
    `status=count:${input.headingReadyCount}`,
  ].join(' ');
}

/**
 * Keep the last provisioning stage and the original Playwright failure.
 * A closed page/context is a symptom of the test timeout, not the root cause.
 */
export function wrapPreviewQaOwnerFailure(input: {
  error: unknown;
  stage: string;
  credentials?: PreviewQaOwnerCredentials;
}): PreviewQaOwnerBlockedError {
  if (input.error instanceof PreviewQaOwnerBlockedError) {
    return new PreviewQaOwnerBlockedError(
      redactCredentialNoise(input.error.message, input.credentials),
      { stage: input.error.stage || input.stage, cause: input.error.interruptedBy ?? input.error },
    );
  }

  const original = input.error instanceof Error ? input.error.message : 'Preview QA owner provisioning failed.';
  const redacted = redactCredentialNoise(original, input.credentials);
  const timeoutNoted = isPlaywrightTimeoutMessage(redacted);
  const closed = isClosedTargetError(input.error);

  if (closed && !timeoutNoted) {
    return new PreviewQaOwnerBlockedError(
      `Blocked at ${input.stage}: Playwright test timeout closed the browser while waiting. ` +
        `Preserve this timeout; "page/context/browser has been closed" is the interrupt, not the root cause. ` +
        `Last stage: ${input.stage}. Original: ${redacted}`,
      { stage: input.stage, cause: input.error },
    );
  }

  return new PreviewQaOwnerBlockedError(`Blocked at ${input.stage}: ${redacted}`, {
    stage: input.stage,
    cause: input.error,
  });
}

export function shouldAddNamedTill(existingNames: string[], tillName: string) {
  const needle = tillName.trim().toLowerCase();
  if (!needle) return false;
  return !existingNames.some((name) => name.trim().toLowerCase() === needle);
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
      'Blocked at identity: Preview QA owner provisioning cannot run against Production.',
      { stage: 'identity' },
    );
  }
  if (!isVercelPreviewPlaywrightTarget(input.baseURL)) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: Preview QA owner provisioning requires a Vercel Preview host.',
      { stage: 'identity' },
    );
  }
  if (input.identity.httpStatus < 200 || input.identity.httpStatus >= 300) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: Preview deploy-sha identity endpoint is unavailable.',
      { stage: 'identity' },
    );
  }
  if (input.identity.vercelEnv !== 'preview') {
    throw new PreviewQaOwnerBlockedError('Blocked at identity: deploy-sha vercelEnv is not preview.', {
      stage: 'identity',
    });
  }
  if (input.expectedSha && input.identity.sha !== input.expectedSha) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: Preview SHA does not match RELIABILITY_EXPECTED_SHA.',
      { stage: 'identity' },
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
  onStage?: (stage: PreviewQaProvisionStage) => void;
}): Promise<{ mode: PreviewQaOwnerMode }> {
  const credentials = readPreviewQaOwnerCredentials(input.env);
  if (!credentials) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: PLAYWRIGHT_OWNER_EMAIL and PLAYWRIGHT_OWNER_PASSWORD are required for Preview QA.',
      { stage: 'identity' },
    );
  }

  let stage: PreviewQaProvisionStage = 'identity';
  const setStage = (next: PreviewQaProvisionStage) => {
    stage = next;
    input.onStage?.(next);
  };

  try {
    if (isProductionPlaywrightTarget(input.baseURL)) {
      throw new PreviewQaOwnerBlockedError(
        'Blocked at identity: Preview QA owner provisioning cannot run against Production.',
        { stage: 'identity' },
      );
    }

    setStage('identity');
    const identity = await input.driver.getIdentity();
    assertPreviewQaOwnerTarget({
      baseURL: input.baseURL,
      expectedSha: input.env.RELIABILITY_EXPECTED_SHA?.trim() || undefined,
      identity,
    });

    setStage('login submitted');
    const login = await input.driver.login(credentials);
    if (login === 'ok') {
      setStage('owner session established');
      return { mode: 'existing-login' };
    }

    if (login === 'failed') {
      throw new PreviewQaOwnerBlockedError(
        'Blocked at login submitted: Preview QA owner login failed before register could be attempted.',
        { stage: 'login submitted' },
      );
    }

    setStage('registration step 1');
    const registered = await input.driver.register(credentials);
    if (registered === 'ok') {
      setStage('owner session established');
      return { mode: 'first-time-provision' };
    }
    if (registered === 'exists') {
      throw new PreviewQaOwnerBlockedError(
        'Blocked at account details: PLAYWRIGHT_OWNER_EMAIL already exists and authentication failed. Password was not overwritten.',
        { stage: 'account details' },
      );
    }
    throw new PreviewQaOwnerBlockedError('Blocked at business creation: Preview QA owner registration failed.', {
      stage: 'business creation',
    });
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({ error, stage, credentials });
  }
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

async function fillReactInput(locator: Locator, value: string, fieldName: string) {
  try {
    await locator.waitFor({ state: 'visible', timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({
      error,
      stage: fieldName,
      credentials: undefined,
    });
  }
  await locator.click({ timeout: PREVIEW_QA_STAGE_TIMEOUT_MS, noWaitAfter: true });
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
      await locator.click({ timeout: REGISTER_STEP_TIMEOUT_MS, noWaitAfter: true });
      return;
    }
    await locator.page().waitForTimeout(100);
  }
  throw new PreviewQaOwnerBlockedError(diagnosis, { stage: 'registration step 1' });
}

async function gotoStage(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
}

async function sessionHintSnapshot(page: Page) {
  return ownerSessionLocatorHints({
    pathname: pathnameOnly(page.url()),
    mainContentCount: await page.locator('#main-content').count().catch(() => 0),
    signOutCount: await page.getByRole('button', { name: /Sign out/i }).count().catch(() => 0),
    loginEmailCount: await page.locator('input[name="email"]').count().catch(() => 0),
    headingReadyCount: await page.getByRole('heading', { name: /Getting ready/i }).count().catch(() => 0),
  });
}

export async function ownerSessionAlreadyReady(page: Page) {
  const signOut = page.getByRole('button', { name: /Sign out/i });
  const main = page.locator('#main-content');
  const ready = page.getByRole('heading', { name: /Getting ready/i });
  return (
    (await signOut.isVisible().catch(() => false)) ||
    (await main.isVisible().catch(() => false)) ||
    (await ready.isVisible().catch(() => false))
  );
}

export async function waitForOwnerSession(page: Page) {
  const signOut = page.getByRole('button', { name: /Sign out/i });
  const main = page.locator('#main-content');
  try {
    await signOut.or(main).first().waitFor({ state: 'visible', timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
  } catch (error) {
    const hints = await sessionHintSnapshot(page);
    throw wrapPreviewQaOwnerFailure({
      error:
        error instanceof Error
          ? new Error(`owner session not visible within ${PREVIEW_QA_STAGE_TIMEOUT_MS}ms. ${hints}. ${error.message}`)
          : error,
      stage: 'owner session established',
    });
  }
}

export function classifyOnboardingBusinessType(input: {
  pickerCount: number;
  selectedValue: string;
  editVisible: boolean;
}): 'already-complete' | 'needs-selection' | 'needs-persist' | 'not-ready' {
  if (input.editVisible && input.pickerCount === 0) return 'already-complete';
  if (input.pickerCount === 0) return 'not-ready';
  if (input.selectedValue.trim() !== 'SUPERMARKET') return 'needs-selection';
  return 'needs-persist';
}

export function classifyTill3ShiftState(input: {
  shiftActiveVisible: boolean;
  till3Visible: boolean;
}): 'till-3-open' | 'other-till-open' | 'closed' {
  if (input.shiftActiveVisible && input.till3Visible) return 'till-3-open';
  if (input.shiftActiveVisible) return 'other-till-open';
  return 'closed';
}

async function readOnboardingBusinessTypeState(page: Page) {
  const picker = page.getByLabel(/Business type/i);
  const save = page.getByRole('button', { name: /^(Save business type|Save|Saving…)$/ });
  return {
    picker,
    save,
    state: classifyOnboardingBusinessType({
      pickerCount: await picker.count().catch(() => 0),
      selectedValue: (await picker.inputValue().catch(() => '')) || '',
      editVisible: await page.getByRole('button', { name: /^Edit$/i }).isVisible().catch(() => false),
    }),
  };
}

export async function completeOnboardingBusinessType(page: Page) {
  await gotoStage(page, '/onboarding');
  let deadline = Date.now() + PREVIEW_QA_STAGE_TIMEOUT_MS;
  let saveClicked = false;
  while (Date.now() < deadline) {
    const current = await readOnboardingBusinessTypeState(page);
    if (current.state === 'already-complete') return;
    if (current.state === 'needs-selection') {
      await current.picker.selectOption('SUPERMARKET', { timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
      continue;
    }
    if (current.state === 'needs-persist' && !saveClicked) {
      const enableDeadline = Date.now() + REGISTER_STEP_TIMEOUT_MS;
      while (Date.now() < enableDeadline) {
        if (await current.save.isEnabled().catch(() => false)) {
          await current.save.click({ timeout: PREVIEW_QA_STAGE_TIMEOUT_MS, noWaitAfter: true });
          saveClicked = true;
          deadline = Date.now() + PREVIEW_QA_STAGE_TIMEOUT_MS;
          break;
        }
        await page.waitForTimeout(100);
      }
      if (!saveClicked) {
        throw new PreviewQaOwnerBlockedError(
          'Blocked at business creation: Save stayed disabled after selecting SUPERMARKET. field=Business type status=disabled',
          { stage: 'business creation' },
        );
      }
      continue;
    }
    await page.waitForTimeout(100);
  }
  if (saveClicked) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at business creation: Save was clicked but SUPERMARKET did not persist. field=Business type status=unconfirmed',
      { stage: 'business creation' },
    );
  }
  throw new PreviewQaOwnerBlockedError(
    'Blocked at business creation: Business type picker did not become ready. field=Business type status=missing',
    { stage: 'business creation' },
  );
}

export type Phase9SharedSetup = {
  ownerReady: boolean;
  till3Ready: boolean;
};

export function assertMobilePhase9Prereqs(setup: Phase9SharedSetup) {
  if (!setup.ownerReady || !setup.till3Ready) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at Till setup: mobile Phase 9 cannot start because desktop provisioning/Till 3 setup did not complete.',
      { stage: 'Till setup' },
    );
  }
}

export async function createPlaywrightPreviewQaOwnerDriver(
  page: Page,
  onStage: (stage: PreviewQaProvisionStage) => void = () => {},
): Promise<PreviewQaOwnerDriver> {
  return {
    async getIdentity() {
      onStage('identity');
      const res = await page.request.get('/api/qa/deploy-sha');
      const body = res.ok() ? ((await res.json()) as { sha?: string | null; vercelEnv?: string | null }) : {};
      return {
        sha: body.sha ?? null,
        vercelEnv: body.vercelEnv ?? null,
        httpStatus: res.status(),
      };
    },
    async login(credentials) {
      onStage('login submitted');
      await gotoStage(page, '/login');
      if (await ownerSessionAlreadyReady(page)) {
        onStage('owner session established');
        return 'ok';
      }

      const emailField = page.locator('input[name="email"]');
      const passwordField = page.locator('input[name="password"]');
      await fillReactInput(emailField, credentials.email, 'login submitted');
      await fillReactInput(passwordField, credentials.password, 'login submitted');

      const signIn = page.getByRole('button', { name: /sign in/i });
      try {
        await signIn.waitFor({ state: 'visible', timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
      } catch (error) {
        const hints = await sessionHintSnapshot(page);
        throw wrapPreviewQaOwnerFailure({
          error:
            error instanceof Error
              ? new Error(`Sign in not visible. field=Sign in status=missing. ${hints}. ${error.message}`)
              : error,
          stage: 'login submitted',
          credentials,
        });
      }
      if (!(await signIn.isEnabled())) {
        throw new PreviewQaOwnerBlockedError(
          'Blocked at login submitted: Sign in is disabled. field=Sign in status=disabled',
          { stage: 'login submitted' },
        );
      }
      await signIn.click({ timeout: PREVIEW_QA_STAGE_TIMEOUT_MS, noWaitAfter: true });

      const deadline = Date.now() + PREVIEW_QA_STAGE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await ownerSessionAlreadyReady(page)) {
          onStage('owner session established');
          return 'ok';
        }
        const banner =
          (await page.locator('.border-rose-300, [role="alert"]').first().textContent().catch(() => null))?.trim() ??
          null;
        const outcome = classifyLoginPage(page.url(), banner);
        if (outcome === 'invalid') return 'invalid';
        if (outcome === 'ok') {
          await waitForOwnerSession(page);
          onStage('owner session established');
          return 'ok';
        }
        await page.waitForTimeout(250);
      }
      const hints = await sessionHintSnapshot(page);
      throw new PreviewQaOwnerBlockedError(
        `Blocked at login submitted: login did not reach a protected shell within ${PREVIEW_QA_STAGE_TIMEOUT_MS}ms. ${hints}`,
        { stage: 'login submitted' },
      );
    },
    async register(credentials) {
      onStage('registration step 1');
      await gotoStage(page, '/register');
      if (await ownerSessionAlreadyReady(page)) {
        onStage('owner session established');
        return 'ok';
      }

      const nextAccount = page.getByRole('button', { name: /Next — Account Details/i });
      try {
        await nextAccount.waitFor({ state: 'visible', timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
      } catch (error) {
        const hints = await sessionHintSnapshot(page);
        throw wrapPreviewQaOwnerFailure({
          error:
            error instanceof Error
              ? new Error(`Next — Account Details not visible. field=Next — Account Details status=missing. ${hints}. ${error.message}`)
              : error,
          stage: 'registration step 1',
          credentials,
        });
      }

      const business = page.getByPlaceholder(/El-Shaddai Supermarket/i);
      const owner = page.getByPlaceholder(/Kingsley Atakorah/i);
      await fillReactInput(business, RELIABILITY_PREVIEW_QA_BUSINESS_NAME, 'registration step 1');
      await fillReactInput(owner, RELIABILITY_PREVIEW_QA_OWNER_NAME, 'registration step 1');
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

      onStage('account details');
      const emailField = page.getByPlaceholder(/you@yourstore.com/i);
      const passwordField = page.getByPlaceholder(/At least 6 characters/i);
      try {
        await emailField.waitFor({ state: 'visible', timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
      } catch (error) {
        throw wrapPreviewQaOwnerFailure({
          error:
            error instanceof Error
              ? new Error(`Email field not visible. field=Email status=missing. ${error.message}`)
              : error,
          stage: 'account details',
          credentials,
        });
      }
      await fillReactInput(emailField, credentials.email, 'account details');
      await fillReactInput(passwordField, credentials.password, 'account details');
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

      onStage('business creation');
      await page.getByRole('button', { name: /Next — Currency/i }).click({
        timeout: REGISTER_STEP_TIMEOUT_MS,
        noWaitAfter: true,
      });
      await page.locator('input[name="qaTag"]').evaluate((el, tag) => {
        (el as HTMLInputElement).value = tag;
      }, RELIABILITY_PREVIEW_QA_TAG);
      await page.getByRole('button', { name: /Create My Business/i }).click({
        timeout: REGISTER_STEP_TIMEOUT_MS,
        noWaitAfter: true,
      });

      const deadline = Date.now() + PREVIEW_QA_STAGE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (await ownerSessionAlreadyReady(page)) {
          onStage('owner session established');
          return 'ok';
        }
        const outcome = classifyRegisterPage(page.url());
        if (outcome === 'exists') return 'exists';
        if (outcome === 'ok') {
          await waitForOwnerSession(page);
          onStage('owner session established');
          return 'ok';
        }
        await page.waitForTimeout(250);
      }
      return 'failed';
    },
  };
}

export async function ensurePreviewQaOwner(page: Page) {
  let stage: PreviewQaProvisionStage = 'identity';
  const credentials = readPreviewQaOwnerCredentials(process.env) ?? undefined;
  try {
    return await provisionPreviewQaOwner({
      baseURL: getBaseUrl(),
      env: process.env,
      driver: await createPlaywrightPreviewQaOwnerDriver(page, (next) => {
        stage = next;
      }),
      onStage: (next) => {
        stage = next;
      },
    });
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({ error, stage, credentials });
  }
}
