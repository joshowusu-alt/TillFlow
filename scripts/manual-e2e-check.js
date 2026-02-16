const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:6200';

async function waitForEnabled(locator, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for enabled element');
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
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    // In dev mode, server-action hydration can lag briefly before redirect handling works.
    await page.waitForTimeout(10000);
    await page.locator('input[name="email"]').fill('cashier@store.com');
    await page.locator('input[name="password"]').fill('Pass1234!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(5000);
    const postLoginUrl = page.url();
    if (!/\/pos/.test(postLoginUrl)) {
      await page.screenshot({ path: '.playwright-mcp/login-failed.png', fullPage: true });
      const errorBanner = await page.locator('div.rounded-xl.border.border-rose-300').first().textContent().catch(() => null);
      throw new Error(`Login did not redirect to /pos. URL: ${postLoginUrl}. ErrorBanner: ${errorBanner ?? 'none'}`);
    }
    report.login = true;

    const productSearch = page.getByPlaceholder(/type product name/i);
    await productSearch.fill('Coca');
    await page.getByRole('button', { name: /Coca-Cola/i }).first().click();
    await page.getByRole('button', { name: /^Exact$/ }).click();

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

    const cacheResp = await page.request.get(`${BASE_URL}/api/offline/cache-data`);
    if (cacheResp.status() !== 200) {
      throw new Error(`Offline cache API returned ${cacheResp.status()}`);
    }
    const cacheData = await cacheResp.json();
    if (!Array.isArray(cacheData.products) || cacheData.products.length === 0) {
      throw new Error('Offline cache API returned no products');
    }
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
    await context.close();
    await browser.close();
  }
}

run();
