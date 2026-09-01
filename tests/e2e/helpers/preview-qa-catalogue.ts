/**
 * Catalogue/import/opening-stock helpers for the Preview reliability gate.
 * Always enter the original /settings/import-stock route. Never treat
 * "another product already exists" or a template download as import success.
 */
import { expect, type Page } from '@playwright/test';
import {
  RELIABILITY_ACTION_TIMEOUT_MS,
  RELIABILITY_NAVIGATION_TIMEOUT_MS,
  clickUniqueVisible,
  selectUniqueVisible,
} from './preview-qa-locators';
import {
  RELIABILITY_IMPORT_PRODUCT,
  RELIABILITY_SELLABLE_PRODUCT,
} from './preview-qa-product';
import {
  assertRerunDecision,
  classifyOpeningStockRerun,
} from '../../../lib/reliability/rerun-idempotency';

export const IMPORT_STOCK_PATH = '/settings/import-stock';

export const IMPORT_BLOCKING_COPY = {
  noProductsYet: 'No products yet.',
  noProductRows: 'The file had no product rows. Check the file and try again.',
  noReadyRows: 'No ready rows to import.',
} as const;

export type CatalogueFinancialFingerprint = {
  invoiceCount: number;
  expenseCount: number;
  cashSaleDrawerCount: number;
};

export type CatalogueSnapshotLike = {
  invoices?: Array<{
    drawer?: Array<{ entryType?: string | null }>;
  }>;
  expenses?: unknown[];
  productCount?: number;
  openingCapitalPence?: number;
  openingMovements?: Array<{
    productName?: string;
    productSku?: string;
    qtyBase: number;
    type?: string;
    referenceType?: string | null;
  }>;
};

export function catalogueFinancialFingerprint(
  snapshot: CatalogueSnapshotLike,
): CatalogueFinancialFingerprint {
  const invoices = snapshot.invoices ?? [];
  return {
    invoiceCount: invoices.length,
    expenseCount: (snapshot.expenses ?? []).length,
    cashSaleDrawerCount: invoices.reduce(
      (n, invoice) =>
        n +
        (invoice.drawer ?? []).filter((row) => (row.entryType ?? '').toUpperCase() === 'CASH_SALE')
          .length,
      0,
    ),
  };
}

export function assertCatalogueDidNotWriteMoney(
  before: CatalogueFinancialFingerprint,
  after: CatalogueFinancialFingerprint,
) {
  if (after.invoiceCount !== before.invoiceCount) {
    throw new Error(
      `Catalogue gate blocked: invoice count ${before.invoiceCount} → ${after.invoiceCount}. Sales are forbidden.`,
    );
  }
  if (after.expenseCount !== before.expenseCount) {
    throw new Error(
      `Catalogue gate blocked: expense count ${before.expenseCount} → ${after.expenseCount}. Expenses are forbidden.`,
    );
  }
  if (after.cashSaleDrawerCount !== before.cashSaleDrawerCount) {
    throw new Error(
      `Catalogue gate blocked: CASH_SALE drawer ${before.cashSaleDrawerCount} → ${after.cashSaleDrawerCount}. Drawer writes are forbidden.`,
    );
  }
}

export async function assertImportBlockingStatesAbsent(page: Page, step: string) {
  const checks: Array<{ copy: string; exact?: boolean }> = [
    { copy: IMPORT_BLOCKING_COPY.noProductsYet, exact: true },
    { copy: IMPORT_BLOCKING_COPY.noProductRows },
    { copy: IMPORT_BLOCKING_COPY.noReadyRows },
  ];
  for (const check of checks) {
    const visible = page
      .getByText(check.copy, check.exact ? { exact: true } : undefined)
      .locator('visible=true');
    const count = await visible.count();
    if (count > 0) {
      throw new Error(`Phase 9 blocked at ${step}: visible blocking copy ${JSON.stringify(check.copy)}`);
    }
  }
}

/**
 * Exact owner-reported manual-import path. Must run every catalogue/journey
 * import step. Does not download a template and does not skip because
 * Reliability SKU already exists.
 */
export async function enterManualImportRoute(page: Page) {
  await page.goto(IMPORT_STOCK_PATH, {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page).toHaveURL(/\/settings\/import-stock/);
  await expect(page.getByRole('heading', { name: 'Import Stock' })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: 'What are you importing?' })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await assertImportBlockingStatesAbsent(page, 'import-stock landing');
  await clickUniqueVisible(
    page.getByRole('button', { name: 'Product catalogue', exact: true }),
    'import Product catalogue',
  );
  await expect(page.getByTestId('import-stock-file-input')).toBeAttached();
  await assertImportBlockingStatesAbsent(page, 'import Product catalogue');
}

export function reliabilityImportCsv() {
  return [
    'name,sku,barcode,category,selling_price,cost_price,base_unit,pack_unit,pack_size,supplier_name,reorder_point,storefront_published,image_url,notes',
    `${RELIABILITY_IMPORT_PRODUCT.name},${RELIABILITY_IMPORT_PRODUCT.sku},${RELIABILITY_IMPORT_PRODUCT.barcode},Drinks,4.00,2.00,Piece,,,,,yes,,`,
  ].join('\r\n');
}

export async function confirmReliabilityImportCsv(page: Page) {
  await page.getByTestId('import-stock-file-input').setInputFiles({
    name: 'reliability-catalogue.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(reliabilityImportCsv(), 'utf8'),
  });
  const confirm = page.getByRole('button', { name: /Confirm Import/i });
  await expect(confirm, 'import preview did not offer Confirm Import').toBeEnabled({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await confirm.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Import complete!' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Products imported')).toBeVisible();
  await assertImportBlockingStatesAbsent(page, 'import complete');
}

export async function ensureQaOpeningStock(
  page: Page,
  fetchSnapshot: () => Promise<CatalogueSnapshotLike>,
) {
  await page.goto('/setup/opening-stock', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const snapshot = await fetchSnapshot();
  const openingDecision = assertRerunDecision(
    'opening stock',
    classifyOpeningStockRerun({
      movements: (snapshot.openingMovements ?? []).map((row) => ({
        productMatchesQa:
          row.productName === RELIABILITY_SELLABLE_PRODUCT.name ||
          row.productSku === RELIABILITY_SELLABLE_PRODUCT.sku,
        qtyBase: row.qtyBase,
        type: row.type,
        referenceType: row.referenceType,
      })),
      openingCapitalPence: snapshot.openingCapitalPence ?? 0,
    }),
  );
  if (openingDecision === 'skip') return 'skip';
  if (await page.getByRole('heading', { name: 'Opening capital recorded!' }).isVisible().catch(() => false)) {
    return 'skip';
  }
  await clickUniqueVisible(page.getByRole('button', { name: '+ Add stock item' }), 'opening stock add');
  await selectUniqueVisible(
    page.getByRole('combobox', { name: 'Product' }),
    { label: RELIABILITY_SELLABLE_PRODUCT.name },
    'opening stock product',
  );
  await clickUniqueVisible(
    page.getByRole('button', { name: /Save Opening Capital/i }),
    'opening stock save',
  );
  await expect(page.getByRole('heading', { name: 'Opening capital recorded!' })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  return 'create';
}
