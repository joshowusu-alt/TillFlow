const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const CASHIER_EMAIL = process.env.E2E_CASHIER_EMAIL || 'cashier@store.com';
const CASHIER_PASSWORD = process.env.E2E_CASHIER_PASSWORD || 'Pass1234!';
const prisma = new PrismaClient();

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

async function waitForEnabled(locator, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for enabled element');
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
  const context = await browser.newContext();
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

  try {
    // Ensure the cashier password is set correctly (guards against partial backup restore)
    await ensureCashierPassword();

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    // Wait for hydration before interacting with the form
    await page.waitForTimeout(5000);
    await page.locator('input[name="email"]').fill(CASHIER_EMAIL);
    await page.locator('input[name="password"]').fill(CASHIER_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    // Poll for redirect (up to 30s) — more reliable than a fixed wait
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const url = page.url();
      if (/\/pos|\/onboarding/.test(url)) break;
      await page.waitForTimeout(500);
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

    // Wait for the product search input to be visible and React to be hydrated
    const productSearch = page.getByPlaceholder(/type product name/i);
    await productSearch.waitFor({ state: 'visible', timeout: 20000 });

    const searchTerm = String(saleProduct.name || '').slice(0, 6) || 'a';
    // Click first so onFocus → setProductDropdownOpen(true), then fill (which uses
    // native input events, bypassing the POS barcode-scanner global keydown handler)
    await productSearch.click();
    await productSearch.fill(searchTerm);
    // Use hasText locator — simpler and more reliable than accessible-name role matching
    const productButton = page.locator('button', { hasText: saleProduct.name });
    // Wait for the autocomplete dropdown to render the product button
    await productButton.first().waitFor({ state: 'visible', timeout: 10000 });
    await productButton.first().click();

    // Products with multiple units now stage for unit selection before adding
    // to cart. Race between the staging "Add to Cart" button and the direct
    // "Exact" qty button (single-unit products skip staging).
    const addToCartBtn = page.getByRole('button', { name: /Add to Cart/i });
    const exactBtn = page.getByRole('button', { name: /^Exact$/ });
    const outcome = await Promise.race([
      addToCartBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'staged'),
      exactBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'direct'),
    ]).catch(() => 'timeout');

    if (outcome === 'staged') {
      await addToCartBtn.click();
    }

    await exactBtn.click();

    const completeSaleButton = page.getByRole('button', { name: /Complete Sale/i });
    await waitForEnabled(completeSaleButton);
    await completeSaleButton.click();
    await page.getByText(/Sale Complete!/i).waitFor({ timeout: 20000 });
    report.posSale = true;

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

    const product =
      cacheData.products.find((p) => p.onHandBase > 0 && Array.isArray(p.units) && p.units.length > 0) ||
      cacheData.products.find((p) => Array.isArray(p.units) && p.units.length > 0);
    if (!product) throw new Error('Could not find syncable product');
    const unit = product.units.find((u) => u.isBaseUnit) || product.units[0];
    if (!unit) throw new Error('Could not find unit for syncable product');
    const till = cacheData.tills?.[0];
    if (!till?.id) throw new Error('No till available for offline sync payload');

    const offlineSaleId = `offline-e2e-${Date.now()}`;
    const payload = {
      id: offlineSaleId,
      storeId: cacheData.store.id,
      tillId: till.id,
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
      payments: [{ method: 'CASH', amountPence: 1000000 }],
      orderDiscountType: 'NONE',
      orderDiscountValue: '',
      createdAt: new Date().toISOString(),
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
    if (
      syncResp2.status() !== 200 ||
      !syncData2.success ||
      !String(syncData2.message || '').toLowerCase().includes('already synced')
    ) {
      throw new Error(`Second offline sync did not behave idempotently: ${syncResp2.status()} ${JSON.stringify(syncData2)}`);
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
    console.error(JSON.stringify({ success: false, report, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await context.close();
    await browser.close();
  }
}

run();
