/**
 * Preview-only catalogue/import/opening-stock gate. Zero sales and money writes.
 *
 * Always enters /settings/import-stock (the original owner-reported manual
 * import route). Reuses existing Reliability SKU / Import SKU rows. Records
 * opening stock only when the snapshot classifier says create.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  getBaseUrl,
  isProductionPlaywrightTarget,
  reliabilityJourneySkipReason,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import {
  assertPreviewQaOwnerTarget,
  completeOnboardingBusinessType,
  ensurePreviewQaOwner,
  shouldAddNamedTill,
  waitForOwnerSession,
} from '../tests/e2e/helpers/preview-qa-owner';
import {
  RELIABILITY_IMPORT_PRODUCT,
  RELIABILITY_SELLABLE_PRODUCT,
  ensureImportedQaProduct,
  ensureSellableQaProduct,
  expectUniqueQaProductRowVisible,
  gotoQaProductList,
} from '../tests/e2e/helpers/preview-qa-product';
import {
  assertCatalogueDidNotWriteMoney,
  catalogueFinancialFingerprint,
  confirmReliabilityImportCsv,
  enterManualImportRoute,
  ensureQaOpeningStock,
  type CatalogueSnapshotLike,
} from '../tests/e2e/helpers/preview-qa-catalogue';
import { RELIABILITY_NAVIGATION_TIMEOUT_MS } from '../tests/e2e/helpers/preview-qa-locators';

function blocked(step: string, detail: string): never {
  throw new Error(`Catalogue gate blocked at ${step}: ${detail}`);
}

async function confirmPreviewSha(page: Page) {
  if (isProductionPlaywrightTarget()) {
    blocked('identity', 'reliability catalogue cannot run against Production.');
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

async function fetchSnapshot(page: Page): Promise<CatalogueSnapshotLike> {
  const snapshot = await page.request.get('/api/qa/reliability-snapshot');
  if (!snapshot.ok()) blocked('reliability-snapshot', `HTTP ${snapshot.status()}`);
  return snapshot.json();
}

test.describe('Reliability catalogue', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('Preview catalogue, manual import, and opening stock', async ({ page }) => {
    test.setTimeout(180_000);

    await test.step('confirm Preview host and SHA via deploy-sha', async () => {
      await confirmPreviewSha(page);
    });

    await test.step('sign in existing PLAYWRIGHT_OWNER_EMAIL (existing-login)', async () => {
      await ensurePreviewQaOwner(page);
      await waitForOwnerSession(page);
    });

    await test.step('complete or verify business type', async () => {
      await completeOnboardingBusinessType(page);
    });

    const before = await test.step('capture financial fingerprint (must not grow)', async () => {
      return catalogueFinancialFingerprint(await fetchSnapshot(page));
    });

    await test.step('confirm Till 3 exists', async () => {
      await page.goto('/settings?section=tills', {
        waitUntil: 'domcontentloaded',
        timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
      });
      await expect(page.getByText('Till Management')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Till 1', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Till 2', { exact: true })).toBeVisible({ timeout: 5_000 });
      const tillLabels = (
        await Promise.all(
          ['Till 1', 'Till 2', 'Till 3'].map(async (name) =>
            (await page.getByText(name, { exact: true }).count()) > 0 ? name : '',
          ),
        )
      ).filter(Boolean);
      if (shouldAddNamedTill(tillLabels, 'Till 3')) {
        await page.getByPlaceholder(/New till name e\.g\. Till 3/i).fill('Till 3');
        await page.getByRole('button', { name: /Add till/i }).click();
      }
      await expect(page.getByText('Till 3', { exact: true })).toBeVisible({ timeout: 20_000 });
    });

    await test.step('reuse or create exactly one Reliability SKU', async () => {
      await ensureSellableQaProduct(page);
    });

    await test.step('enter exact manual-import route (never skip this visit)', async () => {
      await enterManualImportRoute(page);
    });

    await test.step('complete or reuse deterministic import product', async () => {
      await gotoQaProductList(page, RELIABILITY_IMPORT_PRODUCT);
      await ensureImportedQaProduct(page, async () => {
        await enterManualImportRoute(page);
        await confirmReliabilityImportCsv(page);
      });
    });

    await test.step('prove both catalogue products persist', async () => {
      await gotoQaProductList(page, RELIABILITY_SELLABLE_PRODUCT);
      await expectUniqueQaProductRowVisible(page, RELIABILITY_SELLABLE_PRODUCT);
      await gotoQaProductList(page, RELIABILITY_IMPORT_PRODUCT);
      await expectUniqueQaProductRowVisible(page, RELIABILITY_IMPORT_PRODUCT);
    });

    await test.step('record opening stock idempotently', async () => {
      await ensureQaOpeningStock(page, () => fetchSnapshot(page));
    });

    await test.step('persisted catalogue/import/opening-stock evidence, no money writes', async () => {
      const snapshot = await fetchSnapshot(page);
      const after = catalogueFinancialFingerprint(snapshot);
      assertCatalogueDidNotWriteMoney(before, after);

      if ((snapshot.productCount ?? 0) < 2) {
        blocked('snapshot', `productCount=${snapshot.productCount}; expected at least two catalogue products.`);
      }

      const opening = (snapshot.openingMovements ?? []).filter(
        (row) =>
          row.productName === RELIABILITY_SELLABLE_PRODUCT.name ||
          row.productSku === RELIABILITY_SELLABLE_PRODUCT.sku,
      );
      if (opening.length !== 1) {
        blocked(
          'opening stock',
          `expected exactly one QA opening movement, found ${opening.length}.`,
        );
      }

      test.info().annotations.push(
        { type: 'catalogue-product-count', description: String(snapshot.productCount) },
        { type: 'catalogue-invoices', description: String(after.invoiceCount) },
        { type: 'catalogue-opening-qty', description: String(opening[0]?.qtyBase ?? 'missing') },
      );
    });
  });
});
