/**
 * Catalogue/import/opening-stock helpers for the Preview reliability gate.
 *
 * Manual import (owner defect): always open the onboarding/settings entry,
 * choose Product catalogue, attach REL-IMP-P104-01 CSV, parse, preview, then
 * submit or resume from persisted ProductImport evidence. Visiting the page
 * without a CSV is not a pass.
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
  expectUniqueQaProductRowVisible,
  gotoQaProductList,
} from './preview-qa-product';
import {
  assertRerunDecision,
  classifyOpeningStockRerun,
} from '../../../lib/reliability/rerun-idempotency';
import {
  IMPORT_BLOCKING_COPY,
  MANUAL_IMPORT_GATE_CSV_FILENAME,
  RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT,
  assertManualImportPreviewGate,
  assertPersistedManualImport,
  assertPersistedOpeningStock,
  classifyManualImportSubmit,
  manualImportGateCsv,
} from '../../../lib/reliability/manual-import-gate';

export { IMPORT_BLOCKING_COPY };
export const IMPORT_STOCK_PATH = '/settings/import-stock';

export type CatalogueFinancialFingerprint = {
  invoiceCount: number;
  expenseCount: number;
  cashSaleDrawerCount: number;
  paymentCount: number;
};

export type CatalogueSnapshotLike = {
  invoices?: Array<{
    drawer?: Array<{ entryType?: string | null }>;
    payments?: unknown[];
  }>;
  expenses?: unknown[];
  productCount?: number;
  openingCapitalPence?: number;
  openingMovements?: Array<{
    storeId?: string | null;
    productId?: string | null;
    productName?: string;
    productSku?: string;
    qtyBase: number;
    type?: string;
    referenceType?: string | null;
  }>;
  openingJournals?: Array<{ referenceType?: string | null }>;
  productImports?: Array<{
    fileName?: string | null;
    status?: string | null;
    rowsParsed?: number;
    rowsImported?: number;
  }>;
  gateProducts?: Array<{ id?: string; name?: string; sku?: string | null }>;
  moneyIdempotency?: Array<{ commandKind?: string | null }>;
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
    paymentCount: invoices.reduce((n, invoice) => n + (invoice.payments ?? []).length, 0),
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
  if (after.paymentCount !== before.paymentCount) {
    throw new Error(
      `Catalogue gate blocked: payment count ${before.paymentCount} → ${after.paymentCount}. Sales payments are forbidden.`,
    );
  }
}

export async function collectVisibleBlockingCopy(page: Page) {
  const checks: Array<{ copy: string; exact?: boolean }> = [
    { copy: IMPORT_BLOCKING_COPY.noProductsYet, exact: true },
    { copy: IMPORT_BLOCKING_COPY.noProductRows },
    { copy: IMPORT_BLOCKING_COPY.noReadyRows },
  ];
  const visible: string[] = [];
  for (const check of checks) {
    const count = await page
      .getByText(check.copy, check.exact ? { exact: true } : undefined)
      .locator('visible=true')
      .count();
    if (count > 0) visible.push(check.copy);
  }
  return visible;
}

export async function assertImportBlockingStatesAbsent(page: Page, step: string) {
  const visible = await collectVisibleBlockingCopy(page);
  if (visible.length > 0) {
    throw new Error(
      `Phase 9 blocked at ${step}: visible blocking copy ${JSON.stringify(visible)}`,
    );
  }
}

/**
 * Journey helper: land on import-stock and select Product catalogue.
 * Catalogue gate uses openManualImportEntryPoint + attachManualImportGateCsv instead.
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
  await clickUniqueVisible(
    page.getByRole('button', { name: 'Product catalogue', exact: true }),
    'import Product catalogue',
  );
  await expect(page.getByTestId('import-stock-file-input')).toBeAttached();
}

export async function openManualImportEntryPoint(page: Page) {
  await page.goto('/onboarding', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const onboardingImport = page.getByRole('link', { name: 'Import products', exact: true });
  if ((await onboardingImport.locator('visible=true').count()) === 1) {
    await clickUniqueVisible(onboardingImport, 'onboarding Import products');
  } else {
    await page.goto('/settings', {
      waitUntil: 'domcontentloaded',
      timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
    });
    await clickUniqueVisible(
      page.locator('a.btn-secondary[href="/settings/import-stock"]'),
      'settings Import Stock',
    );
  }
  await expect(page).toHaveURL(/\/settings\/import-stock/);
  await expect(page.getByRole('heading', { name: 'Import Stock' })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: 'What are you importing?' })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await clickUniqueVisible(
    page.getByRole('button', { name: 'Product catalogue', exact: true }),
    'import Product catalogue',
  );
  await expect(page.getByTestId('import-stock-file-input')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Product catalogue', exact: true })).toBeVisible();
}

export async function attachManualImportGateCsv(page: Page) {
  await page.getByTestId('import-stock-file-input').setInputFiles({
    name: MANUAL_IMPORT_GATE_CSV_FILENAME,
    mimeType: 'text/csv',
    buffer: Buffer.from(manualImportGateCsv(), 'utf8'),
  });
}

export async function proveManualImportPreview(page: Page) {
  await expect(page.getByTestId('import-stock-purpose')).toContainText('Product catalogue', {
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(page.getByTestId('import-stock-accepted-file')).toHaveText(
    `File: ${MANUAL_IMPORT_GATE_CSV_FILENAME}`,
    { timeout: RELIABILITY_ACTION_TIMEOUT_MS },
  );
  await expect(page.getByTestId('import-stock-ready-count')).toHaveText('Ready 1', {
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(
    page.getByRole('table').getByText(RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.name, { exact: true }),
  ).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(
    page.getByRole('table').getByText(RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT.sku, { exact: true }),
  ).toBeVisible();
  const confirm = page.getByRole('button', { name: /Confirm Import/i });
  await expect(confirm, 'import preview did not offer Confirm Import').toBeEnabled({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  const parseError = page.getByText(IMPORT_BLOCKING_COPY.noProductRows);
  assertManualImportPreviewGate({
    uploadedCsv: true,
    fileNameAccepted: true,
    fileName: MANUAL_IMPORT_GATE_CSV_FILENAME,
    mode: 'CATALOGUE',
    parsedRowCount: 1,
    readyRowCount: 1,
    confirmEnabled: true,
    identityVisible: true,
    visibleBlockingCopy: await collectVisibleBlockingCopy(page),
    parseError: (await parseError.locator('visible=true').count()) > 0
      ? IMPORT_BLOCKING_COPY.noProductRows
      : null,
  });
  return confirm;
}

export async function runManualImportGate(
  page: Page,
  fetchSnapshot: () => Promise<CatalogueSnapshotLike>,
) {
  await openManualImportEntryPoint(page);
  await attachManualImportGateCsv(page);
  const confirm = await proveManualImportPreview(page);
  const snapshot = await fetchSnapshot();
  const verdict = classifyManualImportSubmit({
    tableRowCount: snapshot.gateProducts?.length ?? 0,
    uploadedCsv: true,
    parsedRowCount: 1,
    importRuns: snapshot.productImports ?? [],
  });
  if (verdict.decision === 'fail') {
    throw new Error(`Catalogue gate blocked at import: ${verdict.reason}`);
  }
  if (verdict.decision === 'create') {
    await confirm.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
    await expect(page.getByRole('heading', { name: 'Import complete!' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('Products imported')).toBeVisible();
    await assertImportBlockingStatesAbsent(page, 'import complete');
  }
  await gotoQaProductList(page, RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT);
  await expectUniqueQaProductRowVisible(page, RELIABILITY_MANUAL_IMPORT_GATE_PRODUCT);
  await expect
    .poll(
      async () => {
        try {
          const persisted = await fetchSnapshot();
          assertPersistedManualImport({
            gateProducts: persisted.gateProducts ?? [],
            importRuns: persisted.productImports ?? [],
          });
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
}

function qaOpeningHits(snapshot: CatalogueSnapshotLike) {
  return (snapshot.openingMovements ?? []).map((row) => ({
    productMatchesQa:
      row.productName === RELIABILITY_SELLABLE_PRODUCT.name ||
      row.productSku === RELIABILITY_SELLABLE_PRODUCT.sku,
    storeId: row.storeId,
    productId: row.productId,
    qtyBase: row.qtyBase,
    type: row.type,
    referenceType: row.referenceType,
  }));
}

export function assertCatalogueOpeningStockPersisted(snapshot: CatalogueSnapshotLike) {
  assertPersistedOpeningStock({
    movements: qaOpeningHits(snapshot),
    openingJournals: snapshot.openingJournals ?? [],
    openingCapitalPence: snapshot.openingCapitalPence ?? 0,
  });
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
      movements: qaOpeningHits(snapshot),
      openingCapitalPence: snapshot.openingCapitalPence ?? 0,
    }),
  );
  if (openingDecision === 'create') {
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
    await expect.poll(async () => {
      try {
        assertCatalogueOpeningStockPersisted(await fetchSnapshot());
        return 'persisted';
      } catch {
        return 'pending';
      }
    }, { timeout: 15_000 }).toBe('persisted');
  }
  assertCatalogueOpeningStockPersisted(await fetchSnapshot());
  return openingDecision;
}
