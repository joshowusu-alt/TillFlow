import type { Page } from '@playwright/test';
import { isProductionPlaywrightTarget, getBaseUrl } from './env';

/** Local/CI seed owner. Never Production. Never print the password. */
export function seedOwnerCredentials() {
  if (isProductionPlaywrightTarget()) {
    throw new Error('UI programme evidence is blocked against Production.');
  }
  return {
    email: process.env.E2E_OWNER_EMAIL?.trim() || 'owner@store.com',
    password: process.env.E2E_OWNER_PASSWORD?.trim() || 'Pass1234!',
  };
}

export async function loginAsSeedOwner(page: Page) {
  const { email, password } = seedOwnerCredentials();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (/\/pos|\/onboarding/.test(url)) {
      await page.locator('#main-content').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
      return;
    }
    if (/error=/.test(url)) {
      throw new Error(`Seed owner login error on ${getBaseUrl()}`);
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Seed owner login did not reach Home or POS (${page.url()})`);
}
