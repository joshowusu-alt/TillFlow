import { existsSync, readFileSync, statSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { authStatePath } from './auth-paths';
import { getBaseUrl, QA_USER_AGENT } from './env';

type AuthRole = 'owner' | 'cashier' | 'manager';

const PROTECTED_ROUTE: Record<AuthRole, string> = {
  owner: '/onboarding',
  cashier: '/pos',
  manager: '/pos',
};

type StoredCookie = {
  name?: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

/**
 * Log non-sensitive storageState diagnostics for CI debugging.
 * Only cookie NAMES and metadata (domain/path/expires/flags) are printed —
 * never cookie values, tokens, or credentials.
 */
export function logAuthStateDiagnostics(role: AuthRole, context: string) {
  const filePath = authStatePath(role);
  const exists = existsSync(filePath);
  const baseURL = getBaseUrl();

  if (!exists) {
    console.log(
      `[qa-auth] ${context} role=${role} path=${filePath} exists=false baseURL=${baseURL}`,
    );
    return;
  }

  const sizeBytes = statSync(filePath).size;
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { cookies?: StoredCookie[] };
  const cookies = parsed.cookies ?? [];
  const safeCookies = cookies.map((cookie) => ({
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }));

  console.log(
    `[qa-auth] ${context} role=${role} path=${filePath} exists=true sizeBytes=${sizeBytes} cookieCount=${cookies.length} baseURL=${baseURL}`,
  );
  console.log(`[qa-auth] ${context} role=${role} cookies=${JSON.stringify(safeCookies)}`);
}

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
  logAuthStateDiagnostics(role, 'setup-auth:saved');

  const validationContext = await browser.newContext({
    storageState: filePath,
    baseURL: getBaseUrl(),
    // Match the downstream role projects' user-agent so the validation context
    // exercises the exact browser family the tests will use.
    userAgent: QA_USER_AGENT,
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
