/**
 * Reliability journey: register → tills → product → import → Till 3 tenders →
 * expense/supplier cash → snapshot → LATE_OFFLINE → close.
 *
 * Opt-in: skipped unless RELIABILITY_E2E=1 or a Preview base URL + owner creds exist.
 * Never runs against Production. Once this file runs, every required step must
 * PASS or FAIL — no silent return, optional skip, or “not available” success.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  isPreviewPlaywrightTarget,
  reliabilityJourneySkipReason,
  reliabilitySalesAllowed,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import {
  assertMobilePhase9Prereqs,
  completeOnboardingBusinessType,
  ensurePreviewQaOwner,
  shouldAddNamedTill,
  waitForOwnerSession,
  classifyTill3ShiftState,
} from '../tests/e2e/helpers/preview-qa-owner';
import {
  RELIABILITY_SELLABLE_PRODUCT,
  ensureImportedQaProduct,
  ensureSellableQaProduct,
} from '../tests/e2e/helpers/preview-qa-product';
import {
  confirmReliabilityImportCsv,
  enterManualImportRoute,
  ensureQaOpeningStock,
} from '../tests/e2e/helpers/preview-qa-catalogue';
import {
  RELIABILITY_ACTION_TIMEOUT_MS,
  RELIABILITY_NAVIGATION_TIMEOUT_MS,
  clickUniqueVisible,
  fillUniqueVisible,
  requireExactlyOneVisible,
  selectUniqueVisible,
  till3OpenSelect,
} from '../tests/e2e/helpers/preview-qa-locators';
import {
  RELIABILITY_RERUN_IDS,
  assertRerunDecision,
  classifyTenderRef,
} from '../lib/reliability/rerun-idempotency';
import { hashOfflineSalePayload } from '../lib/offline/payload-hash';

const PRODUCT_NAME = RELIABILITY_SELLABLE_PRODUCT.name;
const EXPECTED_PREVIEW_SHA = process.env.RELIABILITY_EXPECTED_SHA?.trim() ?? '';

const phase9Setup = { ownerReady: false, till3Ready: false };

function blocked(step: string, detail: string): never {
  throw new Error(`Phase 9 blocked at ${step}: ${detail}`);
}

async function requireSalesAllowed(step: string) {
  if (!reliabilitySalesAllowed()) {
    blocked(
      step,
      'set PLAYWRIGHT_ALLOW_QA_SALE=true and PLAYWRIGHT_QA_TENANT_CONFIRMED=true (never Production).',
    );
  }
}

async function selectTill3(locator: Locator, step: string) {
  const target = await requireExactlyOneVisible(locator, step);
  const till3 = target.locator('option', { hasText: /^Till 3$/ });
  if ((await till3.count()) !== 1) blocked(step, 'Till 3 option is missing or duplicated on the till selector.');
  const value = await till3.getAttribute('value');
  if (!value) blocked(step, 'Till 3 is not an option on the till selector.');
  await target.selectOption(value, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
}

async function confirmPreviewSha(page: Page) {
  const res = await page.request.get('/api/qa/deploy-sha');
  if (!res.ok()) {
    blocked('deploy-sha', `HTTP ${res.status()} — Preview identity endpoint is unavailable.`);
  }
  const body = await res.json();
  if (isPreviewPlaywrightTarget() && body.vercelEnv && body.vercelEnv !== 'preview') {
    blocked('deploy-sha', `vercelEnv=${body.vercelEnv}; Production is forbidden.`);
  }
  if (EXPECTED_PREVIEW_SHA && body.sha !== EXPECTED_PREVIEW_SHA) {
    blocked('deploy-sha', `deployed ${body.sha} !== expected ${EXPECTED_PREVIEW_SHA}`);
  }
  test.info().annotations.push({
    type: 'preview-sha',
    description: String(body.sha ?? 'local-null'),
  });
  return body as { sha: string | null; vercelEnv: string | null };
}

async function ensureOwnerSession(page: Page) {
  await ensurePreviewQaOwner(page);
  await waitForOwnerSession(page);
}

async function clearRestoredCart(page: Page) {
  const clear = page.getByRole('button', { name: /clear all/i });
  if ((await visibleOnlyCount(clear)) === 0) return;
  await clickUniqueVisible(clear, 'clear cart');
  await expect(page.getByText('This till is clear')).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
}

async function visibleOnlyCount(locator: Locator) {
  return locator.locator('visible=true').count();
}

async function gotoPos(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
  await page.goto('/pos', { waitUntil: 'domcontentloaded', timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
  if (/\/login(?:\?|$)/.test(page.url())) blocked('POS', 'redirected to /login');
  await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
  await clearRestoredCart(page);
}

async function addJourneyProduct(page: Page, name = PRODUCT_NAME) {
  const search = page.getByPlaceholder(/type product name/i);
  await search.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await search.fill(name, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  const result = page.getByRole('button').filter({ hasText: name });
  await clickUniqueVisible(result, `POS search ${name}`);
}

async function completeSaleAndReset(page: Page, _completeName: RegExp) {
  const viewCart = page.getByRole('button', { name: /View cart/i });
  if (await viewCart.isVisible().catch(() => false)) {
    await viewCart.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
    await clickUniqueVisible(page.getByTestId('pos-complete-sheet'), 'complete sale');
  } else {
    await clickUniqueVisible(page.getByTestId('pos-complete-checkout'), 'complete sale');
  }
  await expect(page.getByTestId('pos-sale-complete')).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await clearRestoredCart(page);
}

async function closeTill3Shift(page: Page, actualCash: string, step: string) {
  await page.goto('/shifts', { waitUntil: 'domcontentloaded', timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
  await clickUniqueVisible(page.getByRole('button', { name: 'Close Shift', exact: true }), `${step} open modal`);
  const overlay = page.locator('.overlay-shell');
  await expect(overlay.getByRole('heading', { name: /Close Shift/ })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await fillUniqueVisible(overlay.getByLabel('Actual Cash Counted'), actualCash, `${step} counted cash`);
  const override = overlay.getByRole('button', { name: 'Owner Override (use password)' });
  if (await override.isVisible().catch(() => false)) {
    await override.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
    const password = process.env.PLAYWRIGHT_OWNER_PASSWORD?.trim();
    if (!password) blocked(step, 'owner override requires PLAYWRIGHT_OWNER_PASSWORD (value not logged).');
    await fillUniqueVisible(overlay.getByLabel('Your Password'), password, `${step} owner password`);
    await selectUniqueVisible(
      overlay.locator('select').filter({ has: overlay.locator('option', { hasText: 'Manager unavailable' }) }),
      { value: 'MANAGER_UNAVAILABLE' },
      `${step} override reason`,
    );
    await fillUniqueVisible(
      overlay.getByLabel('Justification'),
      'Reliability Phase 9 close',
      `${step} override justification`,
    );
  }
  await clickUniqueVisible(overlay.getByRole('button', { name: 'Close Shift', exact: true }), `${step} confirm`);
}

async function openTill3Shift(page: Page, float: string, step: string) {
  await page.goto('/shifts', { waitUntil: 'domcontentloaded', timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
  const shiftState = classifyTill3ShiftState({
    shiftActiveVisible: await page.getByText('Shift Active', { exact: true }).isVisible().catch(() => false),
    till3Visible: await page.getByRole('heading', { name: 'Till 3', exact: true }).isVisible().catch(() => false),
  });
  if (shiftState === 'other-till-open') {
    blocked(step, 'another till is already open; Till 3 was not opened.');
  }
  if (shiftState === 'closed') {
    await selectUniqueVisible(till3OpenSelect(page), { label: 'Till 3' }, step);
    await fillUniqueVisible(page.getByLabel(/Opening Cash/i), float, `${step} float`);
    await clickUniqueVisible(page.getByRole('button', { name: /Open Shift/i }), step);
  }
  await expect(page.getByText('Shift Active', { exact: true })).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Till 3', exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

async function fetchSnapshot(page: Page) {
  const snapshot = await page.request.get('/api/qa/reliability-snapshot');
  if (!snapshot.ok()) blocked('reliability-snapshot', `HTTP ${snapshot.status()}`);
  return snapshot.json();
}

test.describe('Reliability journey', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('register, three tills, product, Till 3 tenders, close', async ({ page }) => {
    test.setTimeout(480_000);

    const sha = await test.step('confirm Preview SHA (never Production)', async () => {
      return confirmPreviewSha(page);
    });

    await test.step('register or sign in (never Production)', async () => {
      await ensureOwnerSession(page);
      phase9Setup.ownerReady = true;
    });

    await test.step('complete business type', async () => {
      await completeOnboardingBusinessType(page);
    });

    await test.step('confirm two default tills and add Till 3', async () => {
      await page.goto('/settings?section=tills', { waitUntil: 'domcontentloaded' });
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
      phase9Setup.till3Ready = true;
    });

    await test.step('create or reuse sellable product', async () => {
      await ensureSellableQaProduct(page);
    });

    await test.step('import products', async () => {
      await enterManualImportRoute(page);
      await ensureImportedQaProduct(page, async () => {
        await enterManualImportRoute(page);
        await confirmReliabilityImportCsv(page);
      });
    });

    await test.step('record opening stock', async () => {
      await ensureQaOpeningStock(page, () => fetchSnapshot(page));
    });

    await test.step('open Till 3 with float', async () => {
      await openTill3Shift(page, '100', 'open Till 3');
    });

    await test.step('cash / card / momo / transfer / split / receipt on Till 3', async () => {
      await requireSalesAllowed('POS tenders');
      await gotoPos(page);
      const posTill = page.locator('#pos-till-select');
      await expect(posTill.locator('option:checked')).toHaveText(/^Till 3$/);

      const snapshotBefore = await fetchSnapshot(page);
      const paymentHits = (snapshotBefore.invoices ?? []).flatMap(
        (row: { payments?: { reference?: string | null }[] }) => row.payments ?? [],
      );

      await addJourneyProduct(page);
      await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await completeSaleAndReset(page, /Complete Cash Sale/i);

      for (const method of [
        { button: 'Card', ref: /card ref/i, value: RELIABILITY_RERUN_IDS.cardRef, identity: RELIABILITY_RERUN_IDS.cardRef },
        { button: 'MoMo', ref: /transaction ref/i, value: RELIABILITY_RERUN_IDS.momoRef, identity: RELIABILITY_RERUN_IDS.momoRef },
        { button: 'Bank Transfer', ref: /transfer ref/i, value: RELIABILITY_RERUN_IDS.transferRef, identity: RELIABILITY_RERUN_IDS.transferRef },
      ] as const) {
        if (assertRerunDecision(method.identity, classifyTenderRef(paymentHits, method.identity)) === 'skip') {
          continue;
        }
        await addJourneyProduct(page);
        await clickUniqueVisible(page.getByRole('button', { name: method.button, exact: true }), method.button);
        await expect(page.getByRole('button', { name: method.button, exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await fillUniqueVisible(page.getByPlaceholder(method.ref), method.value, method.identity);
        await completeSaleAndReset(page, /Complete Sale/i);
      }

      await addJourneyProduct(page);
      await clickUniqueVisible(page.getByRole('button', { name: 'Split…' }), 'split tender');
      await expect(page.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'true');
      await clickUniqueVisible(page.getByRole('button', { name: 'Cash', exact: true }), 'split cash');
      await clickUniqueVisible(page.getByRole('button', { name: 'Card', exact: true }), 'split card');
      await completeSaleAndReset(page, /Complete Sale/i);

      const reprint = page.getByRole('link', { name: /Reprint last receipt/i });
      await expect(
        reprint.locator('visible=true'),
        'receipt reprint link missing after sale',
      ).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      const href = await reprint.locator('visible=true').getAttribute('href');
      if (!href) blocked('receipt', 'Reprint last receipt has no href.');
      const receipt = await page.context().newPage();
      await receipt.goto(href, { waitUntil: 'domcontentloaded', timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
      await expect(receipt).toHaveURL(/\/receipts\//);
      await receipt.close();

      const trust = page.getByLabel(/Today's sales/i);
      await expect(trust).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      await expect(trust).not.toHaveAttribute('aria-label', /GH₵0\.00,\s*0 transactions/);
    });

    await test.step('credit sale so a customer receipt can be recorded', async () => {
      await requireSalesAllowed('credit sale');
      await gotoPos(page);
      await addJourneyProduct(page);
      const status = page.getByLabel(/payment status/i);
      await expect(status, 'POS payment status control missing').toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      await status.selectOption('UNPAID', { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      await completeSaleAndReset(page, /Complete Sale|Complete Credit/i);
    });

    await test.step('cash expense explicitly against Till 3', async () => {
      await requireSalesAllowed('cash expense');
      await page.goto('/expenses', { waitUntil: 'domcontentloaded', timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
      const amount = page.locator('input[name="amount"]');
      if ((await amount.locator('visible=true').count()) === 0) {
        await page.locator('summary').filter({ hasText: /Record expense/i }).click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      }
      await fillUniqueVisible(page.locator('input[name="amount"]'), '1.00', 'cash expense amount');
      await fillUniqueVisible(page.locator('input[name="vendorName"]'), RELIABILITY_RERUN_IDS.expenseVendor, 'cash expense vendor');
      await fillUniqueVisible(page.locator('input[name="reference"]'), RELIABILITY_RERUN_IDS.expenseRef, 'cash expense ref');
      await selectTill3(page.locator('select[name="tillId"]'), 'cash expense');
      await clickUniqueVisible(page.getByRole('button', { name: 'Record expense' }), 'cash expense save');
      await expect(page).not.toHaveURL(/error=/);
      await expect(page.getByText(RELIABILITY_RERUN_IDS.expenseRef)).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
    });

    await test.step('supplier cash payment explicitly against Till 3', async () => {
      await requireSalesAllowed('supplier cash payment');
      await page.goto('/purchases', { waitUntil: 'domcontentloaded', timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
      const productSearch = page.getByPlaceholder(/Type to search product/i);
      await expect(productSearch, 'purchase product search missing').toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      await productSearch.fill(PRODUCT_NAME, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      await clickUniqueVisible(page.getByRole('button').filter({ hasText: PRODUCT_NAME }), 'purchase product hit');
      await clickUniqueVisible(page.getByRole('button', { name: /Add line/i }), 'purchase add line');
      await page.locator('select[name="paymentStatus"]').selectOption('UNPAID', { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
      await clickUniqueVisible(page.getByRole('button', { name: /Record purchase/i }), 'record purchase');
      await expect(page).not.toHaveURL(/error=/);

      await fillUniqueVisible(page.locator('input[name="amount"]'), '1.00', 'supplier payment amount');
      await selectUniqueVisible(page.locator('select[name="paymentMethod"]'), 'CASH', 'supplier payment method');
      await selectTill3(page.locator('select[name="tillId"]'), 'supplier cash payment');
      await clickUniqueVisible(page.getByRole('button', { name: /Record payment/i }), 'supplier record payment');
      await expect(page).not.toHaveURL(/error=/);
    });

    await test.step('customer receipt against invoice till', async () => {
      await requireSalesAllowed('customer receipt');
      await page.goto('/payments/customer-receipts', {
        waitUntil: 'domcontentloaded',
        timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
      });
      await fillUniqueVisible(page.locator('input[name="amount"]'), '1.00', 'customer receipt amount');
      await clickUniqueVisible(page.getByRole('button', { name: /Record payment/i }), 'customer receipt save');
      await expect(page).not.toHaveURL(/error=/);
    });

    await test.step('cash refund on a Till 3 invoice', async () => {
      await requireSalesAllowed('cash refund');
      const body = await fetchSnapshot(page);
      const till3Sale = (body.invoices ?? []).find(
        (row: { tillName?: string; saleSource?: string }) =>
          row.tillName === 'Till 3' && row.saleSource !== 'LATE_OFFLINE',
      );
      if (!till3Sale?.invoiceId) blocked('cash refund', 'no Till 3 invoice in reliability snapshot.');
      await page.goto(`/sales/return/${till3Sale.invoiceId}`, { waitUntil: 'domcontentloaded' });
      const confirm = page.getByRole('button', { name: /Process Return/i });
      await expect(confirm, 'Process Return missing').toBeVisible({ timeout: 20_000 });
      const reason = page.getByLabel(/Reason Code/i);
      await expect(reason, 'return reason code missing').toBeVisible({ timeout: 15_000 });
      await reason.selectOption('CUSTOMER_CHANGED_MIND');
      await confirm.click();
      const confirmReturn = page.getByRole('button', { name: /Confirm Return/i });
      await expect(confirmReturn, 'Confirm Return missing after reason selection').toBeVisible({
        timeout: 15_000,
      });
      await confirmReturn.click();
      await expect(page).not.toHaveURL(/error=/);
    });

    await test.step('persisted Till 3 identity snapshot (no PII)', async () => {
      await requireSalesAllowed('Till 3 snapshot');
      const body = await fetchSnapshot(page);
      if (sha.sha && body.deployedSha && body.deployedSha !== sha.sha) {
        blocked('Till 3 snapshot', `snapshot SHA ${body.deployedSha} !== deploy-sha ${sha.sha}`);
      }
      expect(body.businessId).toBeTruthy();
      const till3Sales = (body.invoices ?? []).filter(
        (row: { tillName?: string; saleSource?: string }) =>
          row.tillName === 'Till 3' && row.saleSource !== 'LATE_OFFLINE',
      );
      expect(till3Sales.length, 'no Till 3 invoices in snapshot').toBeGreaterThan(0);
      const shiftIds = new Set(till3Sales.map((row: { shiftId?: string }) => row.shiftId));
      expect(shiftIds.size, 'Till 3 sales must share one shift').toBe(1);
      const methods = new Set(
        till3Sales.flatMap((sale: { payments?: { method: string }[] }) => (sale.payments ?? []).map((p) => p.method)),
      );
      expect(methods.has('CASH')).toBe(true);
      expect(methods.has('CARD')).toBe(true);
      expect(methods.has('MOBILE_MONEY')).toBe(true);
      expect(methods.has('TRANSFER')).toBe(true);
      const sample = till3Sales[0] as {
        tillId: string;
        shiftTillId: string;
        expectedCashPence: number;
        cardTotalPence: number;
        momoTotalPence: number;
        transferTotalPence: number;
        drawer?: { entryType: string; amountPence: number; tillId: string; shiftId: string }[];
      };
      expect(sample.shiftTillId).toBe(sample.tillId);
      expect(sample.cardTotalPence, 'cardTotal still 0 after Till 3 card sale').toBeGreaterThan(0);
      expect(sample.momoTotalPence, 'momoTotal still 0 after Till 3 MoMo sale').toBeGreaterThan(0);
      expect(sample.transferTotalPence, 'transferTotal still 0 after Till 3 transfer').toBeGreaterThan(0);
      expect(sample.expectedCashPence, 'expectedCash still 0 after Till 3 activity').toBeGreaterThan(0);
      const cashSalePence = (sample.drawer ?? [])
        .filter((row) => row.entryType === 'CASH_SALE')
        .reduce((sum, row) => sum + row.amountPence, 0);
      expect(cashSalePence, 'no CASH_SALE CashDrawerEntry on Till 3').toBeGreaterThan(0);
      for (const sale of till3Sales) {
        expect(sale.businessId).toBe(body.businessId);
        expect(sale.storeId).toBeTruthy();
        expect(sale.tillId).toBeTruthy();
        expect(sale.shiftId).toBeTruthy();
        expect(sale.cashierUserId).toBeTruthy();
        expect(sale.payments?.length).toBeGreaterThan(0);
        const tenderSum = (sale.payments ?? []).reduce(
          (sum: number, payment: { amountPence: number }) => sum + payment.amountPence,
          0,
        );
        expect(tenderSum).toBe(sale.totalPence);
        const cashDrawer = (sale.drawer ?? []).filter((row: { entryType: string }) => row.entryType === 'CASH_SALE');
        for (const entry of cashDrawer) {
          expect(entry.tillId).toBe(sale.tillId);
          expect(entry.shiftId).toBe(sale.shiftId);
        }
        expect(sale.stockMovements?.length).toBeGreaterThan(0);
      }
      test.info().annotations.push({
        type: 'till3-evidence',
        description: `${till3Sales.length} Till 3 invoices; productCount=${body.productCount ?? '?'}; ids redacted`,
      });
    });

    await test.step('offline capture, close captured shift, LATE_OFFLINE sync', async () => {
      await requireSalesAllowed('LATE_OFFLINE');
      const before = await fetchSnapshot(page);
      const captured = (before.invoices ?? []).find(
        (row: { tillName?: string; shiftId?: string }) => row.tillName === 'Till 3' && row.shiftId,
      );
      if (!captured?.shiftId || !captured.tillId) {
        blocked('LATE_OFFLINE', 'snapshot has no Till 3 invoice with shiftId.');
      }

      const cache = await page.request.get('/api/offline/cache-data');
      if (!cache.ok()) blocked('LATE_OFFLINE', `cache-data HTTP ${cache.status()}`);
      const cacheBody = await cache.json();
      const product =
        (cacheBody.products ?? []).find((row: { name?: string }) => row.name === PRODUCT_NAME) ??
        (cacheBody.products ?? [])[0];
      const unit = product?.units?.find((row: { isBaseUnit?: boolean }) => row.isBaseUnit) ?? product?.units?.[0];
      if (!product || !unit) blocked('LATE_OFFLINE', 'offline cache-data has no sellable product/unit.');

      await closeTill3Shift(page, '100', 'LATE_OFFLINE close');
      await openTill3Shift(page, '50', 'LATE_OFFLINE reopen');

      const createdAt = new Date().toISOString();
      const offlineId = RELIABILITY_RERUN_IDS.lateOfflineKey;
      const payloadBase = {
        id: offlineId,
        businessId: captured.businessId,
        storeId: captured.storeId,
        tillId: captured.tillId,
        shiftId: captured.shiftId,
        cashierUserId: captured.cashierUserId,
        customerId: null,
        paymentStatus: 'PAID',
        lines: [
          {
            productId: product.id,
            unitId: unit.id,
            qtyInUnit: 1,
            discountType: 'NONE',
            discountValue: '',
          },
        ],
        payments: [{ method: 'CASH', amountPence: Math.max(100, Number(product.sellingPriceBasePence) || 100) }],
        orderDiscountType: 'NONE',
        orderDiscountValue: '',
        createdAt,
        localSaleTime: createdAt,
        idempotencyKey: offlineId,
      };
      const payload = {
        ...payloadBase,
        payloadHash: await hashOfflineSalePayload(payloadBase),
      };
      const sync = await page.request.post('/api/offline/sync-sale', { data: payload });
      if (!sync.ok()) blocked('LATE_OFFLINE', `sync HTTP ${sync.status()} ${await sync.text()}`);
      const syncBody = await sync.json();
      expect(syncBody.success, `LATE_OFFLINE sync failed: ${JSON.stringify(syncBody)}`).toBeTruthy();

      const replay = await page.request.post('/api/offline/sync-sale', { data: payload });
      const replayBody = await replay.json();
      expect(replayBody.invoiceId).toBe(syncBody.invoiceId);

      const after = await fetchSnapshot(page);
      const late = (after.invoices ?? []).find((row: { invoiceId?: string }) => row.invoiceId === syncBody.invoiceId);
      expect(late?.saleSource).toBe('LATE_OFFLINE');
      expect(late?.shiftId).toBe(captured.shiftId);
      expect(late?.tillId).toBe(captured.tillId);
      const laterShiftDrawers = (late?.drawer ?? []).filter(
        (row: { shiftId: string; entryType: string }) =>
          row.entryType === 'CASH_SALE' && row.shiftId !== captured.shiftId,
      );
      expect(laterShiftDrawers).toHaveLength(0);
    });

    await test.step('reports / Money Received', async () => {
      await requireSalesAllowed('Money Received');
      await page.goto('/reports/money-received', {
        waitUntil: 'domcontentloaded',
        timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
      });
      await expect(page.getByRole('heading', { name: /Money Received/i })).toBeVisible({
        timeout: RELIABILITY_ACTION_TIMEOUT_MS,
      });
    });

    await test.step('close Till 3 shift', async () => {
      await closeTill3Shift(page, '50', 'close Till 3');
    });
  });

  test('core Till 3 POS flow on mobile viewport', async ({ page }) => {
    test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());
    assertMobilePhase9Prereqs(phase9Setup);
    await requireSalesAllowed('mobile POS');
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureOwnerSession(page);

    await openTill3Shift(page, '20', 'mobile POS');
    await gotoPos(page);
    await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#pos-till-select').locator('option:checked')).toHaveText(/^Till 3$/);
    await addJourneyProduct(page);
    await completeSaleAndReset(page, /Complete Cash Sale|Complete Sale/i);
    await expect(page.getByText(/GH₵0\.00 · 0 txns/)).toHaveCount(0);

    await closeTill3Shift(page, '20', 'mobile POS close');
  });
});
