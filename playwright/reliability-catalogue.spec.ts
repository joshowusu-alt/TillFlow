/**
 * Preview-only catalogue/import/opening-stock gate. Zero sales and money writes.
 *
 * Manual import always attaches reliability-manual-import-p104-rel-imp-p104-01.csv
 * (Reliability Manual Import Gate / REL-IMP-P104-01). Presence of Reliability
 * Import SKU or Reliability SKU is not import evidence.
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
  RELIABILITY_SELLABLE_PRODUCT,
  ensureSellableQaProduct,
  expectUniqueQaProductRowVisible,
  gotoQaProductList,
} from '../tests/e2e/helpers/preview-qa-product';
import {
  assertCatalogueDidNotWriteMoney,
  assertCatalogueOpeningStockPersisted,
  catalogueFinancialFingerprint,
  ensureQaOpeningStock,
  runManualImportGate,
  type CatalogueSnapshotLike,
} from '../tests/e2e/helpers/preview-qa-catalogue';
import { RELIABILITY_NAVIGATION_TIMEOUT_MS } from '../tests/e2e/helpers/preview-qa-locators';
import {
  RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT,
  assertPersistedManualImport,
} from '../lib/reliability/manual-import-gate';

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

  test('Preview catalogue, manual import CSV, and persisted opening stock', async ({ page }) => {
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

    const importDecision = await test.step('manual import CSV for REL-IMP-P104-01', async () => {
      return runManualImportGate(page, () => fetchSnapshot(page));
    });

    await test.step('prove sellable + gate import products persist once', async () => {
      await gotoQaProductList(page, RELIABILITY_SELLABLE_PRODUCT);
      await expectUniqueQaProductRowVisible(page, RELIABILITY_SELLABLE_PRODUCT);
      await gotoQaProductList(page, RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT);
      await expectUniqueQaProductRowVisible(page, RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT);
    });

    await test.step('record opening stock and assert persisted movement/journal', async () => {
      await ensureQaOpeningStock(page, () => fetchSnapshot(page));
    });

    await test.step('persisted catalogue/import/opening-stock evidence, no money writes', async () => {
      const snapshot = await fetchSnapshot(page);
      const after = catalogueFinancialFingerprint(snapshot);
      assertCatalogueDidNotWriteMoney(before, after);
      assertCatalogueOpeningStockPersisted(snapshot);
      assertPersistedManualImport({
        gateProducts: snapshot.gateProducts ?? [],
        importRuns: snapshot.productImports ?? [],
      });
      if ((snapshot.productCount ?? 0) < 2) {
        blocked('snapshot', `productCount=${snapshot.productCount}; expected at least two catalogue products.`);
      }

      test.info().annotations.push(
        { type: 'catalogue-import-decision', description: importDecision },
        { type: 'catalogue-product-count', description: String(snapshot.productCount) },
        { type: 'catalogue-invoices', description: String(after.invoiceCount) },
        { type: 'catalogue-payments', description: String(after.paymentCount) },
        {
          type: 'catalogue-opening-store',
          description: String(snapshot.openingMovements?.find((row) => row.productSku === RELIABILITY_SELLABLE_PRODUCT.sku || row.productName === RELIABILITY_SELLABLE_PRODUCT.name)?.storeId ?? 'missing'),
        },
      );
    });
  });
});
