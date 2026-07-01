import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { loginAsRole, expectCashierLanding } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

const authDir = path.join(process.cwd(), 'playwright/.auth');
mkdirSync(authDir, { recursive: true });

setup('authenticate manager QA user', async ({ page }) => {
  setup.skip(!hasRoleCredentials('manager'), missingRoleEnvMessage('manager'));

  await loginAsRole(page, 'manager');
  await expectCashierLanding(page);
  await page.context().storageState({ path: path.join(authDir, 'manager.json') });
});
