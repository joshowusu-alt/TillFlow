import type { Page } from '@playwright/test';
import type { QaRole } from './env';
import { requireRoleCredentials } from './env';

function loginTimeoutMs() {
  return process.env.CI ? 90_000 : 45_000;
}

async function hasSessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.some((cookie) => cookie.name.startsWith('pos_session_'));
}

async function landingPathForRole(role: QaRole) {
  if (role === 'owner') return '/onboarding';
  return '/pos';
}

async function readLoginDiagnostics(page: Page) {
  const url = page.url();
  const loginFormVisible = await page.locator('input[name="email"]').isVisible().catch(() => false);
  const mainVisible = await page.locator('#main-content').isVisible().catch(() => false);
  const banner = await page.locator('.border-rose-300').first().textContent().catch(() => null);
  return {
    url,
    loginFormVisible,
    mainVisible,
    banner: banner?.trim() || null,
  };
}

async function submitLogin(page: Page, role: QaRole, attempt: number) {
  const { email, password } = requireRoleCredentials(role);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  await emailInput.waitFor({ state: 'visible' });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  await expectInputValue(emailInput, email);

  const postResponsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/login(?:\?|$)/.test(response.url()) &&
        response.status() >= 300,
      { timeout: loginTimeoutMs() },
    )
    .catch(() => null);

  await page.getByRole('button', { name: /sign in/i }).click();

  const deadline = Date.now() + loginTimeoutMs();
  while (Date.now() < deadline) {
    if (await hasSessionCookie(page)) {
      await page.goto(await landingPathForRole(role), { waitUntil: 'domcontentloaded' });
      await page.locator('#main-content').waitFor({ state: 'visible', timeout: 45_000 }).catch(() => undefined);
      return;
    }

    const url = page.url();
    if (!url.includes('/login')) {
      if (url.includes('error=otp_required') || url.includes('error=otp_invalid')) {
        throw new Error(
          `${role} login requires 2FA. Authenticated QA needs a QA account without MFA or a test login bypass.`,
        );
      }
      await page.locator('#main-content').waitFor({ state: 'visible', timeout: 45_000 }).catch(() => undefined);
      return;
    }

    const invalidBanner = page.getByText(/Invalid (credentials|email or password)/i);
    if (await invalidBanner.isVisible().catch(() => false)) {
      throw new Error(`${role} login failed: invalid credentials for the configured QA account.`);
    }

    const lockedBanner = page.getByText(/Too many failed attempts/i);
    if (await lockedBanner.isVisible().catch(() => false)) {
      throw new Error(`${role} login blocked by rate limiter. Retry later or use a dedicated QA account.`);
    }

    const otpErrorBanner = page.locator('.border-rose-300').filter({ hasText: /2FA|authenticator/i });
    if (await otpErrorBanner.isVisible().catch(() => false)) {
      throw new Error(
        `${role} login requires 2FA. Authenticated QA needs a QA account without MFA or a test login bypass.`,
      );
    }

    await page.waitForTimeout(500);
  }

  const postResponse = await postResponsePromise;
  if (postResponse && (await hasSessionCookie(page))) {
    await page.goto(await landingPathForRole(role), { waitUntil: 'domcontentloaded' });
    await page.locator('#main-content').waitFor({ state: 'visible', timeout: 45_000 }).catch(() => undefined);
    return;
  }

  const diagnostics = await readLoginDiagnostics(page);
  throw new Error(
    `${role} login timed out on attempt ${attempt}. url=${diagnostics.url} loginFormVisible=${diagnostics.loginFormVisible} mainVisible=${diagnostics.mainVisible} banner=${diagnostics.banner ?? 'none'}`,
  );
}

export async function loginAsRole(page: Page, role: QaRole) {
  try {
    await submitLogin(page, role, 1);
  } catch (firstError) {
    if (
      firstError instanceof Error &&
      (/invalid (credentials|email or password)/i.test(firstError.message) ||
        /rate limiter/i.test(firstError.message) ||
        /requires 2FA/i.test(firstError.message) ||
        /middleware\/CSRF/i.test(firstError.message))
    ) {
      throw firstError;
    }

    if (process.env.CI) {
      await page.waitForTimeout(2_000);
    }
    await submitLogin(page, role, 2);
  }
}

async function expectInputValue(locator: ReturnType<Page['locator']>, expected: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = await locator.inputValue().catch(() => '');
    if (value === expected) return;
    await locator.fill(expected);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Unable to populate login form inputs before submit.');
}

export async function expectOwnerLanding(page: Page) {
  await page.waitForURL(/\/(onboarding|reports\/dashboard)(?:\?|$)/, { timeout: 45_000 });
}

export async function expectCashierLanding(page: Page) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes('/pos')) return;
    if (url.includes('/onboarding')) return;
    await page.waitForTimeout(400);
  }
  throw new Error(`Cashier did not land on /pos or /onboarding. Current URL: ${page.url()}`);
}

export async function waitForProtectedShell(page: Page) {
  await page.locator('#main-content').waitFor({ state: 'visible', timeout: 45_000 });
}

export async function assertTenantUsableForQa(page: Page) {
  const restrictedHeading = page.getByRole('heading', { name: /^Access restricted$/i });
  if (await restrictedHeading.isVisible().catch(() => false)) {
    throw new Error(
      'QA tenant is billing-restricted on production. Provision an active QA/demo tenant (preferred: TillFlow QA Demo with qa-owner@tillflow.app) before running owner/report authenticated QA.',
    );
  }
}

export async function collectTillflowMarks(page: Page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('mark')
      .filter((mark) => mark.name.startsWith('tillflow.'))
      .map((mark) => ({ name: mark.name, startTime: Math.round(mark.startTime) })),
  );
}

export function parseMoneyToPence(text: string | null | undefined) {
  if (!text) return null;
  const match = text.replace(/\s+/g, ' ').match(/(?:GH₵|GHC|₵)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const normalized = Number(match[1].replace(/,/g, ''));
  if (Number.isNaN(normalized)) return null;
  return Math.round(normalized * 100);
}

export function parseTxnCount(text: string | null | undefined) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*txn/i);
  return match ? Number(match[1]) : null;
}
