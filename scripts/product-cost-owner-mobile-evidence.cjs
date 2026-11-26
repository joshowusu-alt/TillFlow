/* Real app, synthetic records only; seed() independently guards the disposable database. */
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const { seed, login } = require('./report-owner-simplification-evidence.cjs');

const base = 'http://127.0.0.1:6200';
const folder = 'tmp/product-cost-owner-mobile';
const from = '2026-11-01', to = '2026-11-26';

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'CI only');
  mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch();
  const contextFor = async (viewport) => {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await context.route('**/*', route => route.request().url().startsWith(base + '/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
    return context;
  };
  const capture = async (page, width, height, step) => {
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow: ${step} at ${width}px`);
    await page.screenshot({ path: `${folder}/${width}x${height}-${step}.png`, animations: 'disabled' });
  };
  const tap = async locator => {
    const rect = await locator.boundingBox();
    assert.ok(rect && rect.height >= 44 && rect.width >= 44, 'Primary action is smaller than 44px');
    await locator.click();
  };
  try {
    const fixtures = await seed(async fixture => {
      const context = await contextFor({ width: 390, height: 844 });
      try {
        const page = await context.newPage();
        await login(page, base, fixture);
        await page.goto(base + '/home', { waitUntil: 'networkidle' });
        assert.equal(new URL(page.url()).pathname, '/home');
      } finally { await context.close(); }
    });
    for (const [width, height] of [[360, 740], [390, 844]]) {
      const context = await contextFor({ width, height });
      try {
        const page = await context.newPage();
        await login(page, base, fixtures['profit-incomplete']);
        await page.goto(`${base}/reports/income-statement?from=${from}&to=${to}`);
        const review = page.getByRole('link', { name: 'Review affected sales →' });
        await review.waitFor();
        await capture(page, width, height, 'income');
        await tap(review);
        await page.getByRole('heading', { name: 'Sales requiring cost review' }).waitFor();
        await page.getByText('1 product · 1 affected receipt.', { exact: false }).waitFor();
        await capture(page, width, height, 'affected-products');
        await tap(page.getByText('View affected receipts', { exact: true }));
        await page.getByRole('link', { name: 'EVIDENCE-1' }).waitFor();
        await tap(page.getByRole('link', { name: 'Check purchase and sale costs →' }));
        await page.getByRole('heading', { name: 'Check product costs' }).waitFor();
        await page.getByText('No qualifying purchase receipt is recorded.', { exact: false }).waitFor();
        await capture(page, width, height, 'purchase-evidence');
        await tap(page.getByRole('link', { name: 'Review proposed branch correction →' }).first());
        await page.getByRole('heading', { name: 'Review proposed cost correction' }).waitFor();
        await page.getByRole('heading', { name: 'Manual reconciliation required' }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Post confirmed correction' }).count(), 0);
        await capture(page, width, height, 'blocked-preview');
        await tap(page.getByRole('link', { name: '← Back to affected sales' }));
        await page.getByRole('heading', { name: 'Sales requiring cost review' }).waitFor();
        const query = new URL(page.url()).searchParams;
        assert.equal(query.get('from'), from); assert.equal(query.get('to'), to); assert.equal(query.get('issues'), '1');
      } finally { await context.close(); }
    }
    console.log('PASS: actual owner cost-review journey, blocked posting and preserved report dates at both phone sizes.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
