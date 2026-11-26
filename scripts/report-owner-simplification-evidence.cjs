/* Real master/candidate report pages on one CI-only disposable SQLite database. */
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

const from = '2026-11-01', to = '2026-11-26';
const money = n => `GH₵${(n / 100).toFixed(2)}`;
const at = key => new Date(`${key}T12:00:00.000Z`);
const folder = 'tmp/report-owner-simplification';
const metrics = ['revenue', 'cogs', 'grossProfit', 'otherExpenses', 'netProfit'];
const expected = { revenue: money(32000), cogs: money(16000), grossProfit: money(16000), otherExpenses: money(5000), netProfit: money(11000) };

async function seed() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.match(process.env.DATABASE_URL || '', /^file:.*\/ci-report-owner-visual\.db$/);
  const { prisma } = await openGuardedPrismaClient();
  try {
    const password = randomBytes(18).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    const unit = await prisma.unit.create({ data: { name: 'Evidence item', pluralName: 'Evidence items' } });
    const fixtures = {};
    for (const state of ['complete', 'profit-incomplete', 'stock-only']) {
      const business = await prisma.business.create({ data: {
        name: `Synthetic report proof — ${state}`, currency: 'GHS', timezone: 'Africa/Accra',
        plan: 'PRO', selectedPlan: 'PRO', planStatus: 'PAID_ACTIVE', subscriptionStatus: 'PAID_ACTIVE',
        billingAmount: 0, onboardingCompletedAt: new Date(), guidedSetup: false,
      } });
      const businessId = business.id;
      const owner = await prisma.user.create({ data: { businessId, name: 'Evidence Owner', email: `report-proof-${state}@example.test`, passwordHash, role: 'OWNER' } });
      const store = await prisma.store.create({ data: { businessId, name: 'Synthetic Main Branch', isMainStore: true } });
      const organization = await prisma.organization.create({ data: { businessId, name: 'Synthetic report proof' } });
      await prisma.branch.create({ data: { businessId, organizationId: organization.id, storeId: store.id, name: store.name, code: 'SYNTHETIC' } });
      const till = await prisma.till.create({ data: { storeId: store.id, name: 'Evidence Till' } });
      const products = [];
      for (const [name, price] of [['Evidence rice', 10000], ['Evidence oil', 6000]]) {
        const product = await prisma.product.create({ data: { businessId, name, sellingPriceBasePence: price, defaultCostBasePence: price / 2, isTaxable: false,
          productUnits: { create: { unitId: unit.id, isBaseUnit: true, conversionToBase: 1 } } } });
        products.push(product);
        await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 10, avgCostBasePence: price / 2, knownValuePence: 5 * price, unvaluedQtyBase: 0 } });
      }
      if (state === 'stock-only') {
        const product = await prisma.product.create({ data: { businessId, name: 'Evidence stock without cost', sellingPriceBasePence: 5000, defaultCostBasePence: 0, productUnits: { create: { unitId: unit.id, isBaseUnit: true, conversionToBase: 1 } } } });
        await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 5, avgCostBasePence: 0, knownValuePence: 0, unvaluedQtyBase: 5 } });
      }
      const cash = await prisma.account.create({ data: { businessId, code: '1000', name: 'Cash', type: 'ASSET' } });
      const expenseAccount = await prisma.account.create({ data: { businessId, code: '6000', name: 'Rent', type: 'EXPENSE' } });
      const expense = await prisma.expense.create({ data: { businessId, storeId: store.id, userId: owner.id, accountId: expenseAccount.id, amountPence: 5000, method: 'CASH', paymentStatus: 'PAID', createdAt: at('2026-11-10'), notes: 'Synthetic rent' } });
      await prisma.journalEntry.create({ data: { businessId, description: 'Synthetic rent', referenceType: 'EXPENSE', referenceId: expense.id, entryDate: at('2026-11-10'), lines: { create: [
        { accountId: expenseAccount.id, debitPence: 5000, creditPence: 0 }, { accountId: cash.id, debitPence: 0, creditPence: 5000 },
      ] } } });
      async function sale(key, product, qty, number, missing = false, vat = 0) {
        const subtotal = product.sellingPriceBasePence * qty;
        await prisma.salesInvoice.create({ data: { businessId, storeId: store.id, tillId: till.id, cashierUserId: owner.id,
          transactionNumber: `EVIDENCE-${number}`, paymentStatus: 'PAID', subtotalPence: subtotal, vatPence: vat,
          totalPence: subtotal + vat, createdAt: at(key),
          lines: { create: { productId: product.id, unitId: unit.id, qtyBase: qty, qtyInUnit: qty,
            unitPricePence: product.sellingPriceBasePence, lineSubtotalPence: subtotal, lineVatPence: vat, lineTotalPence: subtotal + vat,
            lineCostPence: missing ? 0 : subtotal / 2, costBasis: missing ? 'UNVERIFIED_STOCK_V1' : 'INVENTORY_VALUE_V1' } },
          payments: { create: { businessId, method: 'CASH', status: 'CONFIRMED', amountPence: subtotal + vat, receivedAt: at(key), confirmedAt: at(key), receiptOrigin: 'RECEIVED_AT_SALE' } },
        } });
      }
      await sale('2026-11-08', products[0], 2, 1, state === 'profit-incomplete');
      await sale('2026-11-12', products[1], 2, 2);
      await sale('2026-10-15', products[0], 2, 3, false, 3000);
      fixtures[state] = { email: owner.email, password, storeId: store.id };
    }
    return fixtures;
  } finally { await prisma.$disconnect(); }
}

