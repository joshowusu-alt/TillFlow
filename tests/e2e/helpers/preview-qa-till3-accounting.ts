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
  visibleOnly,
} from './preview-qa-locators';
import { RELIABILITY_SELLABLE_PRODUCT } from './preview-qa-product';
import {
  TILL3_ACCOUNTING_OPEN_FLOAT_PENCE,
  TILL3_ACCOUNTING_REFS,
  TILL3_ACCOUNTING_SPLIT,
  TILL3_ACCOUNTING_TILL_NAME,
  assertPosBoundToPersistedTill3,
  assertTill3AccountingPersisted,
  classifyPersistedTill3OpenShifts,
  formatTill3AccountingTable,
  paymentHits,
  type HostedTill3ShiftPageView,
  type PersistedTill3OpenShift,
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

async function visibleCount(locator: Locator) {
  return visibleOnly(locator).count();
}

function isPosPath(page: Page) {
  try {
    const path = new URL(page.url()).pathname;
    return path === '/pos' || path.startsWith('/pos/');
  } catch {
    return /\/pos(?:\/|\?|$)/.test(page.url());
  }
}

export async function readHostedTill3ShiftPage(page: Page): Promise<HostedTill3ShiftPageView> {
  const url = new URL(page.url());
  const heading = (
    (await page.getByRole('heading', { name: 'Shift Reconciliation', exact: true }).textContent().catch(() => '')) ??
    (await page.getByRole('heading', { level: 1 }).first().textContent().catch(() => '')) ??
    ''
  ).trim();
  const checkedTill = (
    (await page.getByRole('combobox', { name: 'Till' }).locator('option:checked').textContent().catch(() => '')) ?? ''
  ).trim();
  return {
    path: url.pathname,
    heading,
    startNewShiftVisible: (await visibleCount(page.getByRole('heading', { name: 'Start New Shift', exact: true }))) === 1,
    shiftActiveVisible: (await visibleCount(page.getByText('Shift Active', { exact: true }))) === 1,
    closeShiftVisible: (await visibleCount(page.getByRole('button', { name: 'Close Shift', exact: true }))) === 1,
    till3Selected: checkedTill === TILL3_ACCOUNTING_TILL_NAME,
    till3HeadingVisible:
      (await visibleCount(page.getByRole('heading', { name: TILL3_ACCOUNTING_TILL_NAME, exact: true }))) === 1,
    openShiftButtonVisible: (await visibleCount(page.getByRole('button', { name: 'Open Shift', exact: true }))) === 1,
    openingCashValue: await page.getByLabel(/Opening Cash/i).inputValue().catch(() => ''),
    recentShiftsEmpty: (await visibleCount(page.getByText('No shifts recorded yet', { exact: true }))) === 1,
    openShiftPending: (await visibleCount(page.getByRole('button', { name: 'Opening...', exact: true }))) === 1,
    navigatedToPos: isPosPath(page),
  };
}

async function requirePersistedTill3OpenShift(page: Page): Promise<PersistedTill3OpenShift> {
  const persisted = classifyPersistedTill3OpenShifts((await fetchTill3AccountingSnapshot(page)).openShifts);
  if (persisted.state !== 'till-3-open' || !persisted.shiftId || !persisted.tillId) {
    blocked('no unique OPEN Till 3 shift owned by the current user; will not open another shift.');
  }
  return persisted;
}

async function proveTill3OpenShiftChrome(page: Page, persisted: PersistedTill3OpenShift) {
  if (persisted.state !== 'till-3-open' || !persisted.shiftId || !persisted.tillId) {
    blocked('Till 3 shift identity is incomplete.');
  }
  if (isPosPath(page)) return persisted;

  await page.goto('/shifts', {
    waitUntil: 'load',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: 'Shift Reconciliation', exact: true })).toBeVisible({
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const ui = await readHostedTill3ShiftPage(page);
  if (ui.startNewShiftVisible && ui.openShiftButtonVisible) {
    blocked(
      `persisted Till 3 shift ${persisted.shiftId} but /shifts still shows Start New Shift / Open Shift.`,
    );
  }
  await requireExactlyOneVisible(
    page.getByRole('button', { name: 'Close Shift', exact: true }),
    'Till 3 Close Shift',
    RELIABILITY_NAVIGATION_TIMEOUT_MS,
  );
  await requireExactlyOneVisible(
    page.getByRole('heading', { name: TILL3_ACCOUNTING_TILL_NAME, exact: true }),
    'Till 3 open heading',
    RELIABILITY_NAVIGATION_TIMEOUT_MS,
  );
  return persisted;
}

export async function openTill3ShiftForAccounting(page: Page) {
  await page.goto('/shifts', {
    waitUntil: 'load',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: 'Shift Reconciliation', exact: true })).toBeVisible({
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });

  const before = classifyPersistedTill3OpenShifts((await fetchTill3AccountingSnapshot(page)).openShifts);
  if (before.state === 'ambiguous') {
    blocked('cannot tell which OPEN shift belongs to Till 3; fail closed.');
  }
  const openDecision = assertRerunDecision(
    'open Till 3',
    classifyTill3DrawerOpenRerun({
      shiftState: before.state === 'till-3-open' ? 'till-3-open' : 'closed',
      needsOpenShift: true,
      openFloatCountOnCurrentShift: before.openFloatCount,
    }),
  );

  if (openDecision === 'skip') {
    return proveTill3OpenShiftChrome(page, before);
  }

  await expect(page.getByRole('heading', { name: 'Start New Shift', exact: true })).toBeVisible({
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const tillSelect = till3OpenSelect(page);
  await selectUniqueVisible(tillSelect, { label: TILL3_ACCOUNTING_TILL_NAME }, 'open Till 3');
  await expect(tillSelect.locator('option:checked')).toHaveText(new RegExp(`^${TILL3_ACCOUNTING_TILL_NAME}$`), {
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await fillUniqueVisible(
    page.getByLabel(/Opening Cash/i),
    String(TILL3_ACCOUNTING_OPEN_FLOAT_PENCE / 100),
    'open Till 3 float',
  );
  const openShiftButton = page.getByRole('button', { name: 'Open Shift', exact: true });
  await expect(openShiftButton).toBeEnabled({ timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
  await clickUniqueVisible(openShiftButton, 'open Till 3');

  await expect
    .poll(
      async () => classifyPersistedTill3OpenShifts((await fetchTill3AccountingSnapshot(page)).openShifts).state,
      {
        timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
        message: 'persisted OPEN Till 3 shift after Open Shift',
      },
    )
    .toBe('till-3-open');

  const persisted = await requirePersistedTill3OpenShift(page);
  return proveTill3OpenShiftChrome(page, persisted);
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

async function waitForUniquePosTillState(page: Page) {
  await expect
    .poll(
      async () => {
        const visible = visibleOnly(page.locator('#pos-till-select'));
        const count = await visible.count();
        if (count > 1) blocked('POS till: duplicate visible #pos-till-select controls.');
        if (count !== 1) return 'missing';
        return (await visible.getAttribute('data-checkout-till-state')) ?? 'missing';
      },
      { timeout: 45_000, message: 'POS checkout till extras left Preparing checkout…' },
    )
    .toMatch(/^(ready|closed)$/);
}

async function readPosTillBinding(page: Page, persisted: PersistedTill3OpenShift) {
  const posTill = await requireExactlyOneVisible(
    page.locator('#pos-till-select'),
    'POS till',
    RELIABILITY_NAVIGATION_TIMEOUT_MS,
  );
  return {
    persistedShiftId: persisted.shiftId ?? '',
    persistedTillId: persisted.tillId ?? '',
    urlTillId: new URL(page.url()).searchParams.get('till'),
    selectedTillId: (await posTill.getAttribute('data-pos-till-id')) || (await posTill.inputValue()),
    selectedShiftId: (await posTill.getAttribute('data-pos-shift-id')) || '',
    checkoutTillState: await posTill.getAttribute('data-checkout-till-state'),
    visibleTillSelectCount: await visibleOnly(page.locator('#pos-till-select')).count(),
    till3OptionCount: await posTill
      .locator('option', { hasText: new RegExp(`^${TILL3_ACCOUNTING_TILL_NAME}$`) })
      .count(),
    selectedOptionText: ((await posTill.locator('option:checked').textContent()) ?? '').trim(),
  };
}

export async function gotoTill3Pos(page: Page) {
  const snapshot = await fetchTill3AccountingSnapshot(page);
  const persisted = classifyPersistedTill3OpenShifts(snapshot.openShifts);
  if (persisted.state !== 'till-3-open' || !persisted.shiftId || !persisted.tillId) {
    blocked('no unique OPEN Till 3 shift to bind POS; will not open another shift.');
  }

  await page.goto(`/pos?till=${encodeURIComponent(persisted.tillId)}`, {
    waitUntil: 'load',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  if (/\/login(?:\?|$)/.test(page.url())) blocked('POS redirected to /login');
  await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
  await clearRestoredCart(page);
  await waitForUniquePosTillState(page);

  const posTill = await requireExactlyOneVisible(page.locator('#pos-till-select'), 'POS till', 45_000);
  if ((await posTill.inputValue()) !== persisted.tillId) {
    const till3 = posTill.locator('option', { hasText: new RegExp(`^${TILL3_ACCOUNTING_TILL_NAME}$`) });
    if ((await till3.count()) !== 1) {
      blocked('POS till: Till 3 option is missing or duplicated after checkout extras loaded.');
    }
    await posTill.selectOption(persisted.tillId, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
    await waitForUniquePosTillState(page);
  }

  await expect
    .poll(
      async () =>
        page
          .locator(
            `[data-selected-till-id="${persisted.tillId}"][data-selected-shift-id="${persisted.shiftId}"]`,
          )
          .count(),
      { timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS, message: 'POS bound to persisted Till 3 shift id' },
    )
    .toBeGreaterThan(0);

  await requireExactlyOneVisible(
    page.locator('#pos-till-select[data-checkout-till-state="ready"]'),
    'POS till ready',
    RELIABILITY_NAVIGATION_TIMEOUT_MS,
  );
  assertPosBoundToPersistedTill3(await readPosTillBinding(page, persisted));

  if (snapshot.businessId) {
    const captured = await page.evaluate(
      ({ businessId, tillId }) => window.localStorage.getItem(`pos.capture.shift.${businessId}.${tillId}`),
      { businessId: snapshot.businessId, tillId: persisted.tillId },
    );
    if (captured && captured !== persisted.shiftId) {
      blocked(`POS capture shift ${captured} !== persisted ${persisted.shiftId}.`);
    }
  }
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

  const persisted = classifyPersistedTill3OpenShifts(before.openShifts);
  if (persisted.state !== 'till-3-open' || !persisted.shiftId || !persisted.tillId) {
    blocked('no unique OPEN Till 3 shift before selling; will not open another shift.');
  }
  assertPosBoundToPersistedTill3(await readPosTillBinding(page, persisted));

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
  const persisted = await requirePersistedTill3OpenShift(page);
  await page.goto('/shifts', {
    waitUntil: 'load',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: 'Shift Reconciliation', exact: true })).toBeVisible({
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const ui = await readHostedTill3ShiftPage(page);
  if (ui.startNewShiftVisible && ui.openShiftButtonVisible) {
    blocked(
      `persisted Till 3 shift ${persisted.shiftId} but /shifts still shows Start New Shift / Open Shift.`,
    );
  }
  await requireExactlyOneVisible(
    page.getByRole('button', { name: 'Close Shift', exact: true }),
    'Till 3 Close Shift',
    RELIABILITY_NAVIGATION_TIMEOUT_MS,
  );
  await requireExactlyOneVisible(
    page.getByRole('heading', { name: TILL3_ACCOUNTING_TILL_NAME, exact: true }),
    'Till 3 open heading',
    RELIABILITY_NAVIGATION_TIMEOUT_MS,
  );
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
