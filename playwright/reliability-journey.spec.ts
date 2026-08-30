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
  hasRoleCredentials,
  isPreviewPlaywrightTarget,
  reliabilityJourneySkipReason,
  reliabilitySalesAllowed,
  shouldRunReliabilityJourney,
} from '../tests/e2e/helpers/env';
import { loginAsRole, waitForProtectedShell } from '../tests/e2e/helpers/login';
import { hashOfflineSalePayload } from '../lib/offline/payload-hash';

const PRODUCT_NAME = 'Reliability SKU';
const IMPORT_PRODUCT_NAME = 'Reliability Import SKU';
const EXPECTED_PREVIEW_SHA = process.env.RELIABILITY_EXPECTED_SHA?.trim() ?? '';

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
  const count = await locator.count();
  if (count === 0) blocked(step, 'till selector select[name="tillId"] is not on the page.');
  const till3 = locator.locator('option', { hasText: /Till 3/i }).first();
  const value = await till3.getAttribute('value');
  if (!value) blocked(step, 'Till 3 is not an option on the till selector.');
  await locator.selectOption(value);
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

async function clearRestoredCart(page: Page) {
  const clear = page.getByRole('button', { name: /clear all/i });
  if ((await clear.count()) === 0) return;
  await clear.first().click();
  await expect(page.getByText(/Cart\s*0|This till is clear/i).first()).toBeVisible({ timeout: 10_000 });
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
  await page.goto('/pos', { waitUntil: 'domcontentloaded' });
  if (/\/login(?:\?|$)/.test(page.url())) blocked('POS', 'redirected to /login');
  await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
  await clearRestoredCart(page);
}

async function addJourneyProduct(page: Page, name = PRODUCT_NAME) {
  const search = page.getByPlaceholder(/type product name/i);
  await search.click();
  await search.fill(name);
  const result = page.locator('button:not([disabled])').filter({ hasText: new RegExp(name, 'i') }).first();
  await expect(result, `POS search did not return ${name}`).toBeVisible({ timeout: 20_000 });
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
  if (!snapshot.ok()) blocked('reliability-snapshot', `HTTP ${snapshot.status()}`);
  return snapshot.json();
}

