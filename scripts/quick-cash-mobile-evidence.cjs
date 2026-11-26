// Real checkout components, synthetic offline food business; no server/DB writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function capture(browser, port, before, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const base = `http://127.0.0.1:${port}`;
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error); });
    await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    await page.goto(base + '/tests/fixtures/offline-mobile/index.html');
    await page.getByLabel('Scan barcode or search products').fill('Chek Chek');
    await page.getByRole('button', { name: /^Chek Chek/i }).click();
    const add = page.getByRole('button', { name: 'Add plate' });
    if (await add.isVisible()) await add.click();
    await page.getByRole('button', { name: /View cart/i }).click();
    const dialog = page.getByRole('dialog', { name: /Cart & checkout/i });
    await dialog.getByRole('button', { name: 'Payment', exact: true }).click();
    const group = dialog.locator('[data-pos-cash-denominations]');
    const buttons = group.getByRole('button');
    const amounts = [1, 5, 10, 20, 50, 100, 200];
    const labels = amounts.map(amount => `GH₵${before ? amount.toFixed(2) : amount}`);
    assert.deepEqual(await buttons.allTextContents(), [...labels, 'Exact']);
    const tender = dialog.getByLabel(/Cash tendered/i);
    const footer = dialog.locator('[data-pos-mobile-sheet-footer]');
    for (let i = 0; i < amounts.length; i++) {
      await group.getByRole('button', { name: labels[i], exact: true }).click();
      assert.equal(Number(await tender.inputValue()), amounts[i]);
    }
    await group.getByRole('button', { name: 'Exact', exact: true }).click();
    assert.equal(Number(await tender.inputValue()), 35);
    await group.getByRole('button', { name: labels[5], exact: true }).click();
    assert.equal(Number(await tender.inputValue()), 100);
    assert.match(await footer.locator('[data-pos-change-due]').innerText(), /GH₵65\.00/);
    assert.match(await footer.innerText(), /GH₵35\.00/);
    await group.evaluate(node => node.scrollIntoView({block: 'center'}));
    if (!before) {
      const measurements = await buttons.evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
        return { label: node.textContent, width: box.width, height: box.height, lines: rects.length,
          fits: rects.every(rect => rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5) };
      }));
      for (const button of measurements) {
        assert.ok(button.width >= 44 && button.height >= 44, JSON.stringify(button));
        assert.equal(button.lines, 1, JSON.stringify(button));
        assert.ok(button.fits, JSON.stringify(button));
      }
      console.log(`PASS ${width}×${height}: all 8 labels single-line, 44px+ targets, exact amounts and decimal totals`);
    }
    await page.screenshot({ path: path.join('tmp', 'quick-cash-mobile-evidence', `${before ? 'before' : 'after'}-${width}x${height}-payment.png`) });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

(async () => {
  await fs.mkdir('tmp/quick-cash-mobile-evidence', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[360, 740], [390, 844]]) {
      await capture(browser, 4178, true, width, height);
      await capture(browser, 4177, false, width, height);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
