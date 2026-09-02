/**
 * Preview-only Till 3 accounting EVIDENCE gate. Maximum five minutes.
 * Sign in the existing Reliability Preview QA owner and verify INV-000001.
 * Performs no registration, onboarding, product, stock, shift, sale, or payment writes.
 */
import { test } from '@playwright/test';
import {
  isProductionPlaywrightTarget,
  reliabilityJourneySkipReason,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import {
  confirmTill3AccountingPreviewSha,
  proveTill3AccountingEvidenceOnly,
  signInExistingReliabilityOwner,
} from '../tests/e2e/helpers/preview-qa-till3-accounting';

function blocked(detail: string): never {
  throw new Error(`Till 3 accounting gate blocked: ${detail}`);
}

test.describe('Reliability Till 3 accounting', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('persisted Till 3 INV-000001 T3ACC invoice has non-zero shift cash and tender totals', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);

    if (isProductionPlaywrightTarget()) {
      blocked('reliability-till3-accounting cannot run against Production.');
    }
    if (process.env.PLAYWRIGHT_ALLOW_QA_SALE || process.env.PLAYWRIGHT_QA_TENANT_CONFIRMED) {
      blocked('evidence-only Till 3 gate forbids PLAYWRIGHT_ALLOW_QA_SALE / PLAYWRIGHT_QA_TENANT_CONFIRMED.');
    }

    await test.step('confirm Preview host and SHA via deploy-sha', async () => {
      await confirmTill3AccountingPreviewSha(page);
    });

    await test.step('sign in existing PLAYWRIGHT_OWNER_EMAIL', async () => {
      await signInExistingReliabilityOwner(page);
    });

    await test.step('verify persisted INV-000001, Till 3 UI, and zero writes', async () => {
      const { table } = await proveTill3AccountingEvidenceOnly(page);
      testInfo.annotations.push({ type: 'till3-accounting', description: table.replace(/\n/g, ' | ') });
      console.info(table);
    });
  });
});
