/**
 * Reliability QA product identity: create-or-reuse by exact visible table row
 * (name) + unique /products/{id} href. Never by hidden responsive card links.
 * Catalogue list has no SKU column — empty SKU/barcode must still reuse by name.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import {
  RELIABILITY_ACTION_TIMEOUT_MS,
  RELIABILITY_NAVIGATION_TIMEOUT_MS,
  fillUniqueVisible,
} from './preview-qa-locators';

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
  // SKU match is optional: catalogue rows often omit SKU entirely.
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

export function duplicateQaProductHrefMessage(identity: QaProductIdentity, hrefs: string[]) {
  return (
    `Phase 9 blocked at product: ${hrefs.length} distinct record hrefs for QA identity ` +
    `${identity.name}: ${hrefs.join(', ')}. Genuine duplicates — do not pick a visible one.`
  );
}

export function assertUniqueQaProductPresence(tableRowCount: number, identity: QaProductIdentity) {
  const presence = classifyQaProductPresence(tableRowCount);
  if (presence === 'duplicate') {
    throw new Error(duplicateQaProductMessage(identity, tableRowCount));
  }
  return presence;
}

export function parseQaProductRecordId(href: string | null): string | null {
  if (!href) return null;
  const match = href.match(/\/products\/([^/?#]+)/);
  if (!match?.[1] || match[1] === 'new' || match[1] === 'labels') return null;
  return match[1];
}

/** Table rows that contain the exact product-name link (not hidden card links). */
export function qaProductTableRows(page: Page, identity: QaProductIdentity): Locator {
  return page.getByRole('table').getByRole('row').filter({
    has: page.getByRole('link', { name: identity.name, exact: true }),
  });
}

/** Visible-only table rows — ignore any non-visible table copies. */
export function qaProductVisibleTableRows(page: Page, identity: QaProductIdentity): Locator {
  return qaProductTableRows(page, identity).locator('visible=true');
}

/** Visible table-cell product link. Do not assert the first name text node. */
export function qaProductTableLink(page: Page, identity: QaProductIdentity): Locator {
  return page.getByRole('table').getByRole('link', { name: identity.name, exact: true });
}

export function qaProductVisibleTableLink(page: Page, identity: QaProductIdentity): Locator {
  return qaProductTableLink(page, identity).locator('visible=true');
}

export function qaProductCreateDetails(page: Page): Locator {
  return page.locator('details').filter({ has: page.locator('summary#product-create') });
}

export async function collectQaProductRecordHrefs(
  page: Page,
  identity: QaProductIdentity,
): Promise<string[]> {
  return qaProductVisibleTableLink(page, identity).evaluateAll((nodes) => [
    ...new Set(
      nodes
        .map((node) => (node instanceof HTMLAnchorElement ? node.getAttribute('href') : null))
        .map((href) => href?.split('#')[0] ?? '')
        .filter(Boolean),
    ),
  ]);
}

export function assertUniqueQaProductRecordHrefs(hrefs: string[], identity: QaProductIdentity) {
  const ids = [
    ...new Set(hrefs.map((href) => parseQaProductRecordId(href)).filter(Boolean)),
  ] as string[];
  if (ids.length > 1) {
    throw new Error(duplicateQaProductHrefMessage(identity, hrefs));
  }
  return ids[0] ?? null;
}

export async function resolveQaProductOnList(page: Page, identity: QaProductIdentity) {
  const rows = qaProductVisibleTableRows(page, identity);
  const tableRowCount = await rows.count();
  const presence = assertUniqueQaProductPresence(tableRowCount, identity);
  const hrefs = presence === 'reuse' ? await collectQaProductRecordHrefs(page, identity) : [];
  if (presence === 'reuse') {
    assertUniqueQaProductRecordHrefs(hrefs, identity);
  }
  return { presence, tableRowCount, rows, hrefs };
}

