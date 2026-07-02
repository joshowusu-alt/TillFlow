import { mkdirSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { AUTH_DIR } from './helpers/auth-paths';
import { saveAndValidateAuthState } from './helpers/auth-storage';
import { loginAsRole, expectOwnerLanding, expectCashierLanding } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

mkdirSync(AUTH_DIR, { recursive: true });

setup('authenticate owner QA user', async ({ page, browser }) => {
  setup.skip(!hasRoleCredentials('owner'), missingRoleEnvMessage('owner'));

  await loginAsRole(page, 'owner');
  await expectOwnerLanding(page);
  await saveAndValidateAuthState(page, browser, 'owner');
});

setup('authenticate cashier QA user', async ({ page, browser }) => {
  setup.skip(!hasRoleCredentials('cashier'), missingRoleEnvMessage('cashier'));

  if (process.env.CI) {
    await page.waitForTimeout(1_500);
  }

  await loginAsRole(page, 'cashier');
  await expectCashierLanding(page);
  await saveAndValidateAuthState(page, browser, 'cashier');
});

setup('authenticate manager QA user', async ({ page, browser }) => {
  setup.skip(!hasRoleCredentials('manager'), missingRoleEnvMessage('manager'));

  if (process.env.CI) {
    await page.waitForTimeout(1_500);
  }

  await loginAsRole(page, 'manager');
  await expectCashierLanding(page);
  await saveAndValidateAuthState(page, browser, 'manager');
});
