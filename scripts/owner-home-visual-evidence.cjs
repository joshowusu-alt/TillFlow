const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

async function main() {
  const base = 'http://127.0.0.1:4177';
  await fs.mkdir('tmp/owner-home-visual', { recursive: true });
  const browser = await chromium.launch(process.env.HOME_CHROMIUM_PATH ? { executablePath: process.env.HOME_CHROMIUM_PATH } : {});
  try {
    for (const [width,height] of [[320,640],[360,740],[390,844],[430,932],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]) {
      const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 1024 });
      try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
        for (const scenario of ['healthy','incomplete','cash','empty','multiple','loading','failure','large','starter']) {
          await page.goto(base + '/tests/fixtures/owner-home/index.html?scenario=' + scenario);
          await page.getByRole('heading', { name: 'Synthetic Ghana Business' }).waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width+' '+scenario+': overflow');
          for (const target of await page.locator('a:visible,button:visible,summary:visible').all()) {
            const box = await target.boundingBox();
            assert.ok(box && box.height >= 44, width+' '+scenario+': small target '+await target.textContent());
          }
          if (scenario === 'cash') {
            const panel = page.getByRole('region', { name: 'Needs your attention' });
            assert.equal(await panel.locator('li:visible').count(), 3);
            await panel.getByText('View all', { exact: true }).click();
            assert.equal(await panel.locator('li:visible').count(), 4);
            await panel.getByText('View all', { exact: true }).click();
          }
          if (scenario === 'failure') {
            await page.getByText("Couldn't check right now — Retry").waitFor();
            assert.equal(await page.getByText('Nothing needs attention right now.').count(), 0);
          }
          if (scenario === 'incomplete') await page.getByRole('link', { name: /Profit incomplete — Fix now/ }).waitFor();
          if (scenario === 'starter') await page.getByText('Profit · on Growth').waitFor();
          await page.screenshot({ path: 'tmp/owner-home-visual/'+width+'x'+height+'-'+scenario+'.png', fullPage: true });
        }
        assert.deepEqual(errors, []);
        console.log('PASS '+width+'×'+height+' — nine scenarios');
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