export async function gotoQaProductList(page: Page, identity: QaProductIdentity) {
  const q = encodeURIComponent(identity.name);
  await page.goto(`/products?tab=products&q=${q}`, {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page).toHaveURL(/\/products/);
}

export async function expectUniqueQaProductRowVisible(
  page: Page,
  identity: QaProductIdentity,
  timeout = 30_000,
) {
  const rows = qaProductVisibleTableRows(page, identity);
  await expect
    .poll(async () => rows.count(), {
      timeout,
      message: `QA product visible table row for ${identity.name} (SKU optional on list)`,
    })
    .toBeGreaterThan(0);
  const tableRowCount = await rows.count();
  const presence = assertUniqueQaProductPresence(tableRowCount, identity);
  if (presence !== 'reuse') {
    throw new Error(
      `Phase 9 blocked at product: expected one visible table row for ${identity.name}, found ${tableRowCount}.`,
    );
  }
  const hrefs = await collectQaProductRecordHrefs(page, identity);
  assertUniqueQaProductRecordHrefs(hrefs, identity);
  await expect(rows, `QA product table row for ${identity.name}`).toBeVisible({ timeout });
  await expect(
    qaProductVisibleTableLink(page, identity),
    `QA product table link for ${identity.name}`,
  ).toBeVisible({ timeout });
}

/**
 * Open create only when needed. Do not assert heading "Add product"
 * (that h2 lives inside a closed <details>; hash #product-create only scrolls).
 * Labels lack htmlFor — assert named controls inside the opened details form.
 */
export async function openSellableQaProductCreateForm(page: Page) {
  await expect(page).toHaveURL(/\/products(?:\?|#|$)/);
  const details = qaProductCreateDetails(page);
  await expect(details.locator('summary#product-create')).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  const alreadyOpen = (await details.getAttribute('open')) !== null;
  if (!alreadyOpen) {
    await details.locator('summary#product-create').click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  }
  await expect(details).toHaveAttribute('open', '');
  const form = details.locator('form');
  await expect(form.locator('input[name="name"]')).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(form.locator('input[name="sku"]')).toBeVisible();
  await expect(form.locator('input[name="barcode"]')).toBeVisible();
  await expect(form.locator('input[name="sellingPriceBasePence"]')).toBeVisible();
  await expect(form.locator('input[name="defaultCostBasePence"]')).toBeVisible();
  await expect(form.getByRole('button', { name: /Create product/i })).toBeVisible();
  await expect(form.locator('label', { hasText: /^Name$/ })).toBeVisible();
  await expect(form.locator('label', { hasText: /^SKU$/ })).toBeVisible();
  return form;
}

export async function fillSellableQaProductForm(
  page: Page,
  product: typeof RELIABILITY_SELLABLE_PRODUCT = RELIABILITY_SELLABLE_PRODUCT,
) {
  const form = await openSellableQaProductCreateForm(page);
  await fillUniqueVisible(form.locator('input[name="name"]'), product.name, 'create product name');
  await fillUniqueVisible(form.locator('input[name="sku"]'), product.sku, 'create product sku');
  await fillUniqueVisible(
    form.locator('input[name="barcode"]'),
    product.barcode,
    'create product barcode',
  );
  await fillUniqueVisible(
    form.locator('input[name="sellingPriceBasePence"]'),
    product.sellingPrice,
    'create product price',
  );
  await fillUniqueVisible(
    form.locator('input[name="defaultCostBasePence"]'),
    product.defaultCost,
    'create product cost',
  );
  await form.getByRole('button', { name: /Create product/i }).click({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

/**
 * Reuse the single visible table row named "Reliability SKU" (+ unique /products/{id}).
 * Do not treat missing REL-SKU-1 text as a missing product. Create only when no row.
 */
export async function ensureSellableQaProduct(page: Page) {
  const identity = RELIABILITY_SELLABLE_PRODUCT;
  await gotoQaProductList(page, identity);
  const { presence } = await resolveQaProductOnList(page, identity);
  if (presence === 'missing') {
    await fillSellableQaProductForm(page, identity);
    await gotoQaProductList(page, identity);
  }
  await expectUniqueQaProductRowVisible(page, identity);
}

export async function ensureImportedQaProduct(page: Page, importOnce: () => Promise<void>) {
  const identity = RELIABILITY_IMPORT_PRODUCT;
  await gotoQaProductList(page, identity);
  const { presence } = await resolveQaProductOnList(page, identity);
  if (presence === 'missing') {
    await importOnce();
    await gotoQaProductList(page, identity);
  }
  await expectUniqueQaProductRowVisible(page, identity);
}
