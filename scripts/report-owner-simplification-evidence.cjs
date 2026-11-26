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

async function seed(warmup) {
  assert.ok(process.env.GITHUB_ACTIONS === 'true' || process.argv.includes('--fixture-only'), 'CI or explicit local fixture-only diagnostic required');
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
      // Home performs a one-time SQLite-only legacy date normalisation.
      // Start both real sessions before posting any report transactions so
      // this fixture represents sales recorded after sign-in rather than
      // pre-existing legacy SQLite data. Do not modify the app normaliser.
      if (state === 'complete' && warmup) await warmup({ email: owner.email, password });
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
      const salesAccount = await prisma.account.create({ data: { businessId, code: '4000', name: 'Sales', type: 'INCOME' } });
      const inventoryAccount = await prisma.account.create({ data: { businessId, code: '1200', name: 'Inventory', type: 'ASSET' } });
      const costAccount = await prisma.account.create({ data: { businessId, code: '5000', name: 'Cost of goods sold', type: 'EXPENSE' } });
      const vatAccount = await prisma.account.create({ data: { businessId, code: '2100', name: 'VAT payable', type: 'LIABILITY' } });
      const expenseAccount = await prisma.account.create({ data: { businessId, code: '6000', name: 'Rent', type: 'EXPENSE' } });
      const expense = await prisma.expense.create({ data: { businessId, storeId: store.id, userId: owner.id, accountId: expenseAccount.id, amountPence: 5000, method: 'CASH', paymentStatus: 'PAID', createdAt: at('2026-11-10'), notes: 'Synthetic rent' } });
      await prisma.journalEntry.create({ data: { businessId, description: 'Synthetic rent', referenceType: 'EXPENSE', referenceId: expense.id, entryDate: at('2026-11-10'), lines: { create: [
        { accountId: expenseAccount.id, debitPence: 5000, creditPence: 0 }, { accountId: cash.id, debitPence: 0, creditPence: 5000 },
      ] } } });
      async function sale(key, product, qty, number, missing = false, vat = 0) {
        const subtotal = product.sellingPriceBasePence * qty;
        const invoice = await prisma.salesInvoice.create({ data: { businessId, storeId: store.id, tillId: till.id, cashierUserId: owner.id,
          transactionNumber: `EVIDENCE-${number}`, paymentStatus: 'PAID', subtotalPence: subtotal, vatPence: vat,
          totalPence: subtotal + vat, createdAt: at(key),
          lines: { create: { productId: product.id, unitId: unit.id, qtyBase: qty, qtyInUnit: qty,
            unitPricePence: product.sellingPriceBasePence, lineSubtotalPence: subtotal, lineVatPence: vat, lineTotalPence: subtotal + vat,
            lineCostPence: missing ? 0 : subtotal / 2, costBasis: missing ? 'UNVERIFIED_STOCK_V1' : 'INVENTORY_VALUE_V1' } },
          payments: { create: { businessId, method: 'CASH', status: 'CONFIRMED', amountPence: subtotal + vat, receivedAt: at(key), confirmedAt: at(key), receiptOrigin: 'RECEIVED_AT_SALE' } },
        } });
        // Match a posted sale, not just an isolated invoice. The journal balances
        // independently and the existing sale-line report engine still owns revenue/COGS.
        await prisma.journalEntry.create({ data: {
          businessId, referenceType: 'SALES_INVOICE', referenceId: invoice.id, entryDate: at(key),
          description: 'Synthetic posted sale', lines: { create: [
            { accountId: cash.id, debitPence: subtotal + vat, creditPence: 0 },
            { accountId: salesAccount.id, debitPence: 0, creditPence: subtotal },
            ...(vat ? [{ accountId: vatAccount.id, debitPence: 0, creditPence: vat }] : []),
            ...(!missing ? [
              { accountId: costAccount.id, debitPence: subtotal / 2, creditPence: 0 },
              { accountId: inventoryAccount.id, debitPence: 0, creditPence: subtotal / 2 },
            ] : []),
          ] },
        } });
      }
      await sale('2026-11-08', products[0], 2, 1, state === 'profit-incomplete');
      await sale('2026-11-12', products[1], 2, 2);
      await sale('2026-10-15', products[0], 2, 3, false, 3000);
      const seeded = await prisma.salesInvoice.findMany({
        where: { businessId, createdAt: { gte: new Date(from), lt: new Date('2026-11-27') } },
        include: { lines: true },
      });
      assert.equal(seeded.length, 2, 'Expected two current-period synthetic invoices');
      assert.equal(seeded.flatMap(invoice => invoice.lines).reduce((sum, line) => sum + line.lineSubtotalPence, 0), 32000);
      fixtures[state] = { email: owner.email, password, storeId: store.id, businessId };
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
  const targets = await page.locator('[data-report-header-actions] > a:visible, [data-stage3b-actions] > summary:visible, [data-report-value-bars] a:visible, [data-reports-focus-scope] details > summary:visible, a:visible[href="/products?issue=MISSING_COST"]').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(); return { label: node.textContent, height: rect.height, width: rect.width };
  }));
  for (const target of targets) assert.ok(target.height >= 44 && target.width >= 44, JSON.stringify(target));
}