async function login(page, base, fixture) {
  await page.goto(base + '/login');
  await page.locator('input[name=email]').fill(fixture.email);
  await page.locator('input[name=password]').fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

async function incomeValues(page, selected = metrics) {
  const values = {};
  for (const metric of selected) {
    const links = page.locator(`a[href*="/reports/income-statement/entries?metric=${metric}&"]`);
    const labels = await links.evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('aria-label')))].filter(Boolean));
    assert.equal(labels.length, 1, `Missing or inconsistent ${metric}`);
    values[metric] = labels[0].slice(labels[0].lastIndexOf(': ') + 2);
  }
  return values;
}

async function movementValues(page) {
  const values = {};
  values.sales = await page.locator('[data-stage3b-hero] [data-financial-amount]').innerText();
  values.earlier = await page.locator('[data-testid=owner-summary-strip] [data-financial-amount]').nth(1).innerText();
  for (const [key, names] of Object.entries({
    received: ['Confirmed receipts', 'Money received'], refunds: ['Refunds'],
    momo: ['MoMo to confirm', 'MoMo waiting to be confirmed'], gap: ['Sales and receipts gap', 'Sales not yet received', 'Money received above sales'],
  })) {
    const metric = page.locator('[data-stage3b-metric]').filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^(?:${names.join('|')})$`) }) });
    assert.equal(await metric.count(), 1, key);
    values[key] = await metric.locator('[data-financial-amount]').textContent();
  }
  const product = page.getByRole('heading', { name: /^(Largest|Biggest) product changes$/ }).locator('xpath=ancestor::section[1]');
  values.products = await product.locator('[data-report-value-bars] a').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), amount: node.querySelector('[data-financial-amount]')?.textContent })));
  assert.ok(values.products.length > 0);
  return values;
}

async function geometry(page, width) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflows at ${width}px`);
  const chips = page.locator('[data-report-period-chips] a');
  assert.equal(await chips.count(), 5);
  const boxes = await chips.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right };
  }));
  for (const box of boxes) assert.ok(box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= width, JSON.stringify(box));
  assert.ok(new Set(boxes.map(box => box.top)).size > 1, 'Chips should wrap at phone sizes');
  const links = await page.locator('a[href*="/reports/income-statement/entries?metric="]:visible').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  assert.ok(links.every(height => height >= 44), 'Report amount link below 44px');
}

