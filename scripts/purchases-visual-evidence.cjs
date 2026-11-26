/* CI-only visual comparison of the actual base and candidate apps, on one disposable SQLite DB. */
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.match(process.env.DATABASE_URL || '', /^file:.*\/ci-purchase-visual\.db$/);
  const { prisma } = await openGuardedPrismaClient();
  try {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_OWNER_EMAIL } });
    const store = await prisma.store.findFirstOrThrow({ where: { businessId: owner.businessId } });
    const supplier = await prisma.supplier.findFirstOrThrow({ where: { businessId: owner.businessId, name: 'Makola Wholesale' } });
    const product = await prisma.product.findFirstOrThrow({ where: { businessId: owner.businessId, name: 'Coca-Cola 500ml' }, include: { productUnits: true } });
    const unit = product.productUnits.find(row => row.isBaseUnit);
    assert.ok(unit);
    // Presentation-only, synthetic rows; this job's database is discarded after capture.
    for (const [number, paid, status, overdue] of [[99, 5000, 'PAID', true], [98, 0, 'UNPAID', true], [97, 1000, 'PART_PAID', false], [96, 0, 'UNPAID', false]]) {
      await prisma.purchaseInvoice.create({ data: {
        businessId: owner.businessId, storeId: store.id, supplierId: supplier.id,
        transactionNumber: `PUR-${String(number).padStart(6, '0')}`, paymentStatus: status,
        dueDate: new Date(Date.now() + (overdue ? -7 : 7) * 86400000), subtotalPence: 5000, vatPence: 0, totalPence: 5000,
        lines: { create: { productId: product.id, unitId: unit.unitId, qtyInUnit: 10, qtyBase: 10, unitCostPence: 500, lineSubtotalPence: 5000, lineVatPence: 0, lineTotalPence: 5000 } },
        ...(paid ? { payments: { create: { amountPence: paid, method: 'CASH', businessId: owner.businessId } } } : {}),
      } });
    }
  } finally { await prisma.$disconnect(); }

  mkdirSync('tmp/purchases-visual', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [label, port] of [['before', 6201], ['after', 6200]]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
      try {
        const page = await context.newPage();
        const base = `http://localhost:${port}`;
        await page.goto(`${base}/login`);
        await page.locator('input[name=email]').fill(process.env.E2E_OWNER_EMAIL);
        await page.locator('input[name=password]').fill(process.env.E2E_OWNER_PASSWORD);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.waitForURL(url => !url.pathname.startsWith('/login'));
        await page.goto(`${base}/purchases`);
        await page.getByRole('heading', { name: 'Purchases', exact: true }).waitFor();
        await page.locator('table').getByText('PUR-000099', { exact: false }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `tmp/purchases-visual/${label}-list.png`, fullPage: true, animations: 'disabled' });
        await page.getByRole('button', { name: 'Record purchase', exact: true }).click();
        const form = page.locator('#record-purchase-form');
        await form.getByRole('button', { name: 'Add line', exact: true }).waitFor();
        if (label === 'after') {
          assert.equal(await form.locator('input[type=file]').count(), 0);
          assert.equal(await form.getByPlaceholder(/Type to search product/i).inputValue(), '');
          assert.equal(await form.locator('#purchase-quantity').inputValue(), '');
        }
        await form.screenshot({ path: `tmp/purchases-visual/${label}-form.png`, animations: 'disabled' });
        if (label === 'after') {
          // Prove the simplified form really records an item through the browser,
          // not merely that the blank form renders. No upload is supplied.
          await form.locator('select[name=supplierId]').selectOption({ index: 1 });
          await form.getByPlaceholder(/Type to search product/i).fill('Coca-Cola 500ml');
          await form.getByRole('button', { name: /Coca-Cola 500ml/i }).click();
          await form.locator('#purchase-quantity').fill('2');
          await form.locator('#purchase-unit-cost').fill('5.00');
          await form.getByRole('button', { name: 'Add line', exact: true }).click();
          await page.waitForFunction(() => JSON.parse(document.querySelector('#record-purchase-form input[name=cart]').value).length === 1);
          await form.getByRole('button', { name: 'Record purchase', exact: true }).click();
          await page.waitForURL(/\/purchases\/[^/?]+\?created=1/);
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
