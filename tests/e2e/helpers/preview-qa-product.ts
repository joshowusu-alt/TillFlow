/**
 * Reliability QA product identity: create-or-reuse by stable SKU, never by
 * hidden responsive name links. Desktop /products renders the same product as
 * a hidden card <a class="truncate hover:underline"> (lg:hidden) and a visible
 * table row. Playwright retries of that hidden link are not extra products.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export const RELIABILITY_SELLABLE_PRODUCT = {
  name: 'Reliability SKU',
  sku: 'REL-SKU-1',
  barcode: 'RELSKU1',
  sellingPrice: '5.00',
  defaultCost: '2.00',
} as const;

export const RELIABILITY_IMPORT_PRODUCT = {
  name: 'Reliability Import SKU',
  sku: 'REL-IMP-1',
  barcode: 'RELIMP1',
} as const;

export type QaProductIdentity = {
  name: string;
  sku: string;
};

export type QaProductPresence = 'missing' | 'reuse' | 'duplicate';

export type QaProductDomHit = {
  role: 'row' | 'link';
  inTable: boolean;
  visible: boolean;
  accessibleName: string;
};

export type QaProductHitCounts = {
  tableRowCount: number;
  hiddenLinkCount: number;
  visibleTableLinkCount: number;
};

function matchesQaIdentity(text: string, identity: QaProductIdentity) {
  const haystack = text.trim();
  if (!haystack) return false;
  if (identity.sku && haystack.includes(identity.sku)) return true;
  if (haystack === identity.name) return true;
  if (!haystack.startsWith(identity.name)) return false;
  const remainder = haystack.slice(identity.name.length).trimStart();
  // Row cells follow the name (price/currency). Reject longer names that share a prefix.
  return remainder === '' || /^(GH₵|GHS|£|\$|€|\d)/.test(remainder);
}

/** Count genuine table rows separately from hidden responsive name links. */
export function countQaProductIdentityHits(
  hits: QaProductDomHit[],
  identity: QaProductIdentity,
): QaProductHitCounts {
  const matches = hits.filter((hit) => matchesQaIdentity(hit.accessibleName, identity));
  return {
    tableRowCount: matches.filter((hit) => hit.role === 'row' && hit.inTable).length,
    hiddenLinkCount: matches.filter((hit) => hit.role === 'link' && !hit.visible).length,
    visibleTableLinkCount: matches.filter(
      (hit) => hit.role === 'link' && hit.inTable && hit.visible,
    ).length,
  };
}

export function classifyQaProductPresence(tableRowCount: number): QaProductPresence {
  if (tableRowCount <= 0) return 'missing';
  if (tableRowCount === 1) return 'reuse';
  return 'duplicate';
}

export function duplicateQaProductMessage(identity: QaProductIdentity, tableRowCount: number) {
  return (
    `Phase 9 blocked at product: ${tableRowCount} table rows share QA identity ` +
    `${identity.name} / ${identity.sku}. Genuine duplicates — do not pick a visible one.`
  );
}

export function assertUniqueQaProductPresence(tableRowCount: number, identity: QaProductIdentity) {
  const presence = classifyQaProductPresence(tableRowCount);
  if (presence === 'duplicate') {
    throw new Error(duplicateQaProductMessage(identity, tableRowCount));
  }
  return presence;
}

/** Table rows that contain the exact product-name link (not hidden card links). */
export function qaProductTableRows(page: Page, identity: QaProductIdentity): Locator {
  return page.getByRole('table').getByRole('row').filter({
    has: page.getByRole('link', { name: identity.name, exact: true }),
  });
}

/** Visible table-cell product link. Do not assert the first name text node. */
export function qaProductTableLink(page: Page, identity: QaProductIdentity): Locator {
  return page.getByRole('table').getByRole('link', { name: identity.name, exact: true });
}

export async function resolveQaProductOnList(page: Page, identity: QaProductIdentity) {
  const rows = qaProductTableRows(page, identity);
  const tableRowCount = await rows.count();
  const presence = assertUniqueQaProductPresence(tableRowCount, identity);
  return { presence, tableRowCount, rows };
}

export async function expectUniqueQaProductRowVisible(
  page: Page,
  identity: QaProductIdentity,
  timeout = 30_000,
) {
  const rows = qaProductTableRows(page, identity);
  await expect
    .poll(async () => rows.count(), {
      timeout,
      message: `QA product table row for ${identity.name} / ${identity.sku}`,
    })
    .toBeGreaterThan(0);
  const tableRowCount = await rows.count();
  const presence = assertUniqueQaProductPresence(tableRowCount, identity);
  if (presence !== 'reuse') {
    throw new Error(
      `Phase 9 blocked at product: expected one visible table row for ${identity.name} / ${identity.sku}, found ${tableRowCount}.`,
    );
  }
  await expect(rows, `QA product table row for ${identity.name}`).toBeVisible({ timeout });
  await expect(
    qaProductTableLink(page, identity),
    `QA product table link for ${identity.name}`,
  ).toBeVisible({ timeout });
}

export async function fillSellableQaProductForm(
  page: Page,
  product: typeof RELIABILITY_SELLABLE_PRODUCT = RELIABILITY_SELLABLE_PRODUCT,
) {
  await page.locator('input[name="name"]').first().fill(product.name);
  await page.locator('input[name="sku"]').first().fill(product.sku);
  await page.locator('input[name="barcode"]').first().fill(product.barcode);
  await page.locator('input[name="sellingPriceBasePence"]').fill(product.sellingPrice);
  await page.locator('input[name="defaultCostBasePence"]').fill(product.defaultCost);
  await page.getByRole('button', { name: /Create product/i }).click();
}

/**
 * Create the sellable QA product once with REL-SKU-1 / RELSKU1, or reuse the
 * single existing table row (name or SKU). Fails on genuine duplicate rows.
 */
export async function ensureSellableQaProduct(page: Page) {
  const identity = RELIABILITY_SELLABLE_PRODUCT;
  const { presence } = await resolveQaProductOnList(page, identity);
  if (presence === 'missing') {
    await fillSellableQaProductForm(page, identity);
  }
  await expectUniqueQaProductRowVisible(page, identity);
}

export async function ensureImportedQaProduct(page: Page, importOnce: () => Promise<void>) {
  const identity = RELIABILITY_IMPORT_PRODUCT;
  const { presence } = await resolveQaProductOnList(page, identity);
  if (presence === 'missing') {
    await importOnce();
    await page.goto('/products', { waitUntil: 'domcontentloaded' });
  }
  await expectUniqueQaProductRowVisible(page, identity);
}
