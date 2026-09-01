/**
 * Preview-only owner + Till 3 provisioning. Zero financial writes.
 *
 * Opt-in: skipped unless shouldRunReliabilityJourney() (Preview + owner creds
 * or RELIABILITY_E2E=1). Fail-closed on Production via denial helpers.
 * Uses PLAYWRIGHT_OWNER_EMAIL through ensurePreviewQaOwner (existing-login).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  getBaseUrl,
  isProductionPlaywrightTarget,
  reliabilityJourneySkipReason,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import {
  PREVIEW_QA_STAGE_TIMEOUT_MS,
  PreviewQaOwnerBlockedError,
  assertPreviewQaOwnerTarget,
  completeOnboardingBusinessType,
  ensurePreviewQaOwner,
  pathnameOnly,
  shouldAddNamedTill,
  waitForOwnerSession,
  wrapPreviewQaOwnerFailure,
} from '../tests/e2e/helpers/preview-qa-owner';

function stageBlocked(stage: string, detail: string): never {
  throw new PreviewQaOwnerBlockedError(`Blocked at ${stage}: ${detail}`, { stage });
}

function safeUi(page: Page, field: string, status: string) {
  return `pathname=${pathnameOnly(page.url())} field=${field} status=${status}`;
}

async function confirmPreviewSha(page: Page) {
  if (isProductionPlaywrightTarget()) {
    stageBlocked('identity', 'reliability provisioning cannot run against Production.');
  }

  const res = await page.request.get('/api/qa/deploy-sha');
  const body = res.ok()
    ? ((await res.json()) as { sha?: string | null; vercelEnv?: string | null })
    : {};
  const identity = {
    sha: body.sha ?? null,
    vercelEnv: body.vercelEnv ?? null,
    httpStatus: res.status(),
  };

  assertPreviewQaOwnerTarget({
    baseURL: getBaseUrl(),
    expectedSha: process.env.RELIABILITY_EXPECTED_SHA?.trim() || undefined,
    identity,
  });

  test.info().annotations.push({
    type: 'preview-sha',
    description: String(identity.sha ?? 'local-null'),
  });
  return identity;
}

async function collectNamedTills(page: Page) {
  const names = ['Till 1', 'Till 2', 'Till 3'];
  const found: string[] = [];
  for (const name of names) {
    if ((await page.getByText(name, { exact: true }).count()) > 0) found.push(name);
  }
  return found;
}

async function openSettingsTills(page: Page) {
  try {
    await page.goto('/settings?section=tills', {
      waitUntil: 'domcontentloaded',
      timeout: PREVIEW_QA_STAGE_TIMEOUT_MS,
    });
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({
      error:
        error instanceof Error
          ? new Error(`${error.message} ${safeUi(page, 'Till Management', 'unreached')}`)
          : error,
      stage: 'Till setup',
    });
  }

  try {
    await page.getByText('Till Management').waitFor({
      state: 'visible',
      timeout: PREVIEW_QA_STAGE_TIMEOUT_MS,
    });
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({
      error:
        error instanceof Error
          ? new Error(`${error.message} ${safeUi(page, 'Till Management', 'missing')}`)
          : error,
      stage: 'Till setup',
    });
  }
}

async function ensureTill3IfMissing(page: Page) {
  const tillLabels = await collectNamedTills(page);
  if (!shouldAddNamedTill(tillLabels, 'Till 3')) return;

  const nameField = page.getByPlaceholder(/New till name e\.g\. Till 3/i);
  const addButton = page.getByRole('button', { name: /Add till/i });

  try {
    await nameField.waitFor({ state: 'visible', timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({
      error:
        error instanceof Error
          ? new Error(`${error.message} ${safeUi(page, 'New till name', 'missing')}`)
          : error,
      stage: 'Till setup',
    });
  }

  await nameField.fill('Till 3', { timeout: PREVIEW_QA_STAGE_TIMEOUT_MS });

  if (!(await addButton.isEnabled({ timeout: PREVIEW_QA_STAGE_TIMEOUT_MS }).catch(() => false))) {
    stageBlocked('Till setup', `Add till stayed disabled. ${safeUi(page, 'Add till', 'disabled')}`);
  }

  await addButton.click({ timeout: PREVIEW_QA_STAGE_TIMEOUT_MS, noWaitAfter: true });
}

async function proveTill3OnSettings(page: Page) {
  try {
    await expect(page.getByText('Till 3', { exact: true })).toBeVisible({
      timeout: PREVIEW_QA_STAGE_TIMEOUT_MS,
    });
  } catch (error) {
    throw wrapPreviewQaOwnerFailure({
      error:
        error instanceof Error
          ? new Error(`${error.message} ${safeUi(page, 'Till 3', 'missing')}`)
          : error,
      stage: 'Till setup',
    });
  }
}

test.describe('Reliability provisioning', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('Preview owner session and Till 3 only', async ({ page }) => {
    await test.step('confirm Preview host and SHA via deploy-sha', async () => {
      await confirmPreviewSha(page);
    });

    await test.step('sign in existing PLAYWRIGHT_OWNER_EMAIL (existing-login)', async () => {
      try {
        await ensurePreviewQaOwner(page);
      } catch (error) {
        throw wrapPreviewQaOwnerFailure({
          error,
          stage: 'login submitted',
        });
      }
    });

    await test.step('complete or verify business type', async () => {
      try {
        await completeOnboardingBusinessType(page);
        await expect(page.getByText(/Supermarket/i).first()).toBeVisible({
          timeout: PREVIEW_QA_STAGE_TIMEOUT_MS,
        });
      } catch (error) {
        throw wrapPreviewQaOwnerFailure({
          error:
            error instanceof Error
              ? new Error(`${error.message} ${safeUi(page, 'Business type', 'unconfirmed')}`)
              : error,
          stage: 'business creation',
        });
      }
    });

    await test.step('establish authenticated owner session', async () => {
      try {
        await waitForOwnerSession(page);
      } catch (error) {
        throw wrapPreviewQaOwnerFailure({
          error,
          stage: 'owner session established',
        });
      }
    });

    await test.step('idempotently ensure Till 3 exists', async () => {
      await openSettingsTills(page);
      await ensureTill3IfMissing(page);
    });

    await test.step('prove Till 3 on settings tills page', async () => {
      if (!/\/settings/.test(pathnameOnly(page.url()))) {
        await openSettingsTills(page);
      }
      await proveTill3OnSettings(page);
    });
  });
});
