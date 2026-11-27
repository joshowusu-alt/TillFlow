// Actual POS shell and components, synthetic fixtures, no database or server actions.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

async function main() {
  const base = 'http://127.0.0.1:4177';
  await fs.mkdir('tmp/pos-shift-banner-mobile', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [width,height] of [[360,740],[390,844]]) {
      const context = await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
        await page.goto(base + '/tests/fixtures/offline-mobile/index.html?journey=shift-banner');
        const shelf = page.locator('[data-pos-welcome-shelf="true"]');
        const select = page.locator('#pos-till-select');
        const check = async (value, message, state, shot) => {
          if (value !== null) await select.selectOption(value);
          await shelf.getByText(message, {exact: true}).waitFor();
          assert.equal(await select.getAttribute('data-checkout-till-state'),state);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Horizontal overflow');
          await page.screenshot({path:`tmp/pos-shift-banner-mobile/${width}x${height}-${shot}.png`});
        };
        await check(null,"Till 1 is open · Kingsley's shift",'ready','other-shift');
        await check('t4','Second counter is open · your shift','ready','own-second');
        await check('t3','Seasonal counter is open · your shift','ready','own-seasonal');
        await select.selectOption('t2');
        await shelf.getByText(/Till 2 is closed — open it to start selling/).waitFor();
        const open = shelf.getByRole('link',{name:'Open till →'});
        assert.equal(await open.getAttribute('href'),'/shifts');
        assert.ok((await open.boundingBox()).height >= 44);
        assert.equal(await select.getAttribute('data-checkout-till-state'),'closed');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Horizontal overflow');
        await page.screenshot({path:`tmp/pos-shift-banner-mobile/${width}x${height}-closed.png`});
        await check('','Choose an open till to start selling.','closed','no-selection');
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width}×${height}: selected till updates the welcome and checkout state`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
