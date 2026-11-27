/* Real app, synthetic records only; seed() independently guards the disposable database. */
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require('playwright');
const { seed, login } = require('./report-owner-simplification-evidence.cjs');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

const base = 'http://127.0.0.1:6200';
const folder = 'tmp/product-cost-owner-mobile';
const from = '2026-11-01', to = '2026-11-26';

async function addFixFixtures(fixture) {
  const { prisma } = await openGuardedPrismaClient();
  try {
    const {businessId,storeId}=fixture;
    const owner=await prisma.user.findFirstOrThrow({where:{businessId,role:'OWNER'}});
    const till=await prisma.till.findFirstOrThrow({where:{storeId}});
    const existing=await prisma.product.findFirstOrThrow({where:{businessId},include:{productUnits:true}});
    const unitId=existing.productUnits[0].unitId;
    const accounts=await prisma.account.findMany({where:{businessId}});
    const byCode=Object.fromEntries(accounts.map(a=>[a.code,a.id]));
    const equity=await prisma.account.create({data:{businessId,code:'3200',name:'Opening Balance Equity',type:'EQUITY'}});
    byCode['3200']=equity.id;
    const journal=async(referenceId,referenceType,date,lines)=>prisma.journalEntry.create({data:{businessId,referenceId,referenceType,description:'Synthetic cost fix fixture',entryDate:date,lines:{create:lines.map(([code,debitPence,creditPence])=>({accountId:byCode[code],debitPence,creditPence}))}}});
    for(const mode of ['purchase','owner']){
      const product=await prisma.product.create({data:{businessId,name:mode==='purchase'?'Purchased rice':'Opening rice',sellingPriceBasePence:15000,defaultCostBasePence:99999,isTaxable:false,productUnits:{create:{unitId,isBaseUnit:true,conversionToBase:1}}}});
      const day=new Date('2026-11-03T12:00:00Z'), sold=new Date('2026-11-16T12:00:00Z');
      let referenceId='opening:'+product.id;
      if(mode==='purchase'){
        const purchase=await prisma.purchaseInvoice.create({data:{businessId,storeId,paymentStatus:'PAID',subtotalPence:64000,vatPence:0,totalPence:64000,transactionNumber:'PUR-000010',createdAt:day,lines:{create:{productId:product.id,unitId,qtyInUnit:5,qtyBase:5,unitCostPence:12800,lineSubtotalPence:64000,lineVatPence:0,lineTotalPence:64000}}}});
        referenceId=purchase.id;
        await journal(referenceId,'PURCHASE_INVOICE',day,[['1200',64000,0],['1000',0,64000]]);
      }
      await prisma.inventoryBalance.create({data:{storeId,productId:product.id,qtyOnHandBase:3,avgCostBasePence:0,knownValuePence:mode==='purchase'?null:0,unvaluedQtyBase:3}});
      await prisma.stockMovement.create({data:{storeId,productId:product.id,userId:owner.id,qtyBase:5,type:mode==='purchase'?'PURCHASE':'OPENING',referenceType:mode==='purchase'?'PURCHASE_INVOICE':'OPENING_BALANCE_INVENTORY',referenceId,createdAt:day,valuePence:mode==='purchase'?64000:null,costBasis:mode==='purchase'?'INVENTORY_VALUE_V1':null,unitCostBasePence:mode==='purchase'?12800:null}});
      const sale=await prisma.salesInvoice.create({data:{businessId,storeId,tillId:till.id,cashierUserId:owner.id,transactionNumber:'FIX-'+mode,paymentStatus:'PAID',subtotalPence:30000,vatPence:0,totalPence:30000,createdAt:sold,lines:{create:{productId:product.id,unitId,qtyInUnit:2,qtyBase:2,unitPricePence:15000,lineSubtotalPence:30000,lineVatPence:0,lineTotalPence:30000,lineCostPence:0,costBasis:'UNVERIFIED_STOCK_V1'}}}});
      await prisma.stockMovement.create({data:{storeId,productId:product.id,userId:owner.id,qtyBase:-2,beforeQtyBase:5,afterQtyBase:3,type:'SALE',referenceType:'SALES_INVOICE',referenceId:sale.id,createdAt:sold,costBasis:'UNVERIFIED_STOCK_V1',unitCostBasePence:mode==='purchase'?12800:99999}});
      await journal(sale.id,'SALES_INVOICE',sold,[['1000',30000,0],['4000',0,30000]]);
    }
  } finally { await prisma.$disconnect(); }
}

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
    for (const [width, height, fixture] of [[360, 740, fixtures.complete], [390, 844, fixtures['stock-only']]]) {
      await addFixFixtures(fixture);
      const context = await contextFor({ width, height });
      try {
        const page = await context.newPage();
        await login(page, base, fixture);
        await page.goto(`${base}/reports/income-statement?from=${from}&to=${to}`);
        const review = page.getByRole('link', { name: 'Fix now →' });
        await review.waitFor();
        await capture(page, width, height, 'income');
        await tap(review);
        await page.getByRole('heading', { name: 'Fix missing costs' }).waitFor();
        const purchase=page.locator('form').filter({has:page.getByRole('button',{name:'Use this cost'})});
        await purchase.getByText(/Use GH₵128.00 per stock unit/).waitFor();
        await purchase.scrollIntoViewIfNeeded();
        await capture(page,width,height,'purchase-path');
        await purchase.getByLabel('Reason').fill('Checked original purchase');
        await purchase.getByRole('checkbox').check();
        await tap(purchase.getByRole('button',{name:'Use this cost'}));
        await page.getByText('Cost saved. More costs still need review.').waitFor();
        await tap(page.getByRole('link',{name:'Fix now →'}));
        await page.getByRole('heading',{name:'Fix missing costs'}).waitFor();
        const typed=page.locator('form').filter({has:page.getByRole('button',{name:'Confirm cost'})});
        await typed.getByText('No purchase record found for this product.').waitFor();
        assert.equal(await typed.locator('input[name=unitCost]').inputValue(),'');
        await typed.scrollIntoViewIfNeeded();
        await capture(page,width,height,'typed-path');
        await typed.locator('input[name=unitCost]').fill('128');
        await typed.getByLabel('Reason').fill('Owner confirmed opening cost');
        await typed.getByRole('checkbox').check();
        await tap(typed.getByRole('button',{name:'Confirm cost'}));
        await page.getByText('Done. Profit updated.').waitFor();
        await capture(page,width,height,'done');
        const query = new URL(page.url()).searchParams;
        assert.equal(query.get('from'), from); assert.equal(query.get('to'), to);
        assert.equal(await page.getByText('Costs incomplete',{exact:true}).count(),0);
      } finally { await context.close(); }
    }
    console.log('PASS: both cost paths and updated profit with preserved report dates at both phone sizes.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
