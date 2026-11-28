/* Real authenticated master/candidate reports; disposable CI SQLite only. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const bcrypt = require('bcryptjs');
const { chromium, webkit } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const { login } = require('./report-owner-simplification-evidence.cjs');

const folder = 'tmp/supplier-owner-simplicity';
const date = '2026-11-15';
const params = 'period=custom&from=2026-11-01&to=2026-11-28';
const widths = [[393,852],[768,1024],[1024,768],[1440,900]];
async function seed() {
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.match(process.env.DATABASE_URL || '', /^file:.*\/ci-supplier-owner-visual\.db$/);
  const {prisma:db} = await openGuardedPrismaClient();
  try {
    const email=`supplier-proof-${randomUUID()}@example.invalid`, password=randomUUID();
    const business=await db.business.create({data:{name:'Synthetic supplier report',currency:'GHS',timezone:'Africa/Accra',
      plan:'PRO',selectedPlan:'PRO',planStatus:'ACTIVE',subscriptionStatus:'PAID_ACTIVE',firstPaymentAt:new Date('2026-01-01'),
      currentPeriodEndsAt:new Date('2030-01-01'),onboardingCompletedAt:new Date(),guidedSetup:false}});
    const businessId=business.id;
    const user=await db.user.create({data:{businessId,name:'Synthetic Owner',email,passwordHash:await bcrypt.hash(password,10),role:'OWNER'}});
    const store=await db.store.create({data:{businessId,name:'Synthetic main branch',isMainStore:true}});
    const org=await db.organization.create({data:{businessId,name:'Synthetic supplier report'}});
    await db.branch.create({data:{businessId,organizationId:org.id,storeId:store.id,name:store.name,code:'QA'}});
    const till=await db.till.create({data:{storeId:store.id,name:'QA till'}});
    const unit=await db.unit.create({data:{name:'Synthetic unit',pluralName:'Synthetic units'}});
    for(let i=0;i<13;i++){
      const supplier=await db.supplier.create({data:{businessId,name:i===0?'Long supplier name and distribution company':`Supplier ${String(i+1).padStart(2,'0')}`}});
      const net=120000-i*1000, vat=i===0?18000:0;
      const product=await db.product.create({data:{businessId,name:`Synthetic product ${i+1}`,preferredSupplierId:supplier.id,sellingPriceBasePence:net,defaultCostBasePence:net/2,productUnits:{create:{unitId:unit.id,isBaseUnit:true,conversionToBase:1}}}});
      if(i===12)continue;
      await db.salesInvoice.create({data:{businessId,storeId:store.id,tillId:till.id,cashierUserId:user.id,transactionNumber:`SUP-QA-${i}`,
        paymentStatus:'PAID',subtotalPence:net,vatPence:vat,totalPence:net+vat,createdAt:new Date(date+'T12:00:00Z'),
        lines:{create:{productId:product.id,unitId:unit.id,qtyBase:1,qtyInUnit:1,unitPricePence:net,lineSubtotalPence:net,lineVatPence:vat,lineTotalPence:net+vat,lineCostPence:net/2,costBasis:'INVENTORY_VALUE_V1'}}}});
    }
    return {email,password,storeId:store.id};
  } finally {await db.$disconnect();}
}
async function summaries(page,labels){
  return Promise.all(labels.map(label=>page.getByText(label,{exact:true}).first().evaluate(el=>el.nextElementSibling.textContent.trim())));
}
async function baselineRows(page){
  return page.locator('tbody tr').evaluateAll(rows=>rows.map(row=>{
    const c=[...row.querySelectorAll('td')].map(x=>(x.textContent||'').replace(/\s+/g,' ').trim());
    return [c[0],c[2],c[6],c[1],c[3],c[4],c[5],c[7],c[8],c[9]];
  }));
}
async function candidateRows(page){
  return page.locator('[data-supplier-sale-row]').evaluateAll(rows=>rows.map(row=>[
    row.querySelector('h3').textContent.trim(), ...[...row.querySelectorAll('dd')].map(x=>(x.textContent||'').replace(/\s+/g,' ').trim())
  ]));
}
async function csvFromDownload(page){
  const [response]=await Promise.all([
    page.waitForResponse(r=>new URL(r.url()).pathname==='/reports/sales-by-supplier/export'),
    page.getByRole('button',{name:'Download CSV',exact:true}).click(),
  ]);
  assert.ok(response.ok(),`export status ${response.status()}`);
  assert.match(response.headers()['content-type']||'',/text\/csv/,'expected an authenticated CSV download');
  assert.match(response.headers()['content-disposition']||'',/attachment/);
  return response.text();
}
async function checkGeometry(page,width){
  const geometry=await page.evaluate(()=>({
    page:document.documentElement.scrollWidth, viewport:innerWidth,
    inputs:[...document.querySelectorAll('input[type=date]')].map(el=>{const r=el.getBoundingClientRect(), parent=el.parentElement.getBoundingClientRect();return {left:r.left,right:r.right,parentRight:parent.right};}),
    rows:[...document.querySelectorAll('[data-supplier-sale-row]')].map(el=>({scroll:el.scrollWidth,client:el.clientWidth,right:el.getBoundingClientRect().right})),
    scrollContainers:[...document.querySelectorAll('main *')].filter(el=>['auto','scroll'].includes(getComputedStyle(el).overflowX)&&el.scrollWidth>el.clientWidth+1).length
  }));
  assert.ok(geometry.page<=geometry.viewport+1,JSON.stringify(geometry));
  assert.equal(geometry.inputs.length,2);
  assert.ok(geometry.inputs.every(x=>x.left>=0&&x.right<=width+1&&x.right<=x.parentRight+1),JSON.stringify(geometry.inputs));
  assert.ok(geometry.rows.every(x=>x.scroll<=x.client+1&&x.right<=width+1),JSON.stringify(geometry.rows));
  assert.equal(geometry.scrollContainers,0);
}
async function main(){
  const fixture=await seed();
  mkdirSync(folder,{recursive:true});
  const browser=await chromium.launch();
  const results=[];
  async function session(browser,port,viewport,fn){
    const base=`http://127.0.0.1:${port}`;
    const context=await browser.newContext({viewport,serviceWorkers:'block'});
    await context.route('**/*',route=>route.request().url().startsWith(base+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
    const page=await context.newPage();page.setDefaultTimeout(120000);
    try{
      await login(page,base,fixture);
      await page.goto(`${base}/reports/sales-by-supplier?${params}&storeId=${fixture.storeId}`);
      await page.getByRole('heading',{name:port===6201?'Sales by Linked Supplier':'Sales by supplier',exact:true}).waitFor();
      await page.waitForLoadState('networkidle');
      await fn(page,base);
    }finally{await context.close();}
  }
  try {
    for(const [width,height] of widths){
      const viewport={width,height};let before;
      await session(browser,6201,viewport,async page=>{
        before=await baselineRows(page);assert.equal(before.length,13);
        before.summaries=await summaries(page,['Supplier-linked sales value','Quantity sold','Suppliers with sales','Top supplier']);
        before.csv=await csvFromDownload(page);
        await page.screenshot({path:`${folder}/before-${width}.png`,fullPage:true,animations:'disabled'});
      });
      await session(browser,6200,viewport,async page=>{
        const after=await candidateRows(page);
        assert.deepEqual(after,[...before],`Supplier figures changed at ${width}`);
        assert.deepEqual(await summaries(page,['Sales of supplier products','Items sold','Suppliers with sales','Top supplier']),before.summaries,'Summary figures changed');
        assert.ok(await csvFromDownload(page)===before.csv,'CSV changed');
        assert.ok(await page.getByText('Top 8 suppliers shown. The rest are grouped as Other.',{exact:true}).isVisible());
        await checkGeometry(page,width);
        const chart=await page.locator('figure svg circle title').allTextContents();
        assert.equal(chart.length,9);
        const pence = money=>money==='—'?0:Math.round(Number(money.replace(/[^0-9.-]/g,''))*100);
        const total=after.reduce((sum,row)=>sum+pence(row[1]),0);
        for(const text of chart.slice(0,8)){
          const row=after.find(row=>text.startsWith(row[0]+':'));
          assert.ok(row&&text.includes(row[1])&&text.includes(`(${(pence(row[1])/total*100).toFixed(1)}%)`),text);
        }
        const other=after.slice(8).reduce((sum,row)=>sum+pence(row[1]),0);
        assert.ok(chart[8].includes(`(${(other/total*100).toFixed(1)}%)`),chart[8]);
        await page.screenshot({path:`${folder}/after-${width}.png`,fullPage:true,animations:'disabled'});
        const first=page.locator('[data-supplier-sale-row]').first();
        await first.locator('summary').click();
        await checkGeometry(page,width);
        await first.getByRole('link',{name:/View products/}).click();
        await page.getByRole('heading',{name:'Linked products sold'}).waitFor();
        await checkGeometry(page,width);
        assert.equal(await page.locator('[data-supplier-sale-row]').count(),1);
        await page.screenshot({path:`${folder}/drilldown-${width}.png`,fullPage:true,animations:'disabled'});
        results.push({width,rows:after.length,figures:'identical',csv:'identical',chartSlices:chart.length});
        console.log(`PASS ${width}: all supplier figures and CSV unchanged, no overflow, product drill-down works`);
      });
    }
    // WebKit catches native date-input sizing differences that Chromium alone misses.
    const safari=await webkit.launch();
    try{await session(safari,6200,{width:393,height:852},async page=>{await checkGeometry(page,393);await page.screenshot({path:`${folder}/after-webkit-393.png`,fullPage:true});});}
    finally{await safari.close();}
    writeFileSync(`${folder}/results.json`,JSON.stringify(results,null,2));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