async function main() {
  if (process.argv.includes('--fixture-only')) {
    await seed();
    return;
  }
  mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch();
  const values = {};
  const failures = [];
  async function check(label, fn) {
    try { await fn(); }
    catch (error) { failures.push({ label, message: error.message }); console.error(label, error.message); }
  }
  try {
    const fixtures = await seed(async fixture => {
      for (const port of [6201, 6200]) {
        const base = `http://127.0.0.1:${port}`;
        const context = await browser.newContext({ serviceWorkers: 'block' });
        try {
          await context.route('**/*', route => route.request().url().startsWith(base + '/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
          const page = await context.newPage();
          await login(page, base, fixture);
          await page.goto(base + '/home', { waitUntil: 'networkidle' });
          assert.equal(new URL(page.url()).pathname, '/home');
        } finally { await context.close(); }
      }
      console.log('Both real apps completed Home startup before report transactions were posted.');
    });
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
            await page.screenshot({ path: `${folder}/${side}-${width}x${height}-income-${state}.png`, animations: 'disabled' });
            const income = await incomeValues(page);
            const wanted = state === 'profit-incomplete' ? { ...expected, cogs: 'Costs incomplete', grossProfit: 'Costs incomplete', netProfit: 'Costs incomplete' } : expected;
            if (JSON.stringify(income) !== JSON.stringify(wanted)) {
              // Report only synthetic fixture diagnostics; never print account credentials or session data.
              const { prisma } = await openGuardedPrismaClient();
              try {
                const invoices = await prisma.salesInvoice.findMany({
                  where: { businessId: fixture.businessId }, select: { createdAt: true, paymentStatus: true, totalPence: true,
                    lines: { select: { lineSubtotalPence: true, lineCostPence: true, costBasis: true } } },
                });
                console.log('Synthetic invoice diagnostic:', JSON.stringify(invoices));
                const inRange = await prisma.salesInvoice.count({ where: { businessId: fixture.businessId, createdAt: { gte: new Date(from), lt: new Date('2026-11-27') } } });
                console.log('Synthetic current-period invoice count after sign-in:', inRange);
                console.log('Report range link:', await page.locator('a[href*="/reports/income-statement/entries?metric=revenue"]').first().getAttribute('href'));
              } finally { await prisma.$disconnect(); }
            }
            await check(`${side} ${width} ${state} income figures`, () => assert.deepEqual(income, wanted));
            values[side][`${width}-${state}`] = income;
            if (side === 'after') {
              await check(`${width} ${state} income layout`, async () => {
                await geometry(page, width);
                assert.equal(await page.getByText(/Profit is incomplete:/).count(), state === 'profit-incomplete' ? 1 : 0);
                assert.equal(await page.getByRole('link', { name: 'Add cost →' }).count(), state === 'stock-only' ? 1 : 0);
                assert.equal(await page.getByText('Whole business — not separated by branch').count(), 0);
              });
            }
            if (state === 'stock-only' && side === 'after') {
              await check(`${width} affected product link`, async () => {
                const link = page.getByRole('link', { name: 'Add cost →' });
                await link.click();
                await page.getByText('Evidence stock without cost', { exact: true }).first().waitFor();
                await page.goto(base + '/products/cost-resolution');
                await page.getByText('Evidence stock without cost', { exact: true }).first().waitFor();
              });
            }
            if (state !== 'complete') continue;
            const movementUrl = `${base}/reports/business-movement?preset=equal_length_custom&currentFrom=${from}&currentTo=${to}&storeId=${fixture.storeId}`;
            await page.goto(movementUrl);
            await page.getByRole('heading', { name: 'Business movement', exact: true }).waitFor();
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({ path: `${folder}/${side}-${width}x${height}-movement-top.png`, animations: 'disabled' });
            const movement = await movementValues(page);
            await check(`${side} ${width} same-period sales equality`, () => assert.equal(movement.sales, income.revenue, 'Same dates and non-VAT sales must agree across reports'));
            values[side][`${width}-movement`] = movement;
            if (side === 'after') {
              await check(`${width} movement layout`, async () => {
                await geometry(page, width);
                assert.equal(await page.getByLabel('Branch', { exact: true }).count(), 0);
                assert.equal(await page.locator('[data-report-header-actions] > a').count(), 1);
              });
            }
            await page.getByRole('heading', { name: /^(Largest|Biggest) product changes$/ }).scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${folder}/${side}-${width}x${height}-movement-products.png`, animations: 'disabled' });
            // Taxed sale is intentionally outside the screenshot's current period.
            // Existing engines differ: income excludes VAT, movement includes it.
            await page.goto(`${base}/reports/income-statement?from=2026-10-15&to=2026-10-15`);
            const vatIncome = await incomeValues(page, ['revenue']);
            await page.goto(`${base}/reports/business-movement?preset=equal_length_custom&currentFrom=2026-10-15&currentTo=2026-10-15&storeId=${fixture.storeId}`);
            const vatMovement = await page.locator('[data-stage3b-hero] [data-financial-amount]').innerText();
            await check(`${side} ${width} VAT distinction`, () => {
              assert.equal(vatIncome.revenue, money(20000));
              assert.equal(vatMovement, money(23000));
            });
            values[side][`${width}-vat`] = { income: vatIncome.revenue, movement: vatMovement };
          } catch (error) {
            failures.push({ label: `${side} ${width} ${state} browser journey`, message: error.message });
            console.error(error.message);
          } finally { await context.close(); }
        }
      }
    }
    await check('Master/candidate fixed-fixture money values', () => assert.deepEqual(values.after, values.before, 'Master/candidate fixed-fixture money values differ'));
    writeFileSync(`${folder}/figure-comparison.json`, JSON.stringify(values, null, 2));
    writeFileSync(`${folder}/verification-failures.json`, JSON.stringify(failures, null, 2));
    assert.equal(failures.length, 0, JSON.stringify(failures));
    console.log('PASS: 20 phone images, same-period non-VAT sales agree, all captured canonical figures unchanged; VAT distinction preserved.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
