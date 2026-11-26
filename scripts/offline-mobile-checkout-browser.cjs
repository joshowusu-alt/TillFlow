// Synthetic owner/food fixture. No network-backed application or DB is involved.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function verify(browser, port, before, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const base = `http://127.0.0.1:${port}`;
    const errors = [];
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error('Fixture page error:', error.stack || error.message);
    });
    page.on('console', message => {
      if (message.type() === 'error') console.error('Fixture console:', message.text());
    });
    page.on('requestfailed', request => console.error('Fixture request failed:', request.url(), request.failure()));
    await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    await page.goto(base + '/tests/fixtures/offline-mobile/index.html');
    console.log('Loaded fixture', base, before ? 'baseline' : 'candidate');
    const search = page.getByLabel('Scan barcode or search products');
    try {
      await search.fill('Chek Chek', { timeout: 10000 });
    } catch (error) {
      console.error('Fixture body:', await page.locator('body').innerText());
      await page.screenshot({ path: path.join('tmp', 'offline-mobile-evidence', `startup-failure-${before ? 'before' : 'after'}-${width}.png`) });
      throw error;
    }
    await page.getByRole('button', { name: /^Chek Chek/i }).click();
    const add = page.getByRole('button', { name: 'Add plate' });
    if (await add.isVisible()) await add.click();
    await page.getByRole('button', { name: /View cart/i }).click();
    const dialog = page.getByRole('dialog', { name: /Cart & checkout/i });
    await dialog.waitFor();
    const screenshot = step => page.screenshot({ path: path.join('tmp', 'offline-mobile-evidence', `${before ? 'before' : 'after'}-${width}x${height}-${step}.png`) });
    const strip = dialog.locator('[data-pos-offline-strip]');
    const floating = page.getByText('Sales saved locally', { exact: true });
    if (before) {
      await floating.waitFor({ state: 'visible' });
    } else {
      await strip.waitFor({ state: 'visible' });
      assert.equal(await floating.isVisible(), false);
    }
    await screenshot('cart');
    await dialog.getByRole('button', { name: 'Payment', exact: true }).click();
    await dialog.getByLabel(/Cash tendered/i).fill('100');
    await dialog.getByLabel(/Cash tendered/i).evaluate(input => input.blur());
    const complete = dialog.getByTestId('pos-complete-sheet');
    if (before) {
      assert.equal(await complete.isEnabled(), false, 'Baseline unexpectedly enabled');
      await screenshot('payment');
      return;
    }
    await page.waitForFunction(() => !document.querySelector('[data-testid="pos-complete-sheet"]')?.disabled);
    const footer = dialog.locator('[data-pos-mobile-sheet-footer]');
    assert.match(await footer.locator('[data-pos-change-due]').innerText(), /65\.00/);
    const status = dialog.locator('[data-pos-mobile-completion-status]');
    const boxes = await Promise.all([strip, footer, status, complete].map(item => item.boundingBox()));
    for (const box of boxes) {
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, 'Checkout element clipped');
    }
    assert.ok(boxes[0].y + boxes[0].height <= boxes[1].y + 1, 'Offline strip overlaps checkout footer');
    assert.ok(boxes[2].y + boxes[2].height <= boxes[3].y + 1, 'Reason overlaps complete button');
    await screenshot('payment');
    await complete.click();
    await page.getByText(/Saved offline/).waitFor();
    const pending = await page.evaluate(() => window.fixturePending());
    assert.equal(pending.length, 1);
    assert.equal(pending[0].shiftId, 'fixture-shift');
    assert.deepEqual(pending[0].payments, [{ method: 'CASH', amountPence: 3500 }]);
    assert.equal(pending[0].lines[0].productId, 'fixture-rice');
    await screenshot('completed');
    await search.fill('Chek Chek');
    await page.getByRole('button', { name: /^Chek Chek/i }).click();
    if (await add.isVisible()) await add.click();
    await page.getByRole('button', { name: /View cart/i }).click();
    await dialog.getByText('1 sale waiting to sync').waitFor();
    await screenshot('waiting-to-sync');
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: offline checkout, no overlap, actual IndexedDB pending sale`);
  } finally {
    await context.close();
  }
}

(async () => {
  await fs.mkdir('tmp/offline-mobile-evidence', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[360, 740], [390, 844]]) {
      await verify(browser, 4178, true, width, height);
      await verify(browser, 4177, false, width, height);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