async function main() {
  const fixtures = await seed();
  mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch();
  const values = {};
  try {
    for (const [side, port] of [['before', 6201], ['after', 6200]]) {
      values[side] = {};
      for (const [width, height] of [[360, 740], [390, 844]]) {
        for (const [state, fixture] of Object.entries(fixtures)) {
          const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
          try {
            const page = await context.newPage();
            const base = `http://127.0.0.1:${port}`;
            await context.route('**/*', route => route.request().url().startsWith(base + '/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
            await login(page, base, fixture);
            await page.goto(`${base}/reports/income-statement?from=${from}&to=${to}`);
            await page.getByRole('heading', { name: 'Income Statement', exact: true }).waitFor();
            await page.evaluate(() => document.fonts.ready);
            const income = await incomeValues(page);
            const wanted = state === 'profit-incomplete' ? { ...expected, cogs: 'Costs incomplete', grossProfit: 'Costs incomplete', netProfit: 'Costs incomplete' } : expected;
            assert.deepEqual(income, wanted);
            values[side][`${width}-${state}`] = income;
            if (side === 'after') {
              await geometry(page, width);
              assert.equal(await page.getByText(/Profit is incomplete:/).count(), state === 'profit-incomplete' ? 1 : 0);
              assert.equal(await page.getByRole('link', { name: 'Add cost →' }).count(), state === 'stock-only' ? 1 : 0);
              assert.equal(await page.getByText('Whole business — not separated by branch').count(), 0);
            }
            await page.screenshot({ path: `${folder}/${side}-${width}x${height}-income-${state}.png`, animations: 'disabled' });
            if (state === 'stock-only' && side === 'after') {
              const link = page.getByRole('link', { name: 'Add cost →' });
              await link.click();
              await page.getByText('Evidence stock without cost', { exact: true }).first().waitFor();
              await page.goto(base + '/products/cost-resolution');
              await page.getByText('Evidence stock without cost', { exact: true }).first().waitFor();
            }
            if (state !== 'complete') continue;
            const movementUrl = `${base}/reports/business-movement?preset=equal_length_custom&currentFrom=${from}&currentTo=${to}&storeId=${fixture.storeId}`;
            await page.goto(movementUrl);
            await page.getByRole('heading', { name: 'Business movement', exact: true }).waitFor();
            await page.evaluate(() => document.fonts.ready);
            const movement = await movementValues(page);
            assert.equal(movement.sales, income.revenue, 'Same dates and non-VAT sales must agree across reports');
            values[side][`${width}-movement`] = movement;
            if (side === 'after') {
              await geometry(page, width);
              assert.equal(await page.getByLabel('Branch', { exact: true }).count(), 0);
              assert.equal(await page.locator('[data-report-header-actions] > a').count(), 1);
            }
            await page.screenshot({ path: `${folder}/${side}-${width}x${height}-movement-top.png`, animations: 'disabled' });
            await page.getByRole('heading', { name: /^(Largest|Biggest) product changes$/ }).scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${folder}/${side}-${width}x${height}-movement-products.png`, animations: 'disabled' });
            // Taxed sale is intentionally outside the screenshot's current period.
            // Existing engines differ: income excludes VAT, movement includes it.
            await page.goto(`${base}/reports/income-statement?from=2026-10-15&to=2026-10-15`);
            const vatIncome = await incomeValues(page, ['revenue']);
            await page.goto(`${base}/reports/business-movement?preset=equal_length_custom&currentFrom=2026-10-15&currentTo=2026-10-15&storeId=${fixture.storeId}`);
            const vatMovement = await page.locator('[data-stage3b-hero] [data-financial-amount]').innerText();
            assert.equal(vatIncome.revenue, money(20000));
            assert.equal(vatMovement, money(23000));
            values[side][`${width}-vat`] = { income: vatIncome.revenue, movement: vatMovement };
          } finally { await context.close(); }
        }
      }
    }
    assert.deepEqual(values.after, values.before, 'Master/candidate fixed-fixture money values differ');
    writeFileSync(`${folder}/figure-comparison.json`, JSON.stringify(values, null, 2));
    console.log('PASS: 20 phone images, same-period non-VAT sales agree, all captured canonical figures unchanged; VAT distinction preserved.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
