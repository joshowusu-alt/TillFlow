import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { AUTH_DIR } from './helpers/auth-paths';
import { isProductionPlaywrightTarget } from './helpers/env';
import { loginAsSeedOwner } from './helpers/seed-owner-login';

mkdirSync(AUTH_DIR, { recursive: true });

setup('authenticate local seed owner for UI programme', async ({ page }) => {
  setup.skip(isProductionPlaywrightTarget(), 'Blocked against Production');
  await loginAsSeedOwner(page);
  await page.context().storageState({ path: path.join(AUTH_DIR, 'seed-owner.json') });
});
