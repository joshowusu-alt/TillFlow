const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const output = 'tmp/receipt-print-visual';
const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';
const sizes = [
  { name: 'phone-390x844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1' },
  { name: 'tablet-768x1024', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1' },
  { name: 'desktop-1366x768', viewport: { width: 1366, height: 768 }, userAgent: desktopUA },
  { name: 'desktop-a4-1366x768', viewport: { width: 1366, height: 768 }, userAgent: desktopUA, template: 'A4' },
];
const path = '/tests/fixtures/receipt-print/index.html';
async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [version, port] of [['before', 4177], ['after', 4178]]) {
      for (const { name, template, ...options } of sizes) {
        const page = await browser.newPage(options);
        await page.route('**/api/telemetry/print', route => route.fulfill({ status: 204 }));
        await page.goto(`http://127.0.0.1:${port}${path}${template ? `?template=${template}` : ''}`);
        await page.getByText('Sale Complete!', { exact: true }).waitFor();
        const retry = page.getByRole('button', { name: 'Retry Direct Print' });
        if (version === 'before' || name.startsWith('desktop')) {
          await retry.waitFor();
          assert.equal(await page.evaluate(() => window.receiptEvidence.connections), 1);
        } else {
          assert.equal(await retry.count(), 0);
          assert.equal(await page.evaluate(() => window.receiptEvidence.connections), 0);
        }
        if (version === 'after') {
          assert.equal(await page.getByText(/QZ Tray is not running|Direct print enabled|Direct print failed/).count(), 0);
          assert.equal(await page.getByText(/Direct print unavailable/).count(), name.startsWith('desktop') ? 1 : 0);
          if (name.startsWith('desktop')) assert.equal(await page.getByRole('link', { name: 'Settings' }).getAttribute('href'), '/settings#printing');
          await page.getByRole('button', { name: 'Print Receipt' }).click();
          assert.equal(await page.evaluate(() => window.receiptEvidence.browserPrints), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.screenshot({ path: `${output}/${version}-${name}.png`, fullPage: true });
        if (name.startsWith('phone') || name.startsWith('desktop')) {
          await page.emulateMedia({ media: 'print' });
          assert.equal(await page.getByRole('button', { name: 'Print Receipt' }).isVisible(), false);
          if (version === 'after') {
            const failures = await page.locator('.receipt-content').evaluate(root => {
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              const failures = [];
              while (walker.nextNode()) {
                const node = walker.currentNode;
                if (!node.textContent.trim() || node.parentElement.closest('.no-print')) continue;
                const style = getComputedStyle(node.parentElement);
                if (style.color !== 'rgb(0, 0, 0)' || Number(style.fontWeight) < 400 || style.webkitTextFillColor !== 'rgb(0, 0, 0)') failures.push(node.textContent.trim());
                for (let element = node.parentElement; element && element !== root.parentElement; element = element.parentElement) {
                  if (getComputedStyle(element).opacity !== '1') failures.push('translucent: ' + node.textContent.trim());
                }
              }
              return failures;
            });
            assert.deepEqual(failures, []);
            for (const label of ['Sales Receipt', 'Receipt Details', 'Cashier', 'Items', 'Totals', 'Payments', 'Net subtotal']) {
              assert.equal(await page.locator('.receipt-content').getByText(label, { exact: true }).first().evaluate(el => getComputedStyle(el).fontWeight), '700');
            }
          }
          await page.screenshot({ path: `${output}/${version}-print-${name}.png`, fullPage: true });
          await page.pdf({ path: `${output}/${version}-receipt-${name}.pdf`, ...(template === 'A4' ? { format: 'A4' } : { width: '80mm', height: '300mm' }), printBackground: true });
        }
        await page.close();
      }
    }
    const page = await browser.newPage({ userAgent: desktopUA });
    await page.route('**/api/telemetry/print', route => route.fulfill({ status: 204 }));
    await page.goto(`http://127.0.0.1:4178${path}?direct=success`);
    await page.waitForFunction(() => window.receiptEvidence.raw.length > 0);
    const raw = Buffer.from(await page.evaluate(() => window.receiptEvidence.raw), 'hex');
    assert.equal(raw.subarray(0, 8).toString('hex'), '1b401b61011b4501');
    assert.equal(raw.indexOf(Buffer.from([0x1b, 0x45, 0])), raw.length - 6);
    assert.match(raw.toString(), /Thank you for shopping with us/);
    assert.equal(await page.getByRole('button', { name: 'Retry Direct Print' }).count(), 0);
    await page.close();
    console.log('Receipt visuals, browser fallback, computed black print text and QZ raw output passed.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
