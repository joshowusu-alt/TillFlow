import type { Page } from '@playwright/test';
import { getBaseUrl } from './env';
import {
  RELIABILITY_ONBOARDING_QA_TENANT_1,
  RELIABILITY_ONBOARDING_QA_TENANT_2_EMAIL_KEY,
  RELIABILITY_ONBOARDING_QA_TENANT_2_PASSWORD_KEY,
} from '../../../lib/reliability/onboarding-qa-tenants';
import {
  PreviewQaOwnerBlockedError,
  completeOnboardingBusinessType,
  createPlaywrightPreviewQaOwnerDriver,
  provisionPreviewQaOwner,
  waitForOwnerSession,
  wrapPreviewQaOwnerFailure,
  type PreviewQaOwnerCredentials,
  type PreviewQaProvisionStage,
} from './preview-qa-owner';

export { RELIABILITY_ONBOARDING_QA_TENANT_1 };

export function readOnboardingQaOwnerCredentials(env: {
  [key: string]: string | undefined;
}): PreviewQaOwnerCredentials {
  const email = env[RELIABILITY_ONBOARDING_QA_TENANT_2_EMAIL_KEY]?.trim() ?? '';
  const password = env[RELIABILITY_ONBOARDING_QA_TENANT_2_PASSWORD_KEY]?.trim() ?? '';
  const catalogueEmail = env.PLAYWRIGHT_OWNER_EMAIL?.trim() ?? '';
  const firstOnboardingEmail = env[RELIABILITY_ONBOARDING_QA_TENANT_1.envEmailKey]?.trim() ?? '';
  if (!email || !password) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2 and PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD_2 are required for the pristine Step 2 onboarding gate.',
      { stage: 'identity' },
    );
  }
  if (catalogueEmail && email.toLowerCase() === catalogueEmail.toLowerCase()) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: onboarding QA owner 2 must be a separate Preview identity from PLAYWRIGHT_OWNER_EMAIL.',
      { stage: 'identity' },
    );
  }
  if (firstOnboardingEmail && email.toLowerCase() === firstOnboardingEmail.toLowerCase()) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2 must not reuse tenant 1 (Gino / Step 2 Done).',
      { stage: 'identity' },
    );
  }
  return { email, password };
}

export async function ensureOnboardingQaOwner(page: Page) {
  let stage: PreviewQaProvisionStage = 'identity';
  const credentials = readOnboardingQaOwnerCredentials(process.env);
  try {
    await provisionPreviewQaOwner({
      baseURL: getBaseUrl(),
      env: {
        ...process.env,
        PLAYWRIGHT_OWNER_EMAIL: credentials.email,
        PLAYWRIGHT_OWNER_PASSWORD: credentials.password,
      },
      driver: await createPlaywrightPreviewQaOwnerDriver(page, (next) => {
        stage = next;
      }),
      onStage: (next) => {
        stage = next;
      },
    });
    await waitForOwnerSession(page);
    await completeOnboardingBusinessType(page);
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({ error, stage, credentials });
  }
}
