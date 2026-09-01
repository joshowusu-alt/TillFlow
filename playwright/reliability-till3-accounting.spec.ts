/**
 * Preview-only Till 3 cash/tender accounting gate. Maximum five minutes.
 * Reuses the Reliability Preview QA owner, Till 3, and Reliability SKU.
 * Does not import, refund, expense, go offline, or run catalogue / Phase 9.
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
import { ensureSellableQaProduct } from '../tests/e2e/helpers/preview-qa-product';
import { ensureQaOpeningStock } from '../tests/e2e/helpers/preview-qa-catalogue';
import {
  assertTill3ShiftSummaryUi,
  completeTill3AccountingTenders,
  confirmTill3AccountingPreviewSha,
  ensureSellableQaOnHand,
  ensureTill3Exists,
  fetchTill3AccountingSnapshot,
  gotoTill3Pos,
  openTill3ShiftForAccounting,
  proveTill3AccountingPersisted,
  requireTill3AccountingSalesAllowed,
} from '../tests/e2e/helpers/preview-qa-till3-accounting';

function blocked(detail: string): never {
  throw new Error(`Till 3 accounting gate blocked: ${detail}`);
}

test.describe('Reliability Till 3 accounting', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('Till 3 sale posts non-zero shift cash and tender totals', async ({ page }, testInfo) => {
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

    await test.step('reuse existing Till 3', async () => {
      await ensureTill3Exists(page);
    });

    await test.step('idempotently ensure one sellable QA product has stock', async () => {
      await ensureSellableQaProduct(page);
      await ensureQaOpeningStock(page, () => fetchTill3AccountingSnapshot(page));
      const stock = await fetchTill3AccountingSnapshot(page);
      const qty = (stock as { sellableProduct?: { qtyOnHandBase?: number } }).sellableProduct
        ?.qtyOnHandBase ?? 0;
      if (qty < 1) {
        await ensureSellableQaOnHand(page);
      }
      const restocked = await fetchTill3AccountingSnapshot(page);
      if (((restocked as { sellableProduct?: { qtyOnHandBase?: number } }).sellableProduct?.qtyOnHandBase ?? 0) < 1) {
        blocked('Reliability SKU on-hand is still 0 after restock.');
      }
    });

    await test.step('open a shift explicitly on Till 3', async () => {
      await openTill3ShiftForAccounting(page);
    });

    await test.step('assert POS till and shift belong to Till 3 before selling', async () => {
      await gotoTill3Pos(page);
    });

    await test.step('complete controlled Till 3 cash and non-cash tenders', async () => {
      await requireTill3AccountingSalesAllowed();
      await completeTill3AccountingTenders(page);
    });

    await test.step('assert persisted Till 3 invoice, payments, drawer, and shift totals', async () => {
      const { table } = await proveTill3AccountingPersisted(page);
      testInfo.annotations.push({ type: 'till3-accounting', description: table.replace(/\n/g, ' | ') });
      console.info(table);
    });

    await test.step('assert Shift UI summary is no longer zero', async () => {
      await assertTill3ShiftSummaryUi(page);
    });
  });
});
