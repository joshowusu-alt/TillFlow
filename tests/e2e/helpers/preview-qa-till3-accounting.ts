/**
 * Preview-only Till 3 accounting Playwright helper.
 * One split sale on existing Till 3. Never Production. Never auto-retry money.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import {
  getBaseUrl,
  isProductionPlaywrightTarget,
  reliabilitySalesAllowed,
} from './env';
import {
  PreviewQaOwnerBlockedError,
  assertPreviewQaOwnerTarget,
  classifyTill3ShiftState,
  shouldAddNamedTill,
} from './preview-qa-owner';
import {
  RELIABILITY_ACTION_TIMEOUT_MS,
  RELIABILITY_NAVIGATION_TIMEOUT_MS,
  clickUniqueVisible,
  fillUniqueVisible,
  requireExactlyOneVisible,
  selectUniqueVisible,
  till3OpenSelect,
} from './preview-qa-locators';
import { RELIABILITY_SELLABLE_PRODUCT } from './preview-qa-product';
import {
  TILL3_ACCOUNTING_OPEN_FLOAT_PENCE,
  TILL3_ACCOUNTING_REFS,
  TILL3_ACCOUNTING_SPLIT,
  TILL3_ACCOUNTING_TILL_NAME,
  assertTill3AccountingPersisted,
  formatTill3AccountingTable,
  paymentHits,
  type Till3AccountingSnapshot,
} from '../../../lib/reliability/till3-accounting-gate';
import {
  assertRerunDecision,
  classifyTenderRef,
  classifyTill3DrawerOpenRerun,
} from '../../../lib/reliability/rerun-idempotency';

function blocked(detail: string): never {
  throw new Error(`Till 3 accounting gate blocked: ${detail}`);
}

export async function requireTill3AccountingSalesAllowed() {
  if (!reliabilitySalesAllowed()) {
    blocked(
      'set PLAYWRIGHT_ALLOW_QA_SALE=true and PLAYWRIGHT_QA_TENANT_CONFIRMED=true (never Production).',
    );
  }
}

export async function confirmTill3AccountingPreviewSha(page: Page) {
  if (isProductionPlaywrightTarget()) {
    blocked('reliability-till3-accounting cannot run against Production.');
  }
  const res = await page.request.get('/api/qa/deploy-sha');
  const body = res.ok()
    ? ((await res.json()) as { sha?: string | null; vercelEnv?: string | null })
    : {};
  assertPreviewQaOwnerTarget({
    baseURL: getBaseUrl(),
    expectedSha: process.env.RELIABILITY_EXPECTED_SHA?.trim() || undefined,
    identity: {
      sha: body.sha ?? null,
      vercelEnv: body.vercelEnv ?? null,
      httpStatus: res.status(),
    },
  });
  return body;
}

export async function fetchTill3AccountingSnapshot(page: Page): Promise<Till3AccountingSnapshot> {
  const snapshot = await page.request.get('/api/qa/reliability-snapshot');
  if (!snapshot.ok()) blocked(`reliability-snapshot HTTP ${snapshot.status()}`);
  return snapshot.json();
}

export async function ensureTill3Exists(page: Page) {
  await page.goto('/settings?section=tills', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByText('Till Management')).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  const tillLabels = (
    await Promise.all(
      ['Till 1', 'Till 2', TILL3_ACCOUNTING_TILL_NAME].map(async (name) =>
        (await page.getByText(name, { exact: true }).count()) > 0 ? name : '',
      ),
    )
  ).filter(Boolean);
  if (shouldAddNamedTill(tillLabels, TILL3_ACCOUNTING_TILL_NAME)) {
    await page.getByPlaceholder(/New till name e\.g\. Till 3/i).fill(TILL3_ACCOUNTING_TILL_NAME);
    await page.getByRole('button', { name: /Add till/i }).click();
  }
  await expect(page.getByText(TILL3_ACCOUNTING_TILL_NAME, { exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

export async function openTill3ShiftForAccounting(page: Page) {
  await page.goto('/shifts', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const shiftState = classifyTill3ShiftState({
    shiftActiveVisible: await page.getByText('Shift Active', { exact: true }).isVisible().catch(() => false),
    till3Visible: await page
      .getByRole('heading', { name: TILL3_ACCOUNTING_TILL_NAME, exact: true })
      .isVisible()
      .catch(() => false),
  });
  const openDecision = assertRerunDecision(
    'open Till 3',
    classifyTill3DrawerOpenRerun({
      shiftState,
      needsOpenShift: true,
    }),
  );
  if (openDecision === 'create') {
    await selectUniqueVisible(till3OpenSelect(page), { label: TILL3_ACCOUNTING_TILL_NAME }, 'open Till 3');
    await fillUniqueVisible(
      page.getByLabel(/Opening Cash/i),
      String(TILL3_ACCOUNTING_OPEN_FLOAT_PENCE / 100),
      'open Till 3 float',
    );
    await clickUniqueVisible(page.getByRole('button', { name: /Open Shift/i }), 'open Till 3');
  }
  await expect(page.getByText('Shift Active', { exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: TILL3_ACCOUNTING_TILL_NAME, exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

async function selectTill3(locator: Locator, step: string) {
  const target = await requireExactlyOneVisible(locator, step);
  const till3 = target.locator('option', { hasText: new RegExp(`^${TILL3_ACCOUNTING_TILL_NAME}$`) });
  if ((await till3.count()) !== 1) blocked(`${step}: Till 3 option is missing or duplicated.`);
  const value = await till3.getAttribute('value');
  if (!value) blocked(`${step}: Till 3 is not an option on the till selector.`);
  await target.selectOption(value, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
}

async function clearRestoredCart(page: Page) {
  const clear = page.getByRole('button', { name: /clear all/i });
  if ((await clear.locator('visible=true').count()) === 0) return;
  await clickUniqueVisible(clear, 'clear cart');
  await expect(page.getByText('This till is clear')).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

export async function ensureSellableQaOnHand(page: Page) {
  const current = await fetchTill3AccountingSnapshot(page);
  if ((current.sellableProduct?.qtyOnHandBase ?? 0) >= 1) return;

  await page.goto('/purchases', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const form = page.locator('#record-purchase-form');
  await form.evaluate((el) => {
    if (el instanceof HTMLDetailsElement) el.open = true;
  });
  await fillUniqueVisible(
    form.getByPlaceholder(/Type to search product/i),
    RELIABILITY_SELLABLE_PRODUCT.name,
    'restock product search',
  );
  await clickUniqueVisible(
    form.getByRole('button').filter({ hasText: RELIABILITY_SELLABLE_PRODUCT.name }),
    'restock product hit',
  );
  await clickUniqueVisible(form.getByRole('button', { name: /Add line/i }), 'restock add line');
  await selectUniqueVisible(form.locator('select[name="paymentStatus"]'), 'UNPAID', 'restock unpaid');
  await clickUniqueVisible(
    form.getByRole('button', { name: /Record purchase|Submitting/i }),
    'restock record purchase',
  );
  await expect(page).not.toHaveURL(/error=/);
  await expect
    .poll(
      async () => {
        const next = await fetchTill3AccountingSnapshot(page);
        return next.sellableProduct?.qtyOnHandBase ?? 0;
      },
      { timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS, message: 'Reliability SKU on-hand after unpaid restock' },
    )
    .toBeGreaterThanOrEqual(1);
}

export async function gotoTill3Pos(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.goto('/pos', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  if (/\/login(?:\?|$)/.test(page.url())) blocked('POS redirected to /login');
  await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
  await clearRestoredCart(page);
  const posTill = page.locator('#pos-till-select');
  const checked = posTill.locator('option:checked');
  if (((await checked.textContent()) ?? '').trim() !== TILL3_ACCOUNTING_TILL_NAME) {
    await selectTill3(posTill, 'POS till');
  }
  await expect(posTill.locator('option:checked')).toHaveText(
    new RegExp(`^${TILL3_ACCOUNTING_TILL_NAME}$`),
  );
}

async function addSellableProduct(page: Page) {
  const search = page.getByPlaceholder(/type product name/i);
  await search.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await search.fill(RELIABILITY_SELLABLE_PRODUCT.name, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await clickUniqueVisible(
    page.getByRole('button').filter({ hasText: RELIABILITY_SELLABLE_PRODUCT.name }),
    `POS search ${RELIABILITY_SELLABLE_PRODUCT.name}`,
  );
}

async function completeSale(page: Page) {
  const viewCart = page.getByRole('button', { name: /View cart/i });
  if (await viewCart.isVisible().catch(() => false)) {
    await viewCart.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
    await clickUniqueVisible(page.getByTestId('pos-complete-sheet'), 'complete sale');
  } else {
    await clickUniqueVisible(page.getByTestId('pos-complete-checkout'), 'complete sale');
  }
  await expect(page.getByText(/Sale Complete|Ready for next customer/i)).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await clearRestoredCart(page);
}

async function ensureMethodPressed(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  const target = await requireExactlyOneVisible(button, name);
  if ((await target.getAttribute('aria-pressed')) !== 'true') {
    await target.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  }
  await expect(target).toHaveAttribute('aria-pressed', 'true');
}

function amountAfterLabel(page: Page, label: string) {
  return page.locator('#pos-payment-panel label').filter({ hasText: label }).locator('xpath=following-sibling::input[1]');
}

export async function completeTill3AccountingTenders(page: Page) {
  await requireTill3AccountingSalesAllowed();
  const before = await fetchTill3AccountingSnapshot(page);
  const hits = paymentHits(before).map((payment) => ({ reference: payment.reference ?? null }));
  const skipCard = assertRerunDecision(TILL3_ACCOUNTING_REFS.card, classifyTenderRef(hits, TILL3_ACCOUNTING_REFS.card));
  const skipMomo = assertRerunDecision(TILL3_ACCOUNTING_REFS.momo, classifyTenderRef(hits, TILL3_ACCOUNTING_REFS.momo));
  const skipTransfer = assertRerunDecision(
    TILL3_ACCOUNTING_REFS.transfer,
    classifyTenderRef(hits, TILL3_ACCOUNTING_REFS.transfer),
  );
  if (skipCard === 'skip' && skipMomo === 'skip' && skipTransfer === 'skip') {
    return 'skip' as const;
  }
  if (skipCard !== skipMomo || skipMomo !== skipTransfer) {
    blocked('Till 3 accounting refs are partial; will not submit another money write.');
  }

  await addSellableProduct(page);
  await clickUniqueVisible(page.getByRole('button', { name: 'Split…' }), 'split tender');
  await expect(page.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'true');
  await ensureMethodPressed(page, 'Cash');
  await ensureMethodPressed(page, 'Card');
  await ensureMethodPressed(page, 'MoMo');
  await ensureMethodPressed(page, 'Bank Transfer');

  await fillUniqueVisible(
    page.locator('#pos-cash-tendered'),
    (TILL3_ACCOUNTING_SPLIT.cashPence / 100).toFixed(2),
    'split cash',
  );
  await fillUniqueVisible(
    amountAfterLabel(page, 'Card amount'),
    (TILL3_ACCOUNTING_SPLIT.cardPence / 100).toFixed(2),
    'split card',
  );
  await fillUniqueVisible(page.getByPlaceholder(/card ref/i), TILL3_ACCOUNTING_REFS.card, TILL3_ACCOUNTING_REFS.card);
  await fillUniqueVisible(
    amountAfterLabel(page, 'MoMo amount'),
    (TILL3_ACCOUNTING_SPLIT.momoPence / 100).toFixed(2),
    'split momo',
  );
  await fillUniqueVisible(
    page.getByPlaceholder(/transaction ref/i),
    TILL3_ACCOUNTING_REFS.momo,
    TILL3_ACCOUNTING_REFS.momo,
  );
  await fillUniqueVisible(
    amountAfterLabel(page, 'Bank Transfer amount'),
    (TILL3_ACCOUNTING_SPLIT.transferPence / 100).toFixed(2),
    'split transfer',
  );
  await fillUniqueVisible(
    page.getByPlaceholder(/transfer ref/i),
    TILL3_ACCOUNTING_REFS.transfer,
    TILL3_ACCOUNTING_REFS.transfer,
  );
  await completeSale(page);
  return 'create' as const;
}

export async function assertTill3ShiftSummaryUi(page: Page) {
  await page.goto('/shifts', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByText('Shift Active', { exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: TILL3_ACCOUNTING_TILL_NAME, exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  const expectedCash = page
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Expected Cash', { exact: true }) })
    .locator('.text-2xl');
  await expect(expectedCash).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(expectedCash).not.toHaveText('GH₵0.00');
  const cardTransfer = page
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Card / Transfer', { exact: true }) })
    .locator('.text-2xl');
  await expect(cardTransfer).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(cardTransfer).not.toHaveText('GH₵0.00');
  const salesTotal = page
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Sales Total', { exact: true }) })
    .locator('.text-2xl');
  await expect(salesTotal).not.toHaveText('GH₵0.00');
  const salesCount = page
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Sales Count', { exact: true }) })
    .locator('.text-2xl');
  await expect(salesCount).not.toHaveText('0');
  await expect(page.getByText('Mobile Money', { exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

export async function proveTill3AccountingPersisted(page: Page) {
  const snapshot = await fetchTill3AccountingSnapshot(page);
  const invoice = assertTill3AccountingPersisted(snapshot);
  const table = formatTill3AccountingTable(invoice);
  return { snapshot, invoice, table };
}

export { PreviewQaOwnerBlockedError };
