const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

async function main() {
  const base = 'http://127.0.0.1:6200';
  const path = '/reviews/reports-today-layout';
  await fs.mkdir('tmp/owner-reports-visual', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [width,height] of [[320,640],[360,740],[390,844],[430,932],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]) {
      const page = await browser.newPage({ viewport: { width,height }, isMobile:width < 768, hasTouch:width < 1024 });
      try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const scenario of ['normal','large','empty','failed','mismatch','custom','activity','more']) {
          const directory = scenario === 'activity' || scenario === 'more';
          await page.goto(base+path+(directory ? '?state='+scenario : '?state=owner-money&fixture='+scenario));
          await page.waitForLoadState('networkidle');
          await page.evaluate(async () => { await document.fonts.ready; });
          const root = directory ? page.locator('[data-reports-canvas]') : page.locator('[data-money-received-view]');
          await root.waitFor();
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width+' '+scenario+' page overflows');
          for (const target of await root.locator('a:visible,button:visible,summary:visible').all()) {
            const box = await target.boundingBox();
            assert.ok(box && box.height >= 44, width+' '+scenario+' target too small: '+await target.textContent());
          }
          if (!directory) {
            const headline = root.getByRole('region', { name:'Confirmed payments' });
            const box = await headline.boundingBox();
            assert.ok(box && box.y + box.height <= height - 64, width+' '+scenario+' headline below first screen');
            assert.match(await headline.evaluate(el => getComputedStyle(el).backgroundImage), /linear-gradient/);
            const options = root.locator('#money-options');
            assert.equal(await options.evaluate(el => el.open), scenario === 'custom');
            if (scenario === 'normal') {
              assert.ok(await headline.getByText('GH₵1,539.50').isVisible());
              assert.ok(await root.getByRole('link',{name:/MoMo awaiting confirmation/}).getByText('GH₵248.00').isVisible());
              assert.ok(await root.getByRole('link',{name:/Refunds paid/}).getByText('GH₵20.00').isVisible());
              await root.getByText('More options',{exact:true}).click();
              assert.equal(await options.evaluate(el => el.open), true);
              await root.getByText('More options',{exact:true}).click();
            }
            if (scenario === 'failed') {
              assert.ok(await headline.getByText('Unavailable').isVisible());
              assert.ok(await root.getByRole('button',{name:'Refresh'}).isVisible());
              assert.equal(await root.getByText('GH₵0.00',{exact:true}).count(),0);
            }
            if (scenario === 'large') assert.ok(await headline.locator('p').first().evaluate(el=>el.scrollWidth<=el.clientWidth));
            if (scenario === 'empty') assert.ok(await root.getByText('No transactions for this period and selection.').isVisible());
            if (scenario === 'custom') {
              assert.ok(await root.getByLabel('Branch').isVisible());
              const period = await root.locator('[data-period-label]').textContent();
              assert.equal(period, '27 Nov 2026');
              assert.ok((await options.textContent()).includes(period), 'Options should repeat the friendly header period');
              if (width === 1024) {
                const apply = options.getByRole('button', { name: 'Apply', exact: true });
                const form = options.locator('form');
                const afterClass = await apply.getAttribute('class');
                assert.equal(afterClass, 'btn-secondary w-full min-h-11');
                // The failed revision rendered exactly "btn-secondary w-full".
                // Reconstruct that markup on the same synthetic page/viewport;
                // restore immediately and retain the normal passing matrix.
                let beforeHeight;
                try {
                  await apply.evaluate(el => { el.className = 'btn-secondary w-full'; });
                  beforeHeight = (await apply.boundingBox()).height;
                  assert.ok(beforeHeight < 44, 'Prior tablet button should reproduce the failing height');
                  await form.screenshot({path:'tmp/owner-reports-visual/1024x768-apply-before-reconstructed.png'});
                } finally {
                  await apply.evaluate((el, value) => { el.className = value; }, afterClass);
                }
                const afterHeight = (await apply.boundingBox()).height;
                assert.ok(afterHeight >= 44);
                await form.screenshot({path:'tmp/owner-reports-visual/1024x768-apply-after.png'});
                console.log('Tablet Apply comparison: '+beforeHeight+'px → '+afterHeight+'px');
              }
            }
          } else if (scenario === 'activity') {
            assert.ok(await root.getByRole('heading', { name: 'Find reports', exact: true }).isVisible());
            assert.equal(await root.locator('[data-owner-report-directory] li').count(),7);
            assert.ok(await root.getByText('How much money came in?').isVisible());
            assert.ok(await root.getByText('Income Statement',{exact:true}).isVisible());
            assert.equal(await root.locator('a[href^="/reports/analytics"]').count(),0);
          } else {
            assert.ok(await root.getByText('Sales analytics',{exact:true}).isVisible());
            assert.ok(await root.getByText('MoMo to confirm',{exact:true}).isVisible());
          }
          await page.screenshot({path:'tmp/owner-reports-visual/'+width+'x'+height+'-'+scenario+'.png',fullPage:true});
        }
        assert.deepEqual(errors, []);
        console.log('PASS '+width+'×'+height+' — eight scenarios');
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
