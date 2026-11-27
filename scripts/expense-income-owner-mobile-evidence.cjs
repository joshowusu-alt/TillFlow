/* Real app on the existing guarded, disposable synthetic report fixture. */
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const { seed, login } = require('./report-owner-simplification-evidence.cjs');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const base = 'http://127.0.0.1:6200';
const folder = 'tmp/expense-income-owner-mobile';
const from = '2026-11-01', to = '2026-11-26';

async function addStockEvidence(fixture) {
  const { prisma } = await openGuardedPrismaClient();
  try {
    const businessId = fixture.businessId;
    const product = await prisma.product.findFirstOrThrow({ where: { businessId, name: 'Evidence rice' }, include: { productUnits: true } });
    const owner = await prisma.user.findFirstOrThrow({ where: { businessId, role: 'OWNER' } });
    const inventory = await prisma.account.findFirstOrThrow({ where: { businessId, code: '1200' } });
    const gain = await prisma.account.create({ data: { businessId, code: '4100', name: 'Inventory Gain & Surplus', type: 'INCOME' } });
    const date = new Date('2026-11-14T12:00:00Z');
    const adjustment = await prisma.stockAdjustment.create({ data: { storeId: fixture.storeId, productId: product.id, unitId: product.productUnits[0].unitId, userId: owner.id, direction: 'INCREASE', qtyInUnit: 1, qtyBase: 1, reasonCode: 'STOCK_FOUND', reason: 'Synthetic stock count', valuePence: 500, transactionNumber: 'ADJ-EVIDENCE-1', createdAt: date } });
    await prisma.journalEntry.create({ data: { businessId, entryDate: date, description: 'Synthetic inventory increase', referenceType: 'STOCK_ADJUSTMENT', referenceId: adjustment.id, lines: { create: [{ accountId: inventory.id, debitPence: 500, creditPence: 0 }, { accountId: gain.id, debitPence: 0, creditPence: 500 }] } } });
    await prisma.account.updateMany({ where: { businessId, code: '6000' }, data: { name: 'Operating Expenses' } });
  } finally { await prisma.$disconnect(); }
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'CI only');
  assert.match(process.env.DATABASE_URL || '', /^file:.*\/ci-report-owner-visual\.db$/);
  mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch();
  const contextFor = async viewport => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await context.route('**/*', route => route.request().url().startsWith(base + '/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    return context;
  };
  const capture = async (page, width, height, step) => {
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflow');
    await page.screenshot({ path: `${folder}/${width}x${height}-${step}.png`, animations: 'disabled' });
  };
  const tap = async locator => {
    const rect = await locator.boundingBox();
    assert.ok(rect && rect.height >= 44 && rect.width >= 44, 'Primary action smaller than 44px');
    await locator.click();
  };
  try {
    const fixtures = await seed(async fixture => {
      const context = await contextFor({ width: 390, height: 844 });
      try { const page = await context.newPage(); await login(page, base, fixture); await page.goto(base + '/home', { waitUntil: 'networkidle' }); }
      finally { await context.close(); }
    });
    const fixture = fixtures.complete;
    await addStockEvidence(fixture);
    for (const [width, height] of [[360, 740], [390, 844]]) {
      const context = await contextFor({ width, height });
      try {
        const page = await context.newPage();
        await login(page, base, fixture);
        await page.goto(`${base}/reports/income-statement?from=${from}&to=${to}`);
        for (const [label, value] of [['Sales','320.00'],['Cost of goods sold','160.00'],['Gross profit','160.00'],['Expenses','50.00'],['Other income','5.00'],['Profit','115.00']]) {
          await page.getByRole('link', { name: `View ${label} supporting records: GH₵${value}` }).waitFor();
        }
        const gain = page.getByRole('link', { name: 'View Inventory Gain & Surplus income records: GH₵5.00' });
        await gain.scrollIntoViewIfNeeded();
        await capture(page, width, height, 'summary');
        await tap(gain);
        await page.getByText('Stock found', { exact: true }).waitFor();
        await page.getByText('Product: Evidence rice', { exact: true }).waitFor();
        await page.getByText('Stock value adjustment — not cash received or paid.', { exact: true }).waitFor();
        await capture(page, width, height, 'income-source');
        await page.getByRole('link', { name: '← Income Statement' }).click();
        const expenses = page.getByRole('link', { name: 'View Operating Expenses expense records: GH₵30.00' });
        await expenses.waitFor();
        await tap(expenses);
        await page.getByText('Synthetic rent', { exact: true }).waitFor();
        await page.getByText('Reduces this category total.', { exact: true }).waitFor();
        await capture(page, width, height, 'expense-source');
      } finally { await context.close(); }
    }
    console.log('PASS: synthetic income and expense source records, exact net totals, both phone sizes.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
