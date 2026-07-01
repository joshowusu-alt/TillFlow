import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { loginAsRole, expectCashierLanding } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

const authDir = path.join(process.cwd(), 'playwright/.auth');
mkdirSync(authDir, { recursive: true });

setup('authenticate cashier QA user', async ({ page }) => {
  setup.skip(!hasRoleCredentials('cashier'), missingRoleEnvMessage('cashier'));

  await loginAsRole(page, 'cashier');
  await expectCashierLanding(page);
  await page.context().storageState({ path: path.join(authDir, 'cashier.json') });
});
