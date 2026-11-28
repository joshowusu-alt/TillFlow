const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const { seed, login, movementValues } = require('./report-owner-simplification-evidence.cjs');

const folder = 'tmp/report-owner-simplification';
const widths = [[320,640],[390,844],[768,1024],[1024,768],[1366,900]];
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.match(process.env.DATABASE_URL ?? '', /^file:.*\/ci-report-owner-visual\.db$/);
  mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch();
  async function session(port, fixture, viewport, run) {
    const base=`http://127.0.0.1:${port}`;
    const context=await browser.newContext({viewport,serviceWorkers:'block'});
    try {
      await context.route('**/*',route=>route.request().url().startsWith(base+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
      const page=await context.newPage(); page.setDefaultTimeout(120000);
      await login(page,base,fixture); await run(page,base);
    } finally { await context.close(); }
  }
  try {
    const fixtures=await seed(async fixture=>{
      for(const port of [6201,6200]) await session(port,fixture,{width:1024,height:768},async(page,base)=>{await page.goto(base+'/home',{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/home');});
    });
    const results={};
    for(const [width,height] of widths) {
      const pair={};
      for(const [side,port] of [['before',6201],['after',6200]]) await session(port,fixtures.complete,{width,height},async(page,base)=>{
        await page.goto(`${base}/reports/business-movement?preset=equal_length_custom&currentFrom=2026-11-01&currentTo=2026-11-26&storeId=${fixtures.complete.storeId}`);
        await page.getByRole('heading',{name:'Business movement',exact:true}).waitFor();
        pair[side]=await movementValues(page);
        assert.equal(pair[side].sales,'GH₵320.00');
        if(side==='after') {
          assert.equal(await page.locator('[data-movement-sales]').count(),1);
          assert.equal(await page.locator('[data-testid=owner-summary-strip] [data-stage3b-metric]').count(),3);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
          const targets=await page.locator('[data-testid=owner-summary-strip] a, [data-movement-insight] summary').evaluateAll(nodes=>nodes.filter(x=>x.getBoundingClientRect().height>0).map(x=>x.getBoundingClientRect().height));
          assert.ok(targets.every(x=>x>=44),JSON.stringify(targets));
          const products = page.locator('details > summary').filter({hasText:'All product figures'});
          assert.equal(await products.count(),1);
          await products.click();
          assert.equal(await products.locator('..').getAttribute('open'),'');
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
          const amounts = await page.locator('[data-financial-amount]:visible').evaluateAll(nodes=>nodes.map(node=>({
            text:node.textContent,font:parseFloat(getComputedStyle(node).fontSize),whiteSpace:getComputedStyle(node).whiteSpace,
            fits:node.scrollWidth<=node.clientWidth+1
          })));
          assert.ok(amounts.every(amount=>amount.font>=16&&amount.whiteSpace==='nowrap'&&amount.fits),JSON.stringify(amounts));
        }
        await page.screenshot({path:`${folder}/${side}-${width}-movement.png`,fullPage:true,animations:'disabled'});
      });
      assert.deepEqual(pair.after,pair.before,`Changed figures at ${width}`);
      results[width]=pair.after;
      console.log(`PASS ${width}x${height}: unchanged sales, payments, product movements and no candidate overflow`);
    }
    writeFileSync(`${folder}/movement-comparison.json`,JSON.stringify(results,null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
