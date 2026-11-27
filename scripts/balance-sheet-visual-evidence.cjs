const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

const base = 'http://127.0.0.1:6208';
const folder = 'tmp/balance-sheet-qa';
async function main() {
  assert.match(process.env.DATABASE_URL, /^file:.*\/ci-balance-sheet-qa\.db$/);
  const { prisma: db } = await openGuardedPrismaClient();
  const suffix = randomUUID();
  const email = `balance-sheet-${suffix}@example.invalid`, password = randomUUID();
  const business = await db.business.create({data:{name:'Synthetic Balance Sheet QA', currency:'GHS',timezone:'Africa/Accra',plan:'PRO',selectedPlan:'PRO',planStatus:'ACTIVE',subscriptionStatus:'PAID_ACTIVE',firstPaymentAt:new Date('2026-01-01'),currentPeriodEndsAt:new Date('2030-01-01'),onboardingCompletedAt:new Date(),guidedSetup:false}});
  const businessId = business.id;
  const store = await db.store.create({data:{businessId,name:'QA Main Branch',isMainStore:true}});
  await db.user.create({data:{businessId,name:'Synthetic Owner',email,passwordHash:await bcrypt.hash(password,10),role:'OWNER'}});
  const organization = await db.organization.create({data:{businessId,name:'Synthetic Balance Sheet QA'}});
  await db.branch.create({data:{businessId,organizationId:organization.id,storeId:store.id,name:store.name,code:'QA'}});
  const unit = await db.unit.create({data:{name:`qa-${suffix}`, pluralName:'QA units'}});
  const product = await db.product.create({data:{businessId,name:'Unknown stock cost',sellingPriceBasePence:2500,defaultCostBasePence:0,productUnits:{create:{unitId:unit.id,isBaseUnit:true,conversionToBase:1}}}});
  await db.inventoryBalance.create({data:{storeId:store.id,productId:product.id,qtyOnHandBase:7,avgCostBasePence:0,knownValuePence:0,unvaluedQtyBase:7}});
  const rows = [['1000','Cash on Hand','ASSET',1234567890],['1010','Bank','ASSET',-500],['1100','Accounts Receivable','ASSET',-700],['1200','Inventory','ASSET',4000000],['2000','Accounts Payable','LIABILITY',1200000],['2100','VAT Payable','LIABILITY',300000],['3200','Opening Balance Equity','EQUITY',1237066690]];
  const lines = [];
  for (const [code,name,type,amount] of rows) {
    const account = await db.account.create({data:{businessId,code,name,type}});
    const debit = type==='ASSET' ? amount : -amount;
    lines.push({accountId:account.id,debitPence:Math.max(0,debit),creditPence:Math.max(0,-debit)});
  }
  assert.equal(lines.reduce((sum,line)=>sum+line.debitPence-line.creditPence,0),0);
  await db.journalEntry.create({data:{businessId,description:'Synthetic opening balances',entryDate:new Date('2026-04-01T12:00:00Z'),lines:{create:lines}}});
  await db.$disconnect();
  mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    for (const [width,height] of [[320,640],[390,844],[768,1024],[1024,768],[1366,900]]) {
      const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
      await context.route('**/*', route => route.request().url().startsWith(base+'/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
      const page=await context.newPage(); page.setDefaultTimeout(120000);
      try {
        await page.goto(base+'/login',{timeout:120000});
        await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);
        await page.getByRole('button',{name:'Sign in',exact:true}).click();
        await page.waitForURL(url=>!url.pathname.startsWith('/login'),{timeout:120000});
        await page.goto(base+'/reports/balance-sheet',{timeout:120000});
        await page.getByRole('heading',{name:'Balance sheet',exact:true}).waitFor();
        await page.getByRole('heading',{name:'Figures may be incomplete',exact:true}).waitFor();
        assert.ok(await page.getByText('Customer balances (net credit)',{exact:false}).isVisible());
        assert.ok(await page.getByText('GH₵12,345,678.90',{exact:true}).isVisible());
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
        assert.equal(await page.locator('[data-balance-sheet-statement]').count(),1);
        assert.equal(await page.locator('input[name=asOf]').count(),0);
        assert.equal(await page.getByRole('heading',{name:'What the business owns',exact:true}).count(),1);
        for (const target of await page.locator('a[href^="/reports/balance-sheet/entries"],nav[aria-label="Statement date"] a').all()) {
          const box=await target.boundingBox();assert.ok(box && box.height>=44 && box.x>=0 && box.x+box.width<=width+1,JSON.stringify(box));
        }
        await page.screenshot({path:`${folder}/${width}-balance-sheet.png`,fullPage:true});
        const cash=page.getByRole('link',{name:/View entries for Cash on hand/});
        const cutoff=new URL(await cash.getAttribute('href'),base).searchParams.get('cutoff');
        await cash.click();
        await page.getByRole('heading',{name:'Supporting entries',exact:true}).waitFor();
        assert.ok(await page.getByText('GH₵12,345,678.90',{exact:true}).first().isVisible());
        await page.getByRole('link',{name:'← Balance sheet',exact:true}).click();
        await page.getByRole('heading',{name:'Balance sheet',exact:true}).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('cutoff'),cutoff);
        await page.getByRole('link',{name:'Custom',exact:true}).click();
        const date=page.locator('input[name=asOf]');await date.waitFor();
        const dateBox=await date.boundingBox();assert.ok(dateBox && dateBox.x>=0 && dateBox.x+dateBox.width<=width+1);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`custom date overflow at ${width}`);
        await page.screenshot({path:`${folder}/${width}-custom-date.png`,fullPage:true});
        await page.getByRole('link',{name:'Last month end',exact:true}).click();
        await page.waitForURL(url=>url.searchParams.get('dateChip')==='last-month-end');
        await date.waitFor({state:'detached'});
        console.log(`PASS ${width}x${height} real app: compact statement, figures, warning, no overflow, date chips, touch targets and drill-down cutoff`);
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
