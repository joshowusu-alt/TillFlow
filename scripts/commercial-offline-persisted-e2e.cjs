/** Native browser queue -> real isolated API -> persisted invoice, with lost acknowledgement. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {build} = require('esbuild');
const {chromium} = require('playwright');
const {PrismaClient} = require('@prisma/client');
const base = process.env.BASE_URL || 'http://127.0.0.1:6200';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.match(process.env.DATABASE_URL || '', /^file:\.\/(ci-pos-safety|release-176-isolated)\.db$/, 'Disposable SQLite only');
const prisma = new PrismaClient();
async function main(){
 const bundle = await build({stdin:{contents:"import * as storage from './lib/offline/storage'; import * as sync from './lib/offline/sync'; window.releaseOffline = {storage,sync};",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'browser',format:'iife',alias:{'@':process.cwd()},external:['crypto']});
 const browser = await chromium.launch({headless:true});
 try {
  const context=await browser.newContext();const p=await context.newPage();
  await p.goto(base+'/login');await p.locator('[name=email]').fill(process.env.E2E_CASHIER_EMAIL || 'cashier@store.com');await p.locator('[name=password]').fill(process.env.E2E_CASHIER_PASSWORD || 'Pass1234!');await p.getByRole('button',{name:/sign in/i}).click();await p.waitForURL(/\/pos|\/onboarding/);
  const data=await (await p.request.get(base+'/api/offline/cache-data')).json();
  const cashier=await prisma.user.findUniqueOrThrow({where:{email:process.env.E2E_CASHIER_EMAIL || 'cashier@store.com'}});
  const store=await prisma.store.findFirstOrThrow({where:{businessId:cashier.businessId}});
  const till=await prisma.till.findFirstOrThrow({where:{storeId:store.id,active:true},orderBy:{name:'asc'}});
  const shift=await prisma.shift.findFirstOrThrow({where:{status:'OPEN',tillId:till.id}});
  const product=data.products.find(x=>x.onHandBase>3 && x.units?.length);
  assert.ok(product,'No stocked fictional product');const unit=product.units.find(x=>x.isBaseUnit)||product.units[0];
  const before=await prisma.inventoryBalance.findUniqueOrThrow({where:{storeId_productId:{storeId:till.storeId,productId:product.id}}});
  await p.close();
  const q=await context.newPage();await q.route('**/__commercial_offline_fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated offline integration</title>'}));await q.goto(base+'/__commercial_offline_fixture');await q.addScriptTag({content:bundle.outputFiles[0].text});
  const input={businessId:cashier.businessId,storeId:till.storeId,tillId:till.id,shiftId:shift.id,cashierUserId:cashier.id,customerId:null,paymentStatus:'PAID',lines:[{productId:product.id,unitId:unit.id,qtyInUnit:1,discountType:'NONE',discountValue:''}],payments:[{method:'CASH',amountPence:product.sellingPriceBasePence}],orderDiscountType:'NONE',orderDiscountValue:'',createdAt:new Date().toISOString()};
  await context.setOffline(true);
  const id=await q.evaluate(async input=>{await window.releaseOffline.storage.setActiveOfflineScope({businessId:input.businessId,storeId:input.storeId});return window.releaseOffline.storage.queueOfflineSale(input)},input);
  await q.evaluate(biz=>window.releaseOffline.sync.syncOfflineSales(biz),cashier.businessId);
  assert.equal(await q.evaluate(async biz=>(await window.releaseOffline.storage.getPendingSales(biz)).length,cashier.businessId),1);
  await context.setOffline(false);await q.reload();await q.addScriptTag({content:bundle.outputFiles[0].text});
  assert.equal(await q.evaluate(async biz=>(await window.releaseOffline.storage.getPendingSales(biz))[0]?.id,cashier.businessId),id);
  let lost=false;
  await q.route('**/api/offline/batch-sync',async route=>{if(!lost){const response=await route.fetch();assert.equal(response.status(),200);lost=true;await route.abort('failed');}else await route.continue()});
  await q.evaluate(biz=>window.releaseOffline.sync.syncOfflineSales(biz),cashier.businessId);
  assert.equal(lost,true);
  assert.equal(await q.evaluate(async biz=>(await window.releaseOffline.storage.getPendingSales(biz)).length,cashier.businessId),0);
  const invoices=await prisma.salesInvoice.findMany({where:{businessId:cashier.businessId,externalRef:`OFFLINE_SYNC:${id}`},include:{payments:true}});
  assert.equal(invoices.length,1);assert.equal(invoices[0].payments.length,1);
  const after=await prisma.inventoryBalance.findUniqueOrThrow({where:{storeId_productId:{storeId:till.storeId,productId:product.id}}});
  assert.equal(after.qtyOnHandBase,before.qtyOnHandBase-1);
  await q.reload();await q.addScriptTag({content:bundle.outputFiles[0].text});const replay=await q.evaluate(biz=>window.releaseOffline.sync.syncOfflineSales(biz),cashier.businessId);assert.equal(replay.synced,0);
  assert.equal(await prisma.salesInvoice.count({where:{businessId:cashier.businessId,externalRef:`OFFLINE_SYNC:${id}`}}),1);
  const receipt=await q.request.get(base+'/receipts/'+invoices[0].id);assert.equal(receipt.status(),200);
  const result={nativeIndexedDB:true,offlineRetention:true,reloadPersistence:true,reconnection:true,lostAcknowledgement:true,persistedInvoices:1,payments:1,stockDecrements:1,receiptStatus:receipt.status(),duplicateAfterReload:false,database:'disposable SQLite'};
  fs.mkdirSync('tmp/commercial-release',{recursive:true});fs.writeFileSync('tmp/commercial-release/offline.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await context.close();
 }finally{await browser.close();await prisma.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
