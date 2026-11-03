/* Local running-app QA only. Creates and removes its own isolated tenant. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const bcrypt = require('bcryptjs');
const { mkdirSync } = require('node:fs');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

(async () => {
  const base = new URL(process.env.BASE_URL || 'http://localhost:6200');
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Conversion browser QA requires a local running app.');
  for (const font of ['jakarta-latin', 'dm-sans-latin']) {
    const response = await fetch(`${base.origin}/fonts/${font}.woff2`, { redirect: 'manual' });
    assert.equal(response.status, 200, `Signed-out ${font} download must not redirect to login`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2', `${font} must return the font binary`);
  }
  console.log('[conversion-browser] signed-out font downloads return WOFF2 binaries');
  const { prisma: db } = await openGuardedPrismaClient();
  let browser, businessId, storeId, unitId;
  try {
    const suffix = randomUUID();
    const email = `conversion-browser-${suffix}@example.invalid`;
    const password = randomUUID();
    businessId = (await db.business.create({ data: { name: 'Disposable conversion browser QA', currency: 'GHS', timezone: 'Africa/Accra', plan: 'PRO', selectedPlan: 'PRO', planStatus: 'ACTIVE', subscriptionStatus: 'PAID_ACTIVE', firstPaymentAt: new Date('2026-01-01'), currentPeriodEndsAt: new Date('2030-01-01'), onboardingCompletedAt: new Date(), guidedSetup: false } })).id;
    storeId = (await db.store.create({ data: { businessId, name: 'Conversion QA branch', isMainStore: true } })).id;
    await db.user.create({ data: { businessId, name: 'Conversion QA owner', email, passwordHash: await bcrypt.hash(password, 10), role: 'OWNER' } });
    unitId = (await db.unit.create({ data: { name: `counted-${suffix}`, pluralName: 'counted units' } })).id;
    const source = await db.product.create({ data: { businessId, name: 'QA Conversion Sugar Bag', barcode: `QA-BAG-${suffix}`, sellingPriceBasePence: 60000, defaultCostBasePence: 50000, productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } } } });
    const destination = await db.product.create({ data: { businessId, name: 'QA Conversion Sugar Cups', barcode: `QA-CUP-${suffix}`, sellingPriceBasePence: 1000, defaultCostBasePence: 99999, productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } } } });
    const alternateBarcode = `QA-ALTERNATE-${suffix}`;
    await db.productBarcode.create({ data: { businessId, productId: destination.id, code: alternateBarcode } });
    await db.inventoryBalance.create({ data: { storeId, productId: source.id, qtyOnHandBase: 10, avgCostBasePence: 50000, knownValuePence: 500000, unvaluedQtyBase: 0 } });
    browser = await chromium.launch({ headless: true });
    for (const [index, width] of [320, 390, 1280].entries()) {
      const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(`${base.origin}/login`);
        await page.locator('input[name=email]').fill(email);
        await page.locator('input[name=password]').fill(password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(url => !url.pathname.startsWith('/login'));
        await page.goto(`${base.origin}/inventory/conversions`);
        await page.getByRole('heading', { name: 'Convert stock', exact: true }).waitFor().catch(async () => {
          throw new Error(`Conversion page unavailable: ${new URL(page.url()).pathname}; headings: ${await page.getByRole('heading').allTextContents()}`);
        });
        mkdirSync('tmp/ui-programme-evidence/stock-conversion', { recursive: true });
        await page.screenshot({ path: `tmp/ui-programme-evidence/stock-conversion/empty-${width}.png`, fullPage: true });
        await page.locator('#source-search').fill(source.barcode);
        await page.getByRole('button', { name: source.name, exact: true }).click();
        await page.locator('#destination-search').fill(alternateBarcode);
        await page.getByRole('button', { name: destination.name, exact: true }).click();
        assert.equal(await page.locator('input[name=sourceQty]').inputValue(), '');
        assert.equal(await page.locator('input[name=destinationQty]').inputValue(), '');
        await page.locator('input[name=sourceQty]').fill('1');
        await page.locator('input[name=destinationQty]').fill('95');
        await page.locator('textarea[name=note]').fill(`Opened one complete bag; counted 95 cups at ${width}px`);
        assert.equal(await page.getByRole('button', { name: 'Save conversion', exact: true }).isEnabled(), false);
        await page.getByText('No income or expense is created.', { exact: false }).waitFor();
        assert.equal(await page.locator('input[name=expectedCostPence]').inputValue(), '50000');
        const overflows = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(overflows.document <= overflows.viewport + 1, JSON.stringify(overflows));
        await page.screenshot({ path: `tmp/ui-programme-evidence/stock-conversion/review-${width}.png`, fullPage: true });
        await page.locator('input[name=confirmed]').check();
        await page.getByRole('button', { name: 'Save conversion', exact: true }).click();
        await Promise.all([page.waitForURL(url => Boolean(url.searchParams.get('conversion'))), page.getByText('Conversion saved.', { exact: false }).waitFor()]).catch(async () => {
          const alerts = await page.getByRole('alert').allTextContents();
          const from = await db.inventoryBalance.findUnique({ where: { storeId_productId: { storeId, productId: source.id } } });
          const to = await db.inventoryBalance.findUnique({ where: { storeId_productId: { storeId, productId: destination.id } } });
          throw new Error(`Save failed at ${width}px; alerts=${JSON.stringify(alerts)}; source=${JSON.stringify(from)}; destination=${JSON.stringify(to)}`);
        });
        assert.ok(new URL(page.url()).searchParams.get('conversion'), 'Success must have a durable conversion reference');
        await page.reload();
        await page.getByText('Conversion saved.', { exact: false }).waitFor();
        await page.getByRole('heading', { name: 'Recent conversions in Conversion QA branch' }).waitFor();
        await page.getByText(`Opened one complete bag; counted 95 cups at ${width}px`, { exact: true }).waitFor();
        await page.screenshot({ path: `tmp/ui-programme-evidence/stock-conversion/saved-${width}.png`, fullPage: true });
        const from = await db.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: source.id } } });
        const to = await db.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId, productId: destination.id } } });
        assert.equal(from.qtyOnHandBase, 9 - index); assert.equal(to.qtyOnHandBase, 95 * (index + 1));
        assert.equal(from.knownValuePence + to.knownValuePence, 500000);
        assert.equal(to.knownValuePence, 50000 * (index + 1));
        console.log(`[conversion-browser] ${width}px: barcode selection, empty counts, cost review, confirmation, save, history and cost conservation passed`);
      } finally { await context.close(); }
    }
    const journals = await db.journalEntry.findMany({ where: { businessId }, include: { lines: { include: { account: true } } } });
    assert.equal(journals.length, 3);
    for (const journal of journals) {
      assert.equal(journal.lines.length, 2);
      assert.ok(journal.lines.every(line => line.account.code === '1200'));
      assert.equal(journal.lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0), 0);
    }
    assert.equal(await db.stockMovement.count({ where: { storeId } }), 6);
    assert.equal(await db.moneyIdempotency.count({ where: { businessId, commandKind: 'STOCK_CONVERSION' } }), 3);
    assert.equal(await db.purchasePayment.count({ where: { businessId } }), 0);
    assert.equal(await db.expense.count({ where: { businessId } }), 0);
    console.log('[conversion-browser] all three conversions balanced; zero income, expense, cash or supplier payment postings');
  } finally {
    if (browser) await browser.close();
    if (businessId) {
      await db.journalLine.deleteMany({ where: { journalEntry: { businessId } } });
      await db.journalEntry.deleteMany({ where: { businessId } });
      await db.account.deleteMany({ where: { businessId } });
      await db.stockMovement.deleteMany({ where: { storeId } });
      await db.auditLog.deleteMany({ where: { businessId } });
      await db.moneyIdempotency.deleteMany({ where: { businessId } });
      await db.inventoryBalance.deleteMany({ where: { storeId } });
      await db.productUnit.deleteMany({ where: { product: { businessId } } });
      await db.product.deleteMany({ where: { businessId } });
      if (unitId) await db.unit.deleteMany({ where: { id: unitId } });
      await db.session.deleteMany({ where: { user: { businessId } } });
      await db.user.deleteMany({ where: { businessId } });
      await db.store.deleteMany({ where: { businessId } });
      await db.business.deleteMany({ where: { id: businessId } });
    }
    await db.$disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
