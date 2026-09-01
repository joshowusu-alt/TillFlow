/**
 * Preview-only Till 3 accounting EVIDENCE gate. Maximum five minutes.
 * Verifies the already persisted T3ACC invoice on Till 3.
 * Does not sell, pay, restock, open/close a shift, or reuse payment refs for writing.
 */
import { test } from '@playwright/test';
import {
  isProductionPlaywrightTarget,
  reliabilityJourneySkipReason,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import {
  completeOnboardingBusinessType,
  ensurePreviewQaOwner,
  waitForOwnerSession,
} from '../tests/e2e/helpers/preview-qa-owner';
import {
  assertTill3ShiftSummaryUi,
  confirmTill3AccountingPreviewSha,
  proveTill3AccountingPersisted,
} from '../tests/e2e/helpers/preview-qa-till3-accounting';

function blocked(detail: string): never {
  throw new Error(`Till 3 accounting gate blocked: ${detail}`);
}

test.describe('Reliability Till 3 accounting', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('persisted Till 3 T3ACC invoice has non-zero shift cash and tender totals', async ({ page }, testInfo) => {
    test.setTimeout(300_000);

    if (isProductionPlaywrightTarget()) {
      blocked('reliability-till3-accounting cannot run against Production.');
    }

    await test.step('confirm Preview host and SHA via deploy-sha', async () => {
      await confirmTill3AccountingPreviewSha(page);
    });

    await test.step('sign in existing PLAYWRIGHT_OWNER_EMAIL', async () => {
      await ensurePreviewQaOwner(page);
      await waitForOwnerSession(page);
      await completeOnboardingBusinessType(page);
    });

    await test.step('verify persisted Till 3 invoice, payments, drawer, and shift totals', async () => {
      const { table } = await proveTill3AccountingPersisted(page);
      testInfo.annotations.push({ type: 'till3-accounting', description: table.replace(/\n/g, ' | ') });
      console.info(table);
    });

    await test.step('assert hosted Shift Reconciliation UI for Till 3 is non-zero', async () => {
      await assertTill3ShiftSummaryUi(page);
    });
  });
});
