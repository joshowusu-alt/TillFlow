import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { loginAsRole, expectOwnerLanding, expectCashierLanding } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

const authDir = path.join(process.cwd(), 'playwright/.auth');
mkdirSync(authDir, { recursive: true });

setup('authenticate owner QA user', async ({ page }) => {
  setup.skip(!hasRoleCredentials('owner'), missingRoleEnvMessage('owner'));

  await loginAsRole(page, 'owner');
  await expectOwnerLanding(page);
  await page.context().storageState({ path: path.join(authDir, 'owner.json') });
});
