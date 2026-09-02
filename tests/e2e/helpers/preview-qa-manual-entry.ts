/**
 * Catalogue-gate flow A: onboarding “Add a product manually” →
 * /products#product-create must open the Add product details and form.
 * Clicking the closed summary is not a pass.
 */
import { expect, type Page } from '@playwright/test';
import {
  RELIABILITY_ACTION_TIMEOUT_MS,
  RELIABILITY_NAVIGATION_TIMEOUT_MS,
  clickUniqueVisible,
  fillUniqueVisible,
} from './preview-qa-locators';
import {
  expectUniqueQaProductRowVisible,
  gotoQaProductList,
  resolveQaProductOnList,
} from './preview-qa-product';
import {
  RELIABILITY_MANUAL_ENTRY_PRODUCT,
  assertManualEntryFormNotTrapped,
  assertPersistedManualEntry,
  classifyManualEntrySubmit,
} from '../../../lib/reliability/manual-entry-gate';

export { RELIABILITY_MANUAL_ENTRY_PRODUCT };

/** Catalogue-gate manual-entry SKU: REL-MAN-P104-01 */

type CatalogueSnapshotLike = {
  manualEntryProducts?: Array<{ id?: string; name?: string; sku?: string | null }>;
};

async function productCreateDetails(page: Page) {
  return page.getByTestId('product-create-details');
}

export async function proveProductCreateHashOpenedForm(page: Page) {
  await expect(page).toHaveURL(/\/products(?:\?[^#]*)?#product-create/);
  const details = await productCreateDetails(page);
  await expect(details, 'Add product details missing on /products').toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(details, 'hash left Add product details closed').toHaveAttribute('open', '', {
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  // Real markup: <h2>Add product</h2> is a sibling of <form>, both inside details.
  await expect(
    details.getByRole('heading', { name: 'Add product', exact: true }),
  ).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  const form = details.locator('form');
  const nameField = form.locator('input[name="name"]');
  await expect(form, 'manual product form missing inside open details').toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(nameField).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(nameField).toBeEnabled();
  await expect(nameField).toBeFocused({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(form.locator('input[name="sku"]')).toBeVisible();
  await expect(form.getByRole('button', { name: /Create product/i })).toBeVisible();
  assertManualEntryFormNotTrapped({
    detailsOpen: true,
    formVisible: true,
    nameFieldVisible: true,
    summaryClicked: false,
  });
  const emptyVisible =
    (await page.getByText('No products yet.', { exact: true }).locator('visible=true').count()) > 0;
  if (emptyVisible) {
    await expect(form).toBeVisible();
    await expect(nameField).toBeVisible();
    await expect(nameField).toBeEnabled();
  }
  return form;
}

export async function openManualProductEntryFromOnboarding(page: Page) {
  throw new Error(
    'Catalogue gate blocked at manual entry: onboarding button proof moved to reliability-onboarding-manual. Direct /products#product-create is not valid evidence.',
  );
}

export async function proveDirectProductCreateHash(page: Page) {
  await page.goto('/products#product-create', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await proveProductCreateHashOpenedForm(page);
}

export async function proveProductCreateHashChangeAfterLoad(page: Page) {
  await page.goto('/products', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const details = await productCreateDetails(page);
  await expect(details).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(details).not.toHaveAttribute('open');
  await clickUniqueVisible(
    page.getByRole('link', { name: 'Add product', exact: true }),
    'products Add product hash',
  );
  await proveProductCreateHashOpenedForm(page);
}

async function fillManualEntryProductForm(page: Page) {
  const form = await proveProductCreateHashOpenedForm(page);
  const product = RELIABILITY_MANUAL_ENTRY_PRODUCT;
  await fillUniqueVisible(form.locator('input[name="name"]'), product.name, 'manual entry name');
  await fillUniqueVisible(form.locator('input[name="sku"]'), product.sku, 'manual entry sku');
  await fillUniqueVisible(
    form.locator('input[name="barcode"]'),
    product.barcode,
    'manual entry barcode',
  );
  await fillUniqueVisible(
    form.locator('input[name="sellingPriceBasePence"]'),
    product.sellingPrice,
    'manual entry price',
  );
  await fillUniqueVisible(
    form.locator('input[name="defaultCostBasePence"]'),
    product.defaultCost,
    'manual entry cost',
  );
  await form.getByRole('button', { name: /Create product/i }).click({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

export async function runManualProductEntryGate(
  page: Page,
  fetchSnapshot: () => Promise<CatalogueSnapshotLike>,
) {
  await openManualProductEntryFromOnboarding(page);
  await proveDirectProductCreateHash(page);
  await proveProductCreateHashChangeAfterLoad(page);

  await gotoQaProductList(page, RELIABILITY_MANUAL_ENTRY_PRODUCT);
  const { presence, tableRowCount } = await resolveQaProductOnList(
    page,
    RELIABILITY_MANUAL_ENTRY_PRODUCT,
  );
  const verdict = classifyManualEntrySubmit(tableRowCount);
  if (verdict.decision === 'fail') {
    throw new Error(`Catalogue gate blocked at manual entry: ${verdict.reason}`);
  }
  if (verdict.decision === 'create' || presence === 'missing') {
    await page.goto('/products#product-create', {
      waitUntil: 'domcontentloaded',
      timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
    });
    await fillManualEntryProductForm(page);
    await gotoQaProductList(page, RELIABILITY_MANUAL_ENTRY_PRODUCT);
  }
  await expectUniqueQaProductRowVisible(page, RELIABILITY_MANUAL_ENTRY_PRODUCT);
  await expect
    .poll(
      async () => {
        try {
          const persisted = await fetchSnapshot();
          assertPersistedManualEntry({ products: persisted.manualEntryProducts ?? [] });
          return 'persisted';
        } catch {
          return 'pending';
        }
      },
      { timeout: 15_000 },
    )
    .toBe('persisted');
  return verdict.decision;
}
