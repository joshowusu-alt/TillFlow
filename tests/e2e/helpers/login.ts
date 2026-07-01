import type { Page } from '@playwright/test';
import type { QaRole } from './env';
import { requireRoleCredentials } from './env';

export async function loginAsRole(page: Page, role: QaRole) {
  const { email, password } = requireRoleCredentials(role);

  await page.goto('/login', { waitUntil: 'networkidle' });
  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  await emailInput.waitFor({ state: 'visible' });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  await expectInputValue(emailInput, email);
  await page.getByRole('button', { name: /sign in/i }).click();

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes('/login')) {
      if (url.includes('error=otp_required') || url.includes('error=otp_invalid')) {
        throw new Error(
          `${role} login requires 2FA. Authenticated QA needs a QA account without MFA or a test login bypass.`,
        );
      }
      return;
    }

    const invalidBanner = page.getByText(/Invalid credentials/i);
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

    await page.waitForTimeout(400);
  }

  const banner = await page.locator('.border-rose-300').first().textContent().catch(() => null);
  throw new Error(`${role} login timed out. Login error banner: ${banner ?? 'none'}`);
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
