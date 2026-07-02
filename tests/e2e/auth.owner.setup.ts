import { mkdirSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { AUTH_DIR } from './helpers/auth-paths';
import { saveAndValidateAuthState } from './helpers/auth-storage';
import { loginAsRole, expectOwnerLanding } from './helpers/login';
import { hasRoleCredentials, missingRoleEnvMessage } from './helpers/env';

mkdirSync(AUTH_DIR, { recursive: true });

setup('authenticate owner QA user', async ({ page, browser }) => {
  setup.skip(!hasRoleCredentials('owner'), missingRoleEnvMessage('owner'));

  await loginAsRole(page, 'owner');
  await expectOwnerLanding(page);
  await saveAndValidateAuthState(page, browser, 'owner');
});
