import { mkdirSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { AUTH_DIR } from './helpers/auth-paths';
import { saveAndValidateAuthState } from './helpers/auth-storage';
import { loginAsRole, expectCashierLanding } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

mkdirSync(AUTH_DIR, { recursive: true });

setup('authenticate cashier QA user', async ({ page, browser }) => {
  setup.skip(!hasRoleCredentials('cashier'), missingRoleEnvMessage('cashier'));

  await loginAsRole(page, 'cashier');
  await expectCashierLanding(page);
  await saveAndValidateAuthState(page, browser, 'cashier');
});
