/**
 * Preview-only new-business onboarding button gate. Zero product and money writes.
 *
 * Owner defect: Step 2 “Add a product manually” must land on /products#product-create,
 * never /products/product-create (“Product not found.”).
 */
import { test, type Page } from '@playwright/test';
import {
  getBaseUrl,
  isProductionPlaywrightTarget,
  reliabilityJourneySkipReason,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import {
  assertPreviewQaOwnerTarget,
  ensurePreviewQaOwner,
  waitForOwnerSession,
} from '../tests/e2e/helpers/preview-qa-owner';
import { ensureOnboardingQaOwner } from '../tests/e2e/helpers/preview-qa-onboarding-owner';
import {
  clickOnboardingAddProductManually,
  emulateStandaloneDisplayMode,
  proveDirectProductCreateHashSeparately,
  proveEstablishedBusinessAddProduct,
} from '../tests/e2e/helpers/preview-qa-onboarding-manual';

function blocked(step: string, detail: string): never {
  throw new Error(`Onboarding manual gate blocked at ${step}: ${detail}`);
}

async function confirmPreviewSha(page: Page) {
  if (isProductionPlaywrightTarget()) {
    blocked('identity', 'reliability onboarding-manual cannot run against Production.');
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

test.describe('Reliability onboarding manual', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('new-business Add a product manually lands on /products#product-create', async ({ page }) => {
    test.setTimeout(180_000);

    await test.step('confirm Preview host and SHA via deploy-sha', async () => {
      await confirmPreviewSha(page);
    });

    await test.step('sign in dedicated PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2', async () => {
      await ensureOnboardingQaOwner(page);
    });

    await test.step('desktop: physically click Add a product manually', async () => {
      await clickOnboardingAddProductManually(page);
    });

    await test.step('mobile viewport: physically click Add a product manually', async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await clickOnboardingAddProductManually(page);
    });

    await test.step('installed/PWA standalone: physically click Add a product manually', async () => {
      await emulateStandaloneDisplayMode(page);
      await clickOnboardingAddProductManually(page);
    });

    await test.step('direct hash load is separate evidence, not a substitute for the button', async () => {
      await proveDirectProductCreateHashSeparately(page);
    });
  });

  test('established-business Stock Products Add product still opens the form', async ({ page }) => {
    test.setTimeout(120_000);

    await test.step('confirm Preview host and SHA via deploy-sha', async () => {
      await confirmPreviewSha(page);
    });

    await test.step('sign in existing PLAYWRIGHT_OWNER_EMAIL', async () => {
      await ensurePreviewQaOwner(page);
      await waitForOwnerSession(page);
    });

    await test.step('click established-business Add product hash link', async () => {
      await proveEstablishedBusinessAddProduct(page);
    });
  });
});
