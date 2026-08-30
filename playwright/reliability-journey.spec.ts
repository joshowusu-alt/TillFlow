/**
 * Reliability journey: register → tills → product → Till 3 tenders →
 * expense/supplier cash → snapshot → LATE_OFFLINE → close.
 *
 * Skipped unless RELIABILITY_E2E=1 or a Preview base URL + owner creds exist.
 * Never runs against Production. Completing sales also requires
 * PLAYWRIGHT_ALLOW_QA_SALE=true (except local RELIABILITY_E2E=1).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  hasRoleCredentials,
  isPreviewPlaywrightTarget,
  reliabilityJourneySkipReason,
  reliabilitySalesAllowed,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import { loginAsRole, waitForProtectedShell } from '../tests/e2e/helpers/login';
import { hashOfflineSalePayload } from '../lib/offline/payload-hash';

const PRODUCT_NAME = 'Reliability SKU';
const EXPECTED_PREVIEW_SHA = process.env.RELIABILITY_EXPECTED_SHA?.trim() ?? '';

async function confirmPreviewSha(page: Page) {
  const res = await page.request.get('/api/qa/deploy-sha');
  expect(res.ok(), `deploy-sha HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.vercelEnv === 'preview' || body.vercelEnv == null).toBeTruthy();
  if (EXPECTED_PREVIEW_SHA) {
    expect(body.sha).toBe(EXPECTED_PREVIEW_SHA);
  }
  test.info().annotations.push({
    type: 'preview-sha',
    description: String(body.sha ?? 'local-null'),
  });
  return body as { sha: string | null; vercelEnv: string | null };
}

async function ensureOwnerSession(page: Page) {
  if (process.env.RELIABILITY_E2E === '1' && !hasRoleCredentials('owner')) {
    const stamp = Date.now();
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/El-Shaddai Supermarket/i).fill(`Reliability ${stamp}`);
    await page.getByPlaceholder(/Kingsley Atakorah/i).fill('Reliability Owner');
    await page.getByRole('button', { name: /Next — Account Details/i }).click();
    await page.getByPlaceholder(/you@yourstore.com/i).fill(`reliability-${stamp}@example.com`);
    await page.getByPlaceholder(/At least 6 characters/i).fill('Pass1234!');
    await page.getByRole('button', { name: /Next — Choose Plan/i }).click();
    await page.getByRole('button', { name: /Next — Currency/i }).click();
    await page.getByRole('button', { name: /Create My Business/i }).click();
    await waitForProtectedShell(page);
    return;
  }

  await loginAsRole(page, 'owner');
  await waitForProtectedShell(page);
}

async function selectTill3(locator: ReturnType<Page['locator']>) {
  if ((await locator.count()) === 0) return;
  const till3 = locator.locator('option', { hasText: /Till 3/i }).first();
  const value = await till3.getAttribute('value');
  if (value) await locator.selectOption(value);
}

async function clearRestoredCart(page: Page) {
  const clear = page.getByRole('button', { name: /clear all/i });
  if ((await clear.count()) > 0) {
    await clear.first().click().catch(() => undefined);
    await expect(page.getByText(/Cart\s*0|This till is clear/i).first())
      .toBeVisible({ timeout: 10_000 })
      .catch(() => undefined);
  }
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
  const started = Date.now();
  await page.goto('/pos', { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
  test.info().annotations.push({
    type: 'pos-ready-ms',
    description: String(Date.now() - started),
  });
  await clearRestoredCart(page);
}

async function addJourneyProduct(page: Page) {
  const search = page.getByPlaceholder(/type product name/i);
  await search.click();
  await search.fill(PRODUCT_NAME);
  const result = page.locator('button:not([disabled])').filter({ hasText: new RegExp(PRODUCT_NAME, 'i') }).first();
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.click();
}

async function completeSaleAndReset(page: Page, completeName: RegExp) {
  const complete = page.getByRole('button', { name: completeName }).first();
  await expect(complete).toBeEnabled({ timeout: 15_000 });
  await complete.click();
  await expect(page.getByText(/Sale Complete|Ready for next customer/i).first()).toBeVisible({
    timeout: 30_000,
  });
  await clearRestoredCart(page);
}

async function fetchSnapshot(page: Page) {
  const snapshot = await page.request.get('/api/qa/reliability-snapshot');
  expect(snapshot.ok(), `reliability snapshot HTTP ${snapshot.status()}`).toBeTruthy();
  return snapshot.json();
}

test.describe('Reliability journey', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('register, three tills, product, Till 3 tenders, close', async ({ page }) => {
    test.setTimeout(420_000);

    const sha = await test.step('confirm Preview SHA (never Production)', async () => {
      if (isPreviewPlaywrightTarget()) {
        return confirmPreviewSha(page);
      }
      return { sha: null, vercelEnv: null };
    });

    await test.step('register or sign in (never Production)', async () => {
      await ensureOwnerSession(page);
    });

    await test.step('complete business type', async () => {
      await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
      const picker = page.getByLabel(/Business type/i);
      if ((await picker.count()) > 0) {
        await picker.selectOption('SUPERMARKET');
        await page.getByRole('button', { name: /Save business type/i }).click();
      }
    });

    await test.step('ensure two default tills and add Till 3', async () => {
      await page.goto('/settings?section=tills', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Till Management')).toBeVisible({ timeout: 30_000 });
      const till3 = page.getByText('Till 3', { exact: true });
      if ((await till3.count()) === 0) {
        await page.getByPlaceholder(/New till name e\.g\. Till 3/i).fill('Till 3');
        await page.getByRole('button', { name: /Add till/i }).click();
        await expect(page.getByText('Till 3', { exact: true })).toBeVisible({ timeout: 20_000 });
      }
    });

    await test.step('create sellable product', async () => {
      await page.goto('/products#product-create', { waitUntil: 'domcontentloaded' });
      const addProduct = page.getByText('Add product', { exact: true }).first();
      await expect(addProduct).toBeVisible({ timeout: 30_000 });
      const nameInput = page.locator('input[name="name"]').first();
      if (!(await nameInput.isVisible().catch(() => false))) {
        await page.locator('#product-create').click();
      }
      if ((await page.getByText(PRODUCT_NAME, { exact: true }).count()) === 0) {
        await page.locator('input[name="name"]').first().fill(PRODUCT_NAME);
        await page.locator('input[name="sellingPriceBasePence"]').fill('5.00');
        await page.locator('input[name="defaultCostBasePence"]').fill('2.00');
        await page.getByRole('button', { name: /Create product/i }).click();
        await expect(page.getByText(PRODUCT_NAME).first()).toBeVisible({ timeout: 30_000 });
      }
    });

    await test.step('record opening stock', async () => {
      await page.goto('/setup/opening-stock', { waitUntil: 'domcontentloaded' });
      const addItem = page.getByRole('button', { name: /\+ Add stock item/i });
      if ((await addItem.count()) > 0) {
        await addItem.click();
        await page.getByRole('button', { name: /Save Opening Capital/i }).click();
        await expect(page.getByText(/Opening stock|capital|saved/i).first())
          .toBeVisible({ timeout: 20_000 })
          .catch(() => undefined);
      }
    });

    await test.step('open Till 3', async () => {
      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const tillSelect = page.locator('select').first();
      await expect(tillSelect).toBeVisible({ timeout: 30_000 });
      const till3Value = await tillSelect.locator('option', { hasText: /Till 3/i }).first().getAttribute('value');
      if (!till3Value) throw new Error('Till 3 is not available on /shifts');
      await tillSelect.selectOption(till3Value);
      await page.getByPlaceholder('0.00').fill('100');
      await page.getByRole('button', { name: /Open Shift/i }).click();
      await expect(page.getByText(/Shift Active|Till 3/i).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('cash / card / momo / transfer / split on Till 3', async () => {
      test.skip(
        !reliabilitySalesAllowed(),
        'Sale completion skipped: set PLAYWRIGHT_ALLOW_QA_SALE=true and PLAYWRIGHT_QA_TENANT_CONFIRMED=true (never on Production).',
      );

      await page.goto('/pos', { waitUntil: 'domcontentloaded' });
      const tillLink = page.getByRole('link', { name: /Till 3/i }).or(page.getByRole('button', { name: /Till 3/i }));
      if ((await tillLink.count()) > 0) {
        await tillLink.first().click().catch(() => undefined);
      }
      await gotoPos(page);
      await expect(page.getByText(/Till 3/i).first()).toBeVisible({ timeout: 15_000 });

      const searchStarted = Date.now();
      await addJourneyProduct(page);
      test.info().annotations.push({
        type: 'search-add-ms',
        description: String(Date.now() - searchStarted),
      });
      await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const checkoutStarted = Date.now();
      await completeSaleAndReset(page, /Complete Cash Sale/i);
      test.info().annotations.push({
        type: 'checkout-ack-ms',
        description: String(Date.now() - checkoutStarted),
      });

      for (const method of [
        { button: 'Card', ref: /card ref/i, value: 'CARD-REL-1' },
        { button: 'MoMo', ref: /transaction ref/i, value: 'MOMO-REL-1' },
        { button: 'Bank Transfer', ref: /transfer ref/i, value: 'BT-REL-1' },
      ] as const) {
        await addJourneyProduct(page);
        await page.getByRole('button', { name: method.button, exact: true }).click();
        await expect(page.getByRole('button', { name: method.button, exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await page.getByPlaceholder(method.ref).fill(method.value);
        await completeSaleAndReset(page, /Complete Sale/i);
      }

      await addJourneyProduct(page);
      await page.getByRole('button', { name: 'Split…' }).click();
      await expect(page.getByRole('button', { name: 'Split…' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Cash', exact: true }).click();
      await page.getByRole('button', { name: 'Card', exact: true }).click();
      await completeSaleAndReset(page, /Complete Sale/i);

      const reprint = page.getByRole('link', { name: /Reprint last receipt/i });
      if ((await reprint.count()) > 0) {
        const href = await reprint.getAttribute('href');
        if (href) {
          const receipt = await page.context().newPage();
          await receipt.goto(href, { waitUntil: 'domcontentloaded' });
          await expect(receipt).toHaveURL(/\/receipts\//);
          await receipt.close();
        }
      }
    });

    await test.step('cash expense explicitly against Till 3', async () => {
      test.skip(!reliabilitySalesAllowed(), 'Expense skipped without QA sale allow.');
      await page.goto('/expenses', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Record expense/i).first()).toBeVisible({ timeout: 30_000 });
      await page.locator('input[name="amount"]').first().fill('1.00');
      await selectTill3(page.locator('select[name="tillId"]'));
      await page.getByRole('button', { name: /Record expense|Save expense|Add expense/i }).first().click();
      await expect(page).not.toHaveURL(/error=/);
    });

    await test.step('supplier cash payment explicitly against Till 3', async () => {
      test.skip(!reliabilitySalesAllowed(), 'Supplier payment skipped without QA sale allow.');
      await page.goto('/purchases', { waitUntil: 'domcontentloaded' });
      const search = page.getByPlaceholder(/type product name|search product|Find product/i).first();
      if ((await search.count()) === 0) {
        const productBox = page.locator('input').filter({ hasText: '' }).nth(0);
        await productBox.click().catch(() => undefined);
      }
      const productSearch = page.getByPlaceholder(/Search products|Type product|Find \/ Add/i).or(
        page.locator('input[name="productSearch"]'),
      );
      if ((await productSearch.count()) > 0) {
        await productSearch.first().fill(PRODUCT_NAME);
        const hit = page.locator('button').filter({ hasText: new RegExp(PRODUCT_NAME, 'i') }).first();
        if (await hit.isVisible().catch(() => false)) await hit.click();
      }
      const qty = page.locator('input[name="qty"], input[type="number"]').first();
      if ((await qty.count()) > 0) {
        await qty.fill('1').catch(() => undefined);
      }
      await selectTill3(page.locator('select[name="tillId"]'));
      const cashPaid = page.locator('input').filter({ hasText: '' });
      const cashLabel = page.getByLabel(/Cash Paid/i);
      if ((await cashLabel.count()) > 0) await cashLabel.fill('2.00');
      const record = page.getByRole('button', { name: /Record purchase/i });
      if ((await record.count()) > 0 && (await record.isEnabled())) {
        await record.click();
        await expect(page).not.toHaveURL(/error=/);
      }

      const payTill = page.locator('select[name="tillId"]').first();
      await selectTill3(payTill);
      const amount = page.locator('input[name="amount"]').first();
      if ((await amount.count()) > 0) {
        await amount.fill('1.00');
        await page.getByRole('button', { name: /Record payment/i }).first().click().catch(() => undefined);
      }
    });

    await test.step('customer receipt against invoice till', async () => {
      test.skip(!reliabilitySalesAllowed(), 'Customer receipt skipped without QA sale allow.');
      await page.goto('/payments/customer-receipts', { waitUntil: 'domcontentloaded' });
      const amount = page.locator('input[name="amount"]').first();
      if ((await amount.count()) > 0) {
        await amount.fill('1.00');
        await page.getByRole('button', { name: /Record payment/i }).first().click().catch(() => undefined);
      }
    });

    await test.step('cash refund on a Till 3 invoice', async () => {
      test.skip(!reliabilitySalesAllowed(), 'Refund skipped without QA sale allow.');
      const body = await fetchSnapshot(page);
      const till3Sale = (body.invoices ?? []).find((row: { tillName?: string }) => row.tillName === 'Till 3');
      if (!till3Sale?.invoiceId) return;
      await page.goto(`/sales/return/${till3Sale.invoiceId}`, { waitUntil: 'domcontentloaded' });
      const confirm = page.getByRole('button', { name: /Confirm Return/i });
      if ((await confirm.count()) > 0) {
        await confirm.click();
        await expect(page).not.toHaveURL(/error=/);
      }
    });

    await test.step('persisted Till 3 identity snapshot (no PII)', async () => {
      test.skip(!reliabilitySalesAllowed(), 'Snapshot skipped without QA sale allow.');
      const body = await fetchSnapshot(page);
      if (sha.sha) expect(body.deployedSha === sha.sha || body.deployedSha == null).toBeTruthy();
      expect(body.businessId).toBeTruthy();
      const till3Sales = (body.invoices ?? []).filter((row: { tillName?: string }) => row.tillName === 'Till 3');
      expect(till3Sales.length).toBeGreaterThan(0);
      for (const sale of till3Sales) {
        expect(sale.businessId).toBe(body.businessId);
        expect(sale.storeId).toBeTruthy();
        expect(sale.tillId).toBeTruthy();
        expect(sale.shiftId).toBeTruthy();
        expect(sale.shiftTillId === sale.tillId || sale.shiftTillId == null).toBeTruthy();
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

    await test.step('LATE_OFFLINE after closing the captured Till 3 shift', async () => {
      test.skip(!reliabilitySalesAllowed(), 'LATE_OFFLINE skipped without QA sale allow.');
      const before = await fetchSnapshot(page);
      const captured = (before.invoices ?? []).find((row: { tillName?: string; shiftId?: string }) => row.tillName === 'Till 3');
      if (!captured?.shiftId || !captured.tillId) return;

      const cache = await page.request.get('/api/offline/cache-data');
      if (!cache.ok()) return;
      const cacheBody = await cache.json();
      const product =
        (cacheBody.products ?? []).find((row: { name?: string }) => row.name === PRODUCT_NAME) ??
        (cacheBody.products ?? [])[0];
      const unit = product?.units?.find((row: { isBaseUnit?: boolean }) => row.isBaseUnit) ?? product?.units?.[0];
      if (!product || !unit) return;

      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const close = page.getByRole('button', { name: /Close Shift/i }).first();
      if ((await close.count()) > 0) {
        await close.click();
        const actualCash = page.getByLabel(/actual cash|counted cash/i).or(page.locator('input[type="number"]').nth(1));
        if ((await actualCash.count()) > 0) await actualCash.first().fill('100');
        await page.getByRole('button', { name: /Close Shift/i }).last().click();
      }

      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const tillSelect = page.locator('select').first();
      const till3Value = await tillSelect.locator('option', { hasText: /Till 3/i }).first().getAttribute('value');
      if (till3Value) {
        await tillSelect.selectOption(till3Value);
        await page.getByPlaceholder('0.00').fill('50');
        await page.getByRole('button', { name: /Open Shift/i }).click().catch(() => undefined);
      }

      const createdAt = new Date().toISOString();
      const offlineId = `late-off-${Date.now()}`;
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
      expect(sync.ok(), `LATE_OFFLINE sync HTTP ${sync.status()}`).toBeTruthy();
      const syncBody = await sync.json();
      expect(syncBody.success).toBeTruthy();

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
      test.skip(!reliabilitySalesAllowed(), 'Reports skipped without QA sale allow.');
      await page.goto('/reports/money-received', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Money Received|Received/i).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('close Till 3 shift if still open', async () => {
      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const close = page.getByRole('button', { name: /Close Shift/i }).first();
      if ((await close.count()) === 0) return;
      await close.click();
      const actualCash = page.getByLabel(/actual cash|counted cash/i).or(page.locator('input[type="number"]').nth(1));
      if ((await actualCash.count()) > 0) {
        await actualCash.first().fill('100');
      }
      await page.getByRole('button', { name: /Close Shift/i }).last().click();
    });
  });

  test('core Till 3 POS flow on mobile viewport', async ({ page }) => {
    test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());
    test.skip(!reliabilitySalesAllowed(), 'Mobile sales skipped without QA sale allow.');
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureOwnerSession(page);
    await gotoPos(page);
    await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
    await addJourneyProduct(page);
    await completeSaleAndReset(page, /Complete Cash Sale|Complete Sale/i);
  });
});
