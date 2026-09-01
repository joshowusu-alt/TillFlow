import type { Page } from '@playwright/test';
import { getBaseUrl } from './env';
import {
  PreviewQaOwnerBlockedError,
  completeOnboardingBusinessType,
  createPlaywrightPreviewQaOwnerDriver,
  provisionPreviewQaOwner,
  readPreviewQaOwnerCredentials,
  waitForOwnerSession,
  wrapPreviewQaOwnerFailure,
  type PreviewQaOwnerCredentials,
  type PreviewQaProvisionStage,
} from './preview-qa-owner';

export function readOnboardingQaOwnerCredentials(env: {
  [key: string]: string | undefined;
}): PreviewQaOwnerCredentials {
  const email = env.PLAYWRIGHT_ONBOARDING_OWNER_EMAIL?.trim() ?? '';
  const password = env.PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD?.trim() ?? '';
  const catalogueEmail = env.PLAYWRIGHT_OWNER_EMAIL?.trim() ?? '';
  if (!email || !password) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: PLAYWRIGHT_ONBOARDING_OWNER_EMAIL and PLAYWRIGHT_ONBOARDING_OWNER_PASSWORD are required for the new-business onboarding gate.',
      { stage: 'identity' },
    );
  }
  if (catalogueEmail && email.toLowerCase() === catalogueEmail.toLowerCase()) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at identity: onboarding QA owner must be a separate Preview identity from PLAYWRIGHT_OWNER_EMAIL.',
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
