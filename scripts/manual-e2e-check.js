const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const CASHIER_EMAIL = process.env.E2E_CASHIER_EMAIL || 'cashier@store.com';
const CASHIER_PASSWORD = process.env.E2E_CASHIER_PASSWORD || 'Pass1234!';
const prisma = new PrismaClient();

/** Current POS primary CTA: "Complete Cash Sale — …", "Complete Sale — …", credit/part-paid variants. */
const COMPLETE_SALE_NAME = /Complete (?:Cash |Part-Paid |Credit )?Sale/i;

/** Ensure the cashier account has the known E2E password.
 *  A failed backup restore can wipe + recreate users with random passwords;
 *  this guard makes the smoke E2E resilient to that scenario. */
async function ensureCashierPassword() {
  try {
    const hash = await bcrypt.hash(CASHIER_PASSWORD, 10);
    await prisma.user.updateMany({
      where: { email: CASHIER_EMAIL },
      data: { passwordHash: hash },
    });
  } catch (e) { /* best effort */ }
}

const { createHash } = require('crypto');

/** Must match lib/offline/payload-hash.ts canonicalizeOfflineSalePayload. */
function hashOfflineSalePayload(input) {
  const lines = [...(input.lines || [])]
    .sort((a, b) => `${a.productId}:${a.unitId}`.localeCompare(`${b.productId}:${b.unitId}`))
    .map((line) => ({
      productId: String(line.productId ?? ''),
      unitId: String(line.unitId ?? ''),
      qtyInUnit: Math.floor(Number(line.qtyInUnit) || 0),
      qtyBase: line.qtyBase != null ? Math.round(Number(line.qtyBase)) : null,
      unitPricePence: line.unitPricePence != null ? Math.round(Number(line.unitPricePence)) : null,
      lineSubtotalPence: line.lineSubtotalPence != null ? Math.round(Number(line.lineSubtotalPence)) : null,
      discountType: String(line.discountType ?? 'NONE'),
      discountValue: String(line.discountValue ?? ''),
    }));
  const payments = [...(input.payments || [])]
    .sort((a, b) => `${a.method}:${a.amountPence}`.localeCompare(`${b.method}:${b.amountPence}`))
    .map((payment) => ({
      method: String(payment.method ?? ''),
      amountPence: Math.round(Number(payment.amountPence) || 0),
    }));
  const canonical = JSON.stringify({
    businessId: String(input.businessId ?? ''),
    storeId: String(input.storeId ?? ''),
    tillId: String(input.tillId ?? ''),
    shiftId: input.shiftId ?? null,
    cashierUserId: input.cashierUserId ?? null,
    customerId: input.customerId ?? null,
    paymentStatus: String(input.paymentStatus ?? ''),
    lines,
    payments,
    orderDiscountType: String(input.orderDiscountType ?? 'NONE'),
    orderDiscountValue: String(input.orderDiscountValue ?? ''),
    inventoryPolicy: input.inventoryPolicy ?? 'enforce',
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Operational POS sales require an OPEN shift. Seed does not open one. */
async function ensureOpenShift(email) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new Error(`Cannot open till: no user ${email}`);
  const store = await prisma.store.findFirst({ where: { businessId: user.businessId } });
  if (!store) throw new Error('Cannot open till: no store for this business');
  const till = await prisma.till.findFirst({
    where: { storeId: store.id, active: true },
    orderBy: { name: 'asc' },
  });
  if (!till) throw new Error('Cannot open till: no active till');
  const existing = await prisma.shift.findFirst({
    where: { tillId: till.id, status: 'OPEN' },
  });
  if (existing) return { user, store, till, shift: existing };
  const openingCashPence = 10000;
  const shift = await prisma.shift.create({
    data: {
      tillId: till.id,
      userId: user.id,
      openingCashPence,
      expectedCashPence: openingCashPence,
      status: 'OPEN',
      openKey: till.id,
    },
  });
  return { user, store, till, shift };
}

async function captureFailureArtifacts(page, stage, extra = {}) {
  try {
    fs.mkdirSync('.playwright-mcp', { recursive: true });
    const shot = `.playwright-mcp/offline-smoke-${stage}.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
    const completeButtons = await page
      .getByRole('button', { name: COMPLETE_SALE_NAME })
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const el = /** @type {HTMLButtonElement} */ (n);
          const style = window.getComputedStyle(el);
          return {
            text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            disabled: el.disabled,
            display: style.display,
            visibility: style.visibility,
            width: Math.round(el.getBoundingClientRect().width),
            height: Math.round(el.getBoundingClientRect().height),
          };
        }),
      )
      .catch(() => []);
    return {
      stage,
      url: page.url(),
      viewport: page.viewportSize(),
      tillState: await page.locator('#pos-till-select').getAttribute('data-checkout-till-state').catch(() => null),
      checkoutState: await page.locator('[data-checkout-state]').first().getAttribute('data-checkout-state').catch(() => null),
      paymentStatus: await page.getByLabel(/payment status/i).inputValue().catch(() => null),
      cashTendered: await page.locator('#pos-cash-tendered').inputValue().catch(() => null),
      completeButtons,
      screenshot: shot,
      ...extra,
    };
  } catch {
    return { stage, url: page.url(), ...extra };
  }
}

async function seedSellableProductIfNeeded() {
  const business = await prisma.business.findFirst({ select: { id: true } });
  if (!business) return;

  const store = await prisma.store.findFirst({
    where: { businessId: business.id },
    select: { id: true },
  });
  if (!store) return;

  const product = await prisma.product.findFirst({
    where: { businessId: business.id, active: true },
    select: { id: true, defaultCostBasePence: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!product) return;

  const existing = await prisma.inventoryBalance.findUnique({
    where: { storeId_productId: { storeId: store.id, productId: product.id } },
    select: { qtyOnHandBase: true, avgCostBasePence: true },
  });

  if ((existing?.qtyOnHandBase ?? 0) > 0) return;

  await prisma.inventoryBalance.upsert({
    where: { storeId_productId: { storeId: store.id, productId: product.id } },
    update: {
      qtyOnHandBase: 20,
      avgCostBasePence: existing?.avgCostBasePence ?? product.defaultCostBasePence ?? 100,
    },
    create: {
      storeId: store.id,
      productId: product.id,
      qtyOnHandBase: 20,
      avgCostBasePence: product.defaultCostBasePence ?? 100,
    },
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  // Desktop POS region: Complete Sale lives in checkout panel + sidebar (not phone sheet).
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const report = {
    login: false,
    posSale: false,
    receipt: false,
    offlineCacheApi: false,
    offlineSyncCreate: false,
    offlineSyncIdempotent: false,
    offlineSyncValidation: false,
    receiptPath: null,
    syncedInvoiceId: null,
  };

  let stage = 'init';

  try {
    // Ensure the cashier password is set correctly (guards against partial backup restore)
    stage = 'ensure-cashier-password';
    await ensureCashierPassword();

    stage = 'ensure-open-shift';
    const openContext = await ensureOpenShift(CASHIER_EMAIL);

    stage = 'login';
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[name="email"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('input[name="email"]').fill(CASHIER_EMAIL);
    await page.locator('input[name="password"]').fill(CASHIER_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    // Poll for redirect (up to 30s) — more reliable than a fixed wait
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const url = page.url();
      if (/\/pos|\/onboarding/.test(url)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const postLoginUrl = page.url();
    if (!/\/pos|\/onboarding/.test(postLoginUrl)) {
      await page.screenshot({ path: '.playwright-mcp/login-failed.png', fullPage: true });
      const errorBanner = await page.locator('div.rounded-xl.border.border-rose-300').first().textContent().catch(() => null);
      throw new Error(`Login did not redirect to /pos. URL: ${postLoginUrl}. ErrorBanner: ${errorBanner ?? 'none'}`);
    }
    if (/\/onboarding/.test(postLoginUrl)) {
      await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle' });
    }
    report.login = true;

    const getCacheData = async () => {
      const cacheResp = await page.request.get(`${BASE_URL}/api/offline/cache-data`);
      if (cacheResp.status() !== 200) {
        throw new Error(`Offline cache API returned ${cacheResp.status()}`);
      }
      const payload = await cacheResp.json();
      if (!Array.isArray(payload.products) || payload.products.length === 0) {
        throw new Error('Offline cache API returned no products');
      }
      return payload;
    };

    stage = 'offline-cache';
    let cacheData = await getCacheData();
    let saleProduct = cacheData.products.find(
      (p) => p.onHandBase > 0 && Array.isArray(p.units) && p.units.length > 0
    );
    if (!saleProduct) {
      await seedSellableProductIfNeeded();
      cacheData = await getCacheData();
      saleProduct = cacheData.products.find(
        (p) => p.onHandBase > 0 && Array.isArray(p.units) && p.units.length > 0
      );
    }
    if (!saleProduct) throw new Error('Could not find POS product candidate with stock');

    const billingRestrictionBanner = page.getByText(/Access restricted\. Complete payment to continue using TillFlow\./i);
    const barcodeInput = page.getByPlaceholder(/scan barcode/i);
    const productSearch = page.getByPlaceholder(/type product name|search products by name or barcode/i);
    stage = 'pos-ready';
    const posReadyState = await Promise.race([
      productSearch.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'product-search'),
      barcodeInput.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'barcode'),
      billingRestrictionBanner.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'billing-lock'),
    ]).catch(() => 'timeout');

    if (posReadyState === 'billing-lock') {
      throw new Error(`POS blocked by billing restriction. URL: ${page.url()}`);
    }

    if (posReadyState === 'timeout') {
      await page.screenshot({ path: '.playwright-mcp/pos-not-ready.png', fullPage: true });
      throw new Error(`POS UI did not become ready. URL: ${page.url()}`);
    }

    await productSearch.waitFor({ state: 'visible', timeout: 10000 });

    stage = 'till-ready';
    // Evidenced till readiness: select is present and marked ready (or till-ready text).
    const tillSelect = page.locator('#pos-till-select');
    await tillSelect.waitFor({ state: 'attached', timeout: 20000 });
    const tillReadyDeadline = Date.now() + 20000;
    let tillReady = false;
    while (Date.now() < tillReadyDeadline) {
      const state = await tillSelect.getAttribute('data-checkout-till-state').catch(() => null);
      if (state === 'ready') {
        tillReady = true;
        break;
      }
      // When requireOpenTillForSales is false, expanded form still uses data-checkout-state=ready.
      const checkoutReady = await page.locator('[data-checkout-state="ready"]').count().catch(() => 0);
      if (checkoutReady > 0 && state && state !== 'loading' && state !== 'failed' && state !== 'empty') {
        tillReady = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!tillReady) {
      const artifacts = await captureFailureArtifacts(page, 'till-not-ready');
      throw new Error(`Till did not become ready. Diagnostics: ${JSON.stringify(artifacts)}`);
    }

    stage = 'add-product';
    const searchTerm = String(saleProduct.name || '').slice(0, 6) || 'a';
    // Click first so onFocus → setProductDropdownOpen(true), then fill (which uses
    // native input events, bypassing the POS barcode-scanner global keydown handler)
    await productSearch.click();
    await productSearch.fill(searchTerm);
    // Prefer enabled catalogue result buttons; avoid matching unrelated disabled controls.
    const productButton = page.locator('button:not([disabled])', { hasText: saleProduct.name });
    await productButton.first().waitFor({ state: 'visible', timeout: 10000 });
    await productButton.first().click();

    // Multi-unit products stage for unit selection; single-unit may add immediately.
    const addToCartBtn = page.getByRole('button', { name: /Add to Cart/i });
    const cartEvidence = page
      .locator('[data-pos-cart-card="true"]')
      .or(page.locator('[data-pos-mobile-cart-bar="true"]'))
      .or(page.getByText(new RegExp(String(saleProduct.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')));

    const addOutcome = await Promise.race([
      addToCartBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'staged'),
      page
        .getByText(/Ready — Cash|Ready to complete/i)
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => 'direct'),
    ]).catch(() => 'timeout');

    if (addOutcome === 'staged') {
      await addToCartBtn.click();
    }

    // Cart must contain the product before payment/complete.
    const cartDeadline = Date.now() + 15000;
    let cartReady = false;
    while (Date.now() < cartDeadline) {
      const readyBanner = await page.getByText(/Ready — Cash|Ready to complete/i).count().catch(() => 0);
      const completeCount = await page.getByRole('button', { name: COMPLETE_SALE_NAME }).count().catch(() => 0);
      if (readyBanner > 0 || completeCount > 0) {
        // Prefer an enabled complete CTA as proof the line is in cart and priced.
        const enabledComplete = page.getByRole('button', { name: COMPLETE_SALE_NAME }).filter({ hasNotText: /^$/ });
        const anyEnabled = await enabledComplete.evaluateAll((nodes) =>
          nodes.some((n) => !(/** @type {HTMLButtonElement} */ (n)).disabled),
        ).catch(() => false);
        if (anyEnabled || readyBanner > 0) {
          cartReady = true;
          break;
        }
      }
      await cartEvidence.first().isVisible().catch(() => false);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!cartReady) {
      const artifacts = await captureFailureArtifacts(page, 'product-not-in-cart', {
        productName: saleProduct.name,
        addOutcome,
      });
      throw new Error(`Product was not added to cart. Diagnostics: ${JSON.stringify(artifacts)}`);
    }

    stage = 'payment';
    // Explicit Paid + Cash (current default journey); do not rely on stale qty/"Exact" races.
    const paymentStatus = page.getByLabel(/payment status/i);
    if ((await paymentStatus.count()) > 0) {
      const currentStatus = await paymentStatus.inputValue().catch(() => '');
      if (currentStatus && currentStatus !== 'PAID') {
        await paymentStatus.selectOption('PAID').catch(() => undefined);
      }
    }
    const cashMethod = page.getByRole('button', { name: 'Cash', exact: true });
    if ((await cashMethod.count()) > 0) {
      const pressed = await cashMethod.first().getAttribute('aria-pressed').catch(() => null);
      if (pressed !== 'true') {
        await cashMethod.first().click();
      }
    }

    // Establish exact cash tender via the denominations control (not a product-qty Exact).
    const exactCash = page.locator('[data-pos-cash-denominations="true"]').getByRole('button', { name: /^Exact$/ });
    if ((await exactCash.count()) > 0) {
      await exactCash.first().click();
    }

    const paymentReady = page.getByText(/Ready — Cash|Ready to complete • Cash/i).first();
    await paymentReady.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => {
      const artifacts = await captureFailureArtifacts(page, 'payment-not-ready');
      throw new Error(`Payment state was not established for exact cash. Diagnostics: ${JSON.stringify(artifacts)}`);
    });

    stage = 'complete-sale';
    // Prefer a visible, enabled, non-zero-box CTA (skip sticky lg:hidden zero-size duplicates).
    const completeCandidates = page.getByRole('button', { name: COMPLETE_SALE_NAME });
    let completeHandle = null;
    const completeDeadline = Date.now() + 20000;
    while (Date.now() < completeDeadline) {
      const handles = await completeCandidates.elementHandles();
      for (const handle of handles) {
        const meta = await handle.evaluate((el) => {
          const node = /** @type {HTMLButtonElement} */ (el);
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return {
            disabled: node.disabled,
            display: style.display,
            visibility: style.visibility,
            width: rect.width,
            height: rect.height,
          };
        });
        const actionable =
          !meta.disabled &&
          meta.display !== 'none' &&
          meta.visibility !== 'hidden' &&
          meta.width > 0 &&
          meta.height > 0;
        if (actionable) {
          completeHandle = handle;
          break;
        }
        await handle.dispose().catch(() => undefined);
      }
      if (completeHandle) {
        for (const handle of handles) {
          if (handle !== completeHandle) await handle.dispose().catch(() => undefined);
        }
        break;
      }
      for (const handle of handles) {
        await handle.dispose().catch(() => undefined);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!completeHandle) {
      const artifacts = await captureFailureArtifacts(page, 'complete-sale-unavailable');
      throw new Error(
        `Complete Sale control not visible and enabled. Diagnostics: ${JSON.stringify(artifacts)}`,
      );
    }

    // Submit exactly once.
    await completeHandle.click();
    await completeHandle.dispose().catch(() => undefined);

    stage = 'sale-complete';
    await page.getByText(/Sale Complete!/i).waitFor({ timeout: 20000 }).catch(async () => {
      const artifacts = await captureFailureArtifacts(page, 'sale-submit-failed');
      throw new Error(`Sale completion banner not observed after one Complete Sale click. Diagnostics: ${JSON.stringify(artifacts)}`);
    });
    report.posSale = true;

    stage = 'receipt';
    const reprintLink = page.getByRole('link', { name: /Reprint last receipt/i });
    await reprintLink.waitFor({ state: 'visible', timeout: 15000 });
    const receiptPath = await reprintLink.getAttribute('href');
    if (!receiptPath) throw new Error('Receipt path not found');
    report.receiptPath = receiptPath;

    const receiptPage = await context.newPage();
    await receiptPage.goto(`${BASE_URL}${receiptPath}`, { waitUntil: 'networkidle' });
    if (!/\/receipts\/.+/.test(receiptPage.url())) {
      throw new Error(`Unexpected receipt URL: ${receiptPage.url()}`);
    }
    report.receipt = true;
    await receiptPage.close();

    report.offlineCacheApi = true;

    stage = 'offline-sync';
    const product =
      cacheData.products.find((p) => p.onHandBase > 0 && Array.isArray(p.units) && p.units.length > 0) ||
      cacheData.products.find((p) => Array.isArray(p.units) && p.units.length > 0);
    if (!product) throw new Error('Could not find syncable product');
    const unit = product.units.find((u) => u.isBaseUnit) || product.units[0];
    if (!unit) throw new Error('Could not find unit for syncable product');
    const tillId = openContext.till.id;
    const storeId = openContext.store.id;
    const offlineSaleId = `offline-e2e-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const amountPence = Math.max(100, Number(product.sellingPriceBasePence) || 100) * 2;
    const payloadBase = {
      id: offlineSaleId,
      businessId: openContext.user.businessId,
      storeId,
      tillId,
      shiftId: openContext.shift.id,
      cashierUserId: openContext.user.id,
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
      payments: [{ method: 'CASH', amountPence }],
      orderDiscountType: 'NONE',
      orderDiscountValue: '',
      createdAt,
      localSaleTime: createdAt,
      idempotencyKey: offlineSaleId,
    };
    const payload = {
      ...payloadBase,
      payloadHash: hashOfflineSalePayload(payloadBase),
    };

    const syncResp1 = await page.request.post(`${BASE_URL}/api/offline/sync-sale`, { data: payload });
    const syncData1 = await syncResp1.json();
    if (syncResp1.status() !== 200 || !syncData1.success || !syncData1.invoiceId) {
      throw new Error(`First offline sync failed: ${syncResp1.status()} ${JSON.stringify(syncData1)}`);
    }
    report.offlineSyncCreate = true;
    report.syncedInvoiceId = syncData1.invoiceId;

    const syncResp2 = await page.request.post(`${BASE_URL}/api/offline/sync-sale`, { data: payload });
    const syncData2 = await syncResp2.json();
    // Idempotency contract: replay must return the same invoice. createSale short-circuits on
    // externalRef and may omit the "already synced" message that the payment.reference path used.
    const sameInvoice =
      Boolean(syncData1.invoiceId) && syncData2.invoiceId === syncData1.invoiceId;
    const legacyMessage = String(syncData2.message || '')
      .toLowerCase()
      .includes('already synced');
    if (syncResp2.status() !== 200 || !syncData2.success || !sameInvoice) {
      throw new Error(
        `Second offline sync did not behave idempotently: ${syncResp2.status()} ${JSON.stringify(syncData2)} ` +
          `(firstInvoiceId=${syncData1.invoiceId}, legacyMessage=${legacyMessage})`,
      );
    }
    report.offlineSyncIdempotent = true;

    const badResp = await page.request.post(`${BASE_URL}/api/offline/sync-sale`, {
      data: { ...payload, id: `${offlineSaleId}-bad`, storeId: 'invalid-store-id' },
    });
    const badData = await badResp.json();
    if (badResp.status() !== 400) {
      throw new Error(`Expected validation 400 for invalid storeId, got ${badResp.status()} ${JSON.stringify(badData)}`);
    }
    report.offlineSyncValidation = true;

    console.log(JSON.stringify({ success: true, report }, null, 2));
  } catch (error) {
    const artifacts = await captureFailureArtifacts(page, stage).catch(() => ({ stage }));
    console.error(
      JSON.stringify(
        {
          success: false,
          report,
          stage,
          artifacts,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await context.close();
    await browser.close();
  }
}

run();
