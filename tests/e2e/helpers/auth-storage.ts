import { existsSync, readFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { authStatePath } from './auth-paths';
import { getBaseUrl } from './env';

type AuthRole = 'owner' | 'cashier' | 'manager';

const PROTECTED_ROUTE: Record<AuthRole, string> = {
  owner: '/onboarding',
  cashier: '/pos',
  manager: '/pos',
};

export function assertAuthStateFile(role: AuthRole) {
  const filePath = authStatePath(role);
  if (!existsSync(filePath)) {
    throw new Error(`${role} auth storageState missing at ${filePath}`);
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as {
    cookies?: Array<{ name?: string }>;
  };
  const cookieCount = parsed.cookies?.length ?? 0;
  if (cookieCount === 0) {
    throw new Error(`${role} auth storageState has no cookies at ${filePath}`);
  }

  const hasSessionCookie = (parsed.cookies ?? []).some(
    (cookie) => cookie.name?.startsWith('pos_session_') || cookie.name === 'pos_active_business',
  );
  if (!hasSessionCookie) {
    throw new Error(`${role} auth storageState is missing TillFlow session cookies at ${filePath}`);
  }

  return filePath;
}

export async function saveAndValidateAuthState(page: Page, browser: Browser, role: AuthRole) {
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 45_000 });

  const filePath = authStatePath(role);
  await page.context().storageState({ path: filePath });
  assertAuthStateFile(role);

  const validationContext = await browser.newContext({
    storageState: filePath,
    baseURL: getBaseUrl(),
  });
  const validationPage = await validationContext.newPage();
  try {
    await validationPage.goto(PROTECTED_ROUTE[role], { waitUntil: 'domcontentloaded' });
    await expect(validationPage).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
    await expect(validationPage.locator('#main-content')).toBeVisible({ timeout: 45_000 });
  } finally {
    await validationContext.close();
  }

  return filePath;
}