test.describe('Reliability journey', () => {
  test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());

  test('register, three tills, product, Till 3 tenders, close', async ({ page }) => {
    test.setTimeout(480_000);

    const sha = await test.step('confirm Preview SHA (never Production)', async () => {
      return confirmPreviewSha(page);
    });

    await test.step('register or sign in (never Production)', async () => {
      await ensureOwnerSession(page);
    });

    await test.step('complete business type', async () => {
      await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
      const picker = page.getByLabel(/Business type/i);
      if ((await picker.count()) === 0) {
        blocked('business type', 'Business type picker is not on /onboarding.');
      }
      await picker.selectOption('SUPERMARKET');
      await page.getByRole('button', { name: /Save business type/i }).click();
    });

    await test.step('confirm two default tills and add Till 3', async () => {
      await page.goto('/settings?section=tills', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Till Management')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Till 1', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Till 2', { exact: true })).toBeVisible({ timeout: 5_000 });
      if ((await page.getByText('Till 3', { exact: true }).count()) === 0) {
        await page.getByPlaceholder(/New till name e\.g\. Till 3/i).fill('Till 3');
        await page.getByRole('button', { name: /Add till/i }).click();
      }
      await expect(page.getByText('Till 3', { exact: true })).toBeVisible({ timeout: 20_000 });
    });

    await test.step('create sellable product', async () => {
      await page.goto('/products#product-create', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Add product', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
      const nameInput = page.locator('input[name="name"]').first();
      if (!(await nameInput.isVisible())) {
        await page.locator('#product-create').click();
      }
      await expect(page.locator('input[name="name"]').first()).toBeVisible({ timeout: 15_000 });
      if ((await page.getByText(PRODUCT_NAME, { exact: true }).count()) === 0) {
        await page.locator('input[name="name"]').first().fill(PRODUCT_NAME);
        await page.locator('input[name="sellingPriceBasePence"]').fill('5.00');
        await page.locator('input[name="defaultCostBasePence"]').fill('2.00');
        await page.getByRole('button', { name: /Create product/i }).click();
      }
      await expect(page.getByText(PRODUCT_NAME).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('import products', async () => {
      await page.goto('/settings/import-stock', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Product catalogue/i }).click();
      const csv = [
        'name,sku,barcode,category,selling_price,cost_price,base_unit,pack_unit,pack_size,supplier_name,reorder_point,storefront_published,image_url,notes',
        `${IMPORT_PRODUCT_NAME},REL-IMP-1,RELIMP${Date.now()},Drinks,4.00,2.00,Piece,,,,,yes,,`,
      ].join('\r\n');
      await page.getByTestId('import-stock-file-input').setInputFiles({
        name: 'reliability-catalogue.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
      });
      const confirm = page.getByRole('button', { name: /Confirm Import/i });
      await expect(confirm, 'import preview did not offer Confirm Import').toBeEnabled({ timeout: 30_000 });
      await confirm.click();
      await expect(page.getByRole('heading', { name: 'Import complete!' })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText('Products imported')).toBeVisible();
      await page.goto('/products', { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByText(IMPORT_PRODUCT_NAME, { exact: true }).first(),
        `imported product ${IMPORT_PRODUCT_NAME} is not on /products`,
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step('record opening stock', async () => {
      await page.goto('/setup/opening-stock', { waitUntil: 'domcontentloaded' });
      const addItem = page.getByRole('button', { name: /\+ Add stock item/i });
      if ((await addItem.count()) === 0) blocked('opening stock', '+ Add stock item is not visible.');
      await addItem.click();
      const productSelect = page.locator('select').filter({ hasText: PRODUCT_NAME }).first();
      if ((await productSelect.count()) === 0) {
        blocked('opening stock', `${PRODUCT_NAME} is not on the opening-stock form.`);
      }
      await productSelect.selectOption({ label: PRODUCT_NAME });
      await page.getByRole('button', { name: /Save Opening Capital/i }).click();
      await expect(page.getByRole('heading', { name: 'Opening capital recorded!' })).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step('open Till 3 with float', async () => {
      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const tillSelect = page.locator('select').first();
      await expect(tillSelect).toBeVisible({ timeout: 30_000 });
      const till3Value = await tillSelect.locator('option', { hasText: /Till 3/i }).first().getAttribute('value');
      if (!till3Value) blocked('open Till 3', 'Till 3 is not available on /shifts');
      await tillSelect.selectOption(till3Value);
      await page.getByPlaceholder('0.00').fill('100');
      await page.getByRole('button', { name: /Open Shift/i }).click();
      await expect(page.getByText(/Shift Active|Till 3/i).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('cash / card / momo / transfer / split / receipt on Till 3', async () => {
      await requireSalesAllowed('POS tenders');
      await gotoPos(page);
      await expect(page.getByText(/Till 3/i).first()).toBeVisible({ timeout: 15_000 });

      await addJourneyProduct(page);
      await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await completeSaleAndReset(page, /Complete Cash Sale/i);

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
      await expect(reprint, 'receipt reprint link missing after sale').toBeVisible({ timeout: 15_000 });
      const href = await reprint.getAttribute('href');
      if (!href) blocked('receipt', 'Reprint last receipt has no href.');
      const receipt = await page.context().newPage();
      await receipt.goto(href, { waitUntil: 'domcontentloaded' });
      await expect(receipt).toHaveURL(/\/receipts\//);
      await receipt.close();
    });

    await test.step('credit sale so a customer receipt can be recorded', async () => {
      await requireSalesAllowed('credit sale');
      await gotoPos(page);
      await addJourneyProduct(page);
      const status = page.getByLabel(/payment status/i);
      await expect(status, 'POS payment status control missing').toBeVisible({ timeout: 15_000 });
      await status.selectOption('UNPAID');
      await completeSaleAndReset(page, /Complete Sale|Complete Credit/i);
    });

    await test.step('cash expense explicitly against Till 3', async () => {
      await requireSalesAllowed('cash expense');
      await page.goto('/expenses', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Record expense/i).first()).toBeVisible({ timeout: 30_000 });
      await page.locator('input[name="amount"]').first().fill('1.00');
      await selectTill3(page.locator('select[name="tillId"]').first(), 'cash expense');
      await page.getByRole('button', { name: /Record expense|Save expense|Add expense/i }).first().click();
      await expect(page).not.toHaveURL(/error=/);
    });

    await test.step('supplier cash payment explicitly against Till 3', async () => {
      await requireSalesAllowed('supplier cash payment');
      await page.goto('/purchases', { waitUntil: 'domcontentloaded' });
      const productSearch = page.getByPlaceholder(/Type to search product/i);
      await expect(productSearch, 'purchase product search missing').toBeVisible({ timeout: 30_000 });
      await productSearch.fill(PRODUCT_NAME);
      const hit = page.locator('button').filter({ hasText: new RegExp(PRODUCT_NAME, 'i') }).first();
      await expect(hit, `purchase search did not return ${PRODUCT_NAME}`).toBeVisible({ timeout: 15_000 });
      await hit.click();
      await page.getByRole('button', { name: /Add line/i }).click();
      await page.locator('select[name="paymentStatus"]').selectOption('UNPAID');
      await page.getByRole('button', { name: /Record purchase/i }).click();
      await expect(page).not.toHaveURL(/error=/);

      const amount = page.locator('input[name="amount"]').first();
      await expect(amount, 'supplier payment amount field missing').toBeVisible({ timeout: 20_000 });
      await amount.fill('1.00');
      await page.locator('select[name="paymentMethod"]').first().selectOption('CASH');
      await selectTill3(page.locator('select[name="tillId"]').first(), 'supplier cash payment');
      await page.getByRole('button', { name: /Record payment/i }).first().click();
      await expect(page).not.toHaveURL(/error=/);
    });

    await test.step('customer receipt against invoice till', async () => {
      await requireSalesAllowed('customer receipt');
      await page.goto('/payments/customer-receipts', { waitUntil: 'domcontentloaded' });
      const amount = page.locator('input[name="amount"]').first();
      await expect(amount, 'customer receipt amount field missing — no outstanding invoice').toBeVisible({
        timeout: 20_000,
      });
      await amount.fill('1.00');
      await page.getByRole('button', { name: /Record payment/i }).first().click();
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
      const till3Sales = (body.invoices ?? []).filter((row: { tillName?: string }) => row.tillName === 'Till 3');
      expect(till3Sales.length, 'no Till 3 invoices in snapshot').toBeGreaterThan(0);
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

      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const close = page.getByRole('button', { name: /Close Shift/i }).first();
      await expect(close, 'Close Shift missing for captured Till 3').toBeVisible({ timeout: 20_000 });
      await close.click();
      const actualCash = page.getByLabel(/actual cash|counted cash/i).or(page.locator('input[type="number"]').nth(1));
      if ((await actualCash.count()) > 0) await actualCash.first().fill('100');
      await page.getByRole('button', { name: /Close Shift/i }).last().click();

      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const tillSelect = page.locator('select').first();
      const till3Value = await tillSelect.locator('option', { hasText: /Till 3/i }).first().getAttribute('value');
      if (!till3Value) blocked('LATE_OFFLINE', 'cannot reopen Till 3 after close.');
      await tillSelect.selectOption(till3Value);
      await page.getByPlaceholder('0.00').fill('50');
      await page.getByRole('button', { name: /Open Shift/i }).click();
      await expect(page.getByText(/Shift Active|Till 3/i).first()).toBeVisible({ timeout: 30_000 });

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
      await page.goto('/reports/money-received', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/Money Received|Received/i).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step('close Till 3 shift', async () => {
      await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
      const close = page.getByRole('button', { name: /Close Shift/i }).first();
      await expect(close, 'Close Shift missing after LATE_OFFLINE reopen').toBeVisible({ timeout: 20_000 });
      await close.click();
      const actualCash = page.getByLabel(/actual cash|counted cash/i).or(page.locator('input[type="number"]').nth(1));
      if ((await actualCash.count()) > 0) await actualCash.first().fill('50');
      await page.getByRole('button', { name: /Close Shift/i }).last().click();
    });
  });

  test('core Till 3 POS flow on mobile viewport', async ({ page }) => {
    test.skip(!shouldRunReliabilityJourney(), reliabilityJourneySkipReason());
    await requireSalesAllowed('mobile POS');
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureOwnerSession(page);

    await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
    const tillSelect = page.locator('select').first();
    await expect(tillSelect, 'mobile flow needs a till selector on /shifts').toBeVisible({
      timeout: 30_000,
    });
    const till3Value = await tillSelect.locator('option', { hasText: /Till 3/i }).first().getAttribute('value');
    if (!till3Value) blocked('mobile POS', 'Till 3 is not available to reopen after close.');
    await tillSelect.selectOption(till3Value);
    await page.getByPlaceholder('0.00').fill('20');
    await page.getByRole('button', { name: /Open Shift/i }).click();
    await expect(page.getByText(/Shift Active|Till 3/i).first()).toBeVisible({ timeout: 30_000 });

    await gotoPos(page);
    await expect(page.getByPlaceholder(/scan barcode/i)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Till 3/i).first()).toBeVisible({ timeout: 15_000 });
    await addJourneyProduct(page);
    await completeSaleAndReset(page, /Complete Cash Sale|Complete Sale/i);

    await page.goto('/shifts', { waitUntil: 'domcontentloaded' });
    const close = page.getByRole('button', { name: /Close Shift/i }).first();
    await expect(close, 'Close Shift missing after mobile Till 3 sale').toBeVisible({ timeout: 20_000 });
    await close.click();
    const actualCash = page.getByLabel(/actual cash|counted cash/i).or(page.locator('input[type="number"]').nth(1));
    if ((await actualCash.count()) > 0) await actualCash.first().fill('20');
    await page.getByRole('button', { name: /Close Shift/i }).last().click();
  });
});
