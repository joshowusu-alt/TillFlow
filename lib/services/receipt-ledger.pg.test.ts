import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { RECEIPT_LEDGER_V1 } from '@/lib/payments/receipt-ledger';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';

vi.mock('@/lib/action-utils', () => ({ UserError: class UserError extends Error {} }));
vi.mock('@/lib/services/risk-monitor', () => ({ detectVoidFrequencyRisk: vi.fn().mockResolvedValue(undefined), detectExcessiveDiscountRisk: vi.fn().mockResolvedValue(undefined), detectNegativeMarginRisk: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
const describePg=canRunLivePostgresTests()?describe:describe.skip;

describePg('forward receipt ledger on isolated PostgreSQL',()=>{
 let prisma:PrismaClient;let businessId:string;let storeId:string;let userId:string;let tillId:string;
 let shiftId:string;let productId:string;let unitId:string;let customerId:string;
 let confirm:typeof import('./momo-confirmation').confirmMomoPayment;
 let reverse:typeof import('./returns').createSalesReturn;
 let post:typeof import('@/lib/accounting').postJournalEntry;
 const actor=()=>({userId,userName:'Fixture owner',userRole:'OWNER',businessId});
 beforeAll(async()=>{
  ({prisma}=await openTestPrismaClient());
  ({confirmMomoPayment:confirm}=await import('./momo-confirmation'));
  ({createSalesReturn:reverse}=await import('./returns'));
  ({postJournalEntry:post}=await import('@/lib/accounting'));
  businessId=(await prisma.business.create({data:{name:`Receipt ledger ${Date.now()}`,currency:'GHS'}})).id;
  storeId=(await prisma.store.create({data:{businessId,name:'Disposable branch'}})).id;
  userId=(await prisma.user.create({data:{businessId,email:`ledger-${Date.now()}@example.invalid`,name:'Owner',role:'OWNER',passwordHash:'fixture'}})).id;
  tillId=(await prisma.till.create({data:{storeId,name:'Disposable till'}})).id;
  shiftId=(await prisma.shift.create({data:{tillId,userId,status:'OPEN',openKey:tillId}})).id;
  productId=(await prisma.product.create({data:{businessId,name:'Fixture product',sellingPriceBasePence:6000,defaultCostBasePence:2000}})).id;
  unitId=(await prisma.unit.create({data:{name:'Fixture piece',pluralName:'Fixture pieces'}})).id;
  await prisma.productUnit.create({data:{productId,unitId,isBaseUnit:true,conversionToBase:1}});
  await prisma.inventoryBalance.create({data:{productId,storeId,qtyOnHandBase:100,avgCostBasePence:2000}});
  customerId=(await prisma.customer.create({data:{businessId,name:'Fixture customer'}})).id;
  const {ensureChartOfAccounts}=await import('@/lib/accounting');await ensureChartOfAccounts(businessId,prisma);
 },60000);
 afterAll(async()=>{
  if(!prisma||!businessId)return;
  await runTestTeardown(prisma,[
   ()=>prisma.auditLog.deleteMany({where:{businessId}}),
   ()=>prisma.journalEntry.deleteMany({where:{businessId}}),
   ()=>prisma.salesReturn.deleteMany({where:{storeId}}),
   ()=>prisma.mobileMoneyStatusLog.deleteMany({where:{collection:{businessId}}}),
   ()=>prisma.salesPayment.deleteMany({where:{salesInvoice:{businessId}}}),
   ()=>prisma.mobileMoneyCollection.deleteMany({where:{businessId}}),
   ()=>prisma.salesInvoice.deleteMany({where:{businessId}}),
   ()=>prisma.cashDrawerEntry.deleteMany({where:{businessId}}),
   ()=>prisma.moneyIdempotency.deleteMany({where:{businessId}}),
   ()=>prisma.stockMovement.deleteMany({where:{storeId}}),
   ()=>prisma.inventoryBalance.deleteMany({where:{storeId}}),
   ()=>prisma.product.deleteMany({where:{businessId}}),
   ()=>prisma.unit.delete({where:{id:unitId}}),
   ()=>prisma.customer.deleteMany({where:{businessId}}),
   ()=>prisma.businessSequence.deleteMany({where:{businessId}}),
   ()=>prisma.account.deleteMany({where:{businessId}}),
   ()=>prisma.shift.deleteMany({where:{tillId}}),
   ()=>prisma.till.deleteMany({where:{storeId}}),
   ()=>prisma.store.deleteMany({where:{businessId}}),
   ()=>prisma.user.deleteMany({where:{businessId}}),
   ()=>prisma.business.delete({where:{id:businessId}}),
  ]);
 },60000);

 async function fixture(options:{legacy?:boolean;cash?:number;amounts?:number[];stamp?:string}={}){
  const amounts=options.amounts??[6000];const pending=amounts.reduce((a,b)=>a+b,0);const total=pending+(options.cash??0);
  const invoice=await prisma.salesInvoice.create({data:{businessId,storeId,tillId,cashierUserId:userId,
   paymentStatus:options.stamp??'PAID',subtotalPence:total,vatPence:0,totalPence:total,
   payments:{create:[...amounts.map(amountPence=>({method:'MOBILE_MONEY',amountPence,status:'PENDING_MANUAL',receivedAt:new Date('2026-08-01T12:00:00Z'),ledgerTreatment:options.legacy?null:RECEIPT_LEDGER_V1})),
    ...(options.cash?[{method:'CASH',amountPence:options.cash,status:'CONFIRMED',receivedAt:new Date(),ledgerTreatment:RECEIPT_LEDGER_V1}]:[])]},},include:{payments:true}});
  await post({businessId,referenceType:'SALES_INVOICE',referenceId:invoice.id,
   description:'Isolated fixture opening posting',prismaClient:prisma,
   lines:[{accountCode:options.legacy?'1010':'1100',debitPence:pending},
    ...(options.cash?[{accountCode:'1000',debitPence:options.cash}]:[]),{accountCode:'4000',creditPence:total}],});
  return invoice;
 }
 const input=(id:string)=>({paymentId:id,reference:'ISOLATED-STMT',note:'Disposable test evidence',actor:actor(),authorisedStoreIds:[storeId]});
 async function entries(id:string){const returns=await prisma.salesReturn.findMany({where:{salesInvoiceId:id},select:{id:true}});return prisma.journalEntry.findMany({where:{businessId,OR:[{referenceId:id},{referenceId:{in:[...(await prisma.salesPayment.findMany({where:{salesInvoiceId:id},select:{id:true}})).map(p=>p.id),...returns.map(r=>r.id)]}}]},include:{lines:{include:{account:true}}}});}
 async function balance(id:string,code:string){return (await entries(id)).flatMap(e=>e.lines).filter(l=>l.account.code===code).reduce((s,l)=>s+l.debitPence-l.creditPence,0);}
 async function assertBalanced(){for(const entry of await prisma.journalEntry.findMany({where:{businessId},include:{lines:true}}))expect(entry.lines.reduce((s,l)=>s+l.debitPence-l.creditPence,0)).toBe(0);}

 it('real mixed checkout and captured offline replay keep pending MoMo in AR exactly once',async()=>{
  const {createSale}=await import('./sales');
  const value={businessId,storeId,tillId,cashierUserId:userId,capturedShiftId:shiftId,
   paymentStatus:'PAID' as const,externalRef:`OFFLINE_SYNC:ledger-${Date.now()}`,
   lines:[{productId,unitId,qtyInUnit:1}],
   payments:[{method:'CASH' as const,amountPence:2000},{method:'MOBILE_MONEY' as const,amountPence:4000,status:'CONFIRMED'}]};
  const invoice=await createSale(value);const before=await prisma.inventoryBalance.findUniqueOrThrow({where:{storeId_productId:{storeId,productId}}});
  const replay=await createSale(value);expect(replay.id).toBe(invoice.id);
  const final=await prisma.salesInvoice.findUniqueOrThrow({where:{id:invoice.id},include:{payments:true}});
  expect(final.payments.find(p=>p.method==='MOBILE_MONEY')?.status).toBe('PENDING_MANUAL');
  expect(await balance(invoice.id,'1000')).toBe(2000);expect(await balance(invoice.id,'1010')).toBe(0);
  expect(await balance(invoice.id,'1100')).toBe(4000);
  expect((await entries(invoice.id)).length).toBe(1);
  expect((await prisma.inventoryBalance.findUniqueOrThrow({where:{storeId_productId:{storeId,productId}}})).qtyOnHandBase).toBe(before.qtyOnHandBase);
  await assertBalanced();
 },30000);

 it('provider-confirmed MoMo posts Bank at checkout and cannot be manually reposted',async()=>{
  const {createSale}=await import('./sales');
  const collection=await prisma.mobileMoneyCollection.create({data:{businessId,storeId,provider:'fixture',network:'MTN',payerMsisdn:'fixture',amountPence:6000,status:'CONFIRMED',idempotencyKey:`ledger-provider-${Date.now()}`}});
  const invoice=await createSale({businessId,storeId,tillId,cashierUserId:userId,paymentStatus:'PAID',momoCollectionId:collection.id,
   lines:[{productId,unitId,qtyInUnit:1}],payments:[{method:'MOBILE_MONEY',amountPence:6000}]});
  const payment=await prisma.salesPayment.findFirstOrThrow({where:{salesInvoiceId:invoice.id}});
  expect(payment.status).toBe('CONFIRMED');expect(await balance(invoice.id,'1010')).toBe(6000);
  expect((await confirm(input(payment.id))).alreadyConfirmed).toBe(true);expect((await entries(invoice.id)).length).toBe(1);
 },30000);

 it('part-paid and unpaid credit sales reconcile AR through later pending collection and confirmation',async()=>{
  const {createSale}=await import('./sales');const {recordCustomerPayment}=await import('./payments');
  for(const deposit of [0,2000]) {
   const invoice=await createSale({businessId,storeId,tillId,cashierUserId:userId,customerId,paymentStatus:deposit?'PART_PAID':'UNPAID',
    lines:[{productId,unitId,qtyInUnit:1}],payments:deposit?[{method:'CASH',amountPence:deposit}]:[]});
   const expected=6000-deposit;expect(await balance(invoice.id,'1100')).toBe(expected);
   const key=`ledger-later-${invoice.id}`;
   await recordCustomerPayment(businessId,invoice.id,[{method:'MOBILE_MONEY',amountPence:expected}],userId,{idempotencyKey:key});
   await recordCustomerPayment(businessId,invoice.id,[{method:'MOBILE_MONEY',amountPence:expected}],userId,{idempotencyKey:key});
   const payment=await prisma.salesPayment.findFirstOrThrow({where:{salesInvoiceId:invoice.id,method:'MOBILE_MONEY'}});
   expect(await balance(invoice.id,'1100')).toBe(expected);expect(await balance(invoice.id,'1010')).toBe(0);
   await confirm(input(payment.id));expect(await balance(invoice.id,'1100')).toBe(0);expect(await balance(invoice.id,'1010')).toBe(expected);
  }
  await assertBalanced();
 },30000);

 it('amendment refuses pending receipts and posts a new MoMo difference to AR after reconciliation',async()=>{
  const {createSale,amendSale}=await import('./sales');
  const invoice=await createSale({businessId,storeId,tillId,cashierUserId:userId,paymentStatus:'PAID',lines:[{productId,unitId,qtyInUnit:1}],payments:[{method:'MOBILE_MONEY',amountPence:6000}]});
  const value={businessId,salesInvoiceId:invoice.id,userId,reason:'Isolated amendment',keepLineIds:[],newLines:[{productId,unitId,qtyInUnit:1,unitPricePence:8000}],additionalPaymentMethod:'MOBILE_MONEY' as const};
  await expect(amendSale(value)).rejects.toThrow('Reconcile pending MoMo');
  const payment=await prisma.salesPayment.findFirstOrThrow({where:{salesInvoiceId:invoice.id}});await confirm(input(payment.id));
  await amendSale(value);
  expect(await balance(invoice.id,'1010')).toBe(6000);expect(await balance(invoice.id,'1100')).toBe(2000);
  const final=await prisma.salesInvoice.findUniqueOrThrow({where:{id:invoice.id},include:{payments:true}});
  expect(receivableDocumentBalance(final).balancePence).toBe(2000);await assertBalanced();
 },30000);

 it('cash checkout VOID refunds cash and reverses the original COGS posting',async()=>{
  const {createSale}=await import('./sales');
  const invoice=await createSale({businessId,storeId,tillId,cashierUserId:userId,paymentStatus:'PAID',lines:[{productId,unitId,qtyInUnit:1}],payments:[{method:'CASH',amountPence:6000}]});
  await reverse({businessId,salesInvoiceId:invoice.id,userId,managerApprovedByUserId:userId,reasonCode:'WRONG_ITEM',type:'VOID'});
  expect(await balance(invoice.id,'1000')).toBe(0);expect(await balance(invoice.id,'5000')).toBe(0);expect(await balance(invoice.id,'1200')).toBe(0);await assertBalanced();
 },30000);

 it('failed/cancelled provider collections cannot create receipt or ledger effects',async()=>{
  const {createSale}=await import('./sales');const count=await prisma.journalEntry.count({where:{businessId}});
  for(const status of ['FAILED','CANCELLED']) {
   const collection=await prisma.mobileMoneyCollection.create({data:{businessId,storeId,provider:'fixture',network:'MTN',payerMsisdn:'fixture',amountPence:6000,status,idempotencyKey:`ledger-provider-${status}-${Date.now()}`}});
   await expect(createSale({businessId,storeId,tillId,cashierUserId:userId,paymentStatus:'PAID',momoCollectionId:collection.id,lines:[{productId,unitId,qtyInUnit:1}],payments:[{method:'MOBILE_MONEY',amountPence:6000}]})).rejects.toThrow('not confirmed');
  }
  expect(await prisma.journalEntry.count({where:{businessId}})).toBe(count);
 },30000);

 it('concurrent confirmation and void serialize on the invoice and leave zero exposure',async()=>{
  const invoice=await fixture();
  const outcomes=await Promise.allSettled([confirm(input(invoice.payments[0].id)),reverse({businessId,salesInvoiceId:invoice.id,userId,managerApprovedByUserId:userId,reasonCode:'WRONG_ITEM',type:'VOID'})]);
  expect(outcomes[1].status).toBe('fulfilled');
  expect(await balance(invoice.id,'1010')).toBe(0);expect(await balance(invoice.id,'1100')).toBe(0);await assertBalanced();
 },30000);

 it('concurrent confirmation and retry produce one transfer and audit, retaining receipt date',async()=>{
  const invoice=await fixture({cash:4000});const payment=invoice.payments.find(p=>p.method==='MOBILE_MONEY')!;
  expect(await balance(invoice.id,'1010')).toBe(0);expect(await balance(invoice.id,'1100')).toBe(6000);
  const outcomes=await Promise.all([confirm(input(payment.id)),confirm(input(payment.id))]);
  expect(outcomes.filter(r=>!r.alreadyConfirmed)).toHaveLength(1);
  expect((await confirm(input(payment.id))).alreadyConfirmed).toBe(true);
  const final=await prisma.salesInvoice.findUniqueOrThrow({where:{id:invoice.id},include:{payments:true}});
  expect(receivableDocumentBalance(final).balancePence).toBe(await balance(invoice.id,'1100'));
  expect(await balance(invoice.id,'1010')).toBe(6000);
  expect(final.payments.find(p=>p.id===payment.id)?.receivedAt).toEqual(payment.receivedAt);
  expect(final.payments.find(p=>p.id===payment.id)?.confirmedAt).toBeInstanceOf(Date);
  expect(await prisma.journalEntry.count({where:{businessId,referenceType:'MOMO_PAYMENT_CONFIRM',referenceId:payment.id}})).toBe(1);
  expect(await prisma.auditLog.count({where:{businessId,entityId:payment.id,action:'MOMO_PAYMENT_CONFIRM'}})).toBe(1);
  expect(final.payments).toHaveLength(2);await assertBalanced();
 },30000);

 it('partial confirmations transfer only their receipt amount',async()=>{
  const invoice=await fixture({amounts:[2000,4000]});await confirm(input(invoice.payments[0].id));
  expect(await balance(invoice.id,'1010')).toBe(2000);expect(await balance(invoice.id,'1100')).toBe(4000);
  await confirm(input(invoice.payments[1].id));expect(await balance(invoice.id,'1100')).toBe(0);await assertBalanced();
 },30000);

 it('legacy treatment never debits Bank a second time',async()=>{
  const invoice=await fixture({legacy:true});const count=(await entries(invoice.id)).length;
  await confirm(input(invoice.payments[0].id));expect(await balance(invoice.id,'1010')).toBe(6000);
  expect((await entries(invoice.id)).length).toBe(count);
 },30000);

 it('journal failure rolls back payment status, timestamp and audit',async()=>{
  const invoice=await fixture();const payment=invoice.payments[0];
  await prisma.salesPayment.update({where:{id:payment.id},data:{amountPence:0}});
  await expect(confirm(input(payment.id))).rejects.toThrow('Invalid pending receipt amount');
  const final=await prisma.salesPayment.findUniqueOrThrow({where:{id:payment.id}});
  expect(final.status).toBe('PENDING_MANUAL');expect(final.confirmedAt).toBeNull();
  expect(await prisma.auditLog.count({where:{entityId:payment.id}})).toBe(0);
  expect((await entries(invoice.id)).length).toBe(1);
 },30000);

 it('audit failure rolls back a successfully inserted transfer',async()=>{
  const invoice=await fixture();const before=(await entries(invoice.id)).length;
  await expect(confirm({...input(invoice.payments[0].id),actor:{...actor(),userName:null,userId:'missing-fixture-user'}})).rejects.toThrow();
  expect((await prisma.salesPayment.findUniqueOrThrow({where:{id:invoice.payments[0].id}})).status).toBe('PENDING_MANUAL');
  expect((await entries(invoice.id)).length).toBe(before);
 },30000);

 it.each(['RETURN','VOID'] as const)('%s closes pending exposure and reverses AR, never inventing a Bank refund',async type=>{
  const invoice=await fixture();const result=await reverse({businessId,salesInvoiceId:invoice.id,userId,managerApprovedByUserId:userId,reasonCode:'WRONG_ITEM',type});
  expect(result.refundAmountPence).toBe(0);
  const journals=await prisma.journalEntry.findMany({where:{referenceId:result.id},include:{lines:{include:{account:true}}}});
  expect(journals.flatMap(e=>e.lines).find(l=>l.account.code==='1100')?.creditPence).toBe(6000);
  expect(journals.flatMap(e=>e.lines).some(l=>l.account.code==='1010')).toBe(false);
  await expect(confirm(input(invoice.payments[0].id))).rejects.toMatchObject({code:'PARENT_RETURNED_VOID'});
  expect((await prisma.salesPayment.findUniqueOrThrow({where:{id:invoice.payments[0].id}})).status).toBe('PENDING_MANUAL');await assertBalanced();
 },30000);

 it('legacy pending VOID reverses only evidenced Bank exposure without a received-money refund',async()=>{
  const invoice=await fixture({legacy:true});
  const result=await reverse({businessId,salesInvoiceId:invoice.id,userId,managerApprovedByUserId:userId,reasonCode:'WRONG_ITEM',type:'VOID'});
  expect(result.refundAmountPence).toBe(0);expect(await balance(invoice.id,'1010')).toBe(0);await assertBalanced();
 },30000);

 it('missing legacy journal evidence refuses reversal without changing the sale',async()=>{
  const invoice=await fixture({legacy:true});await prisma.journalEntry.deleteMany({where:{businessId,referenceId:invoice.id}});
  await expect(reverse({businessId,salesInvoiceId:invoice.id,userId,managerApprovedByUserId:userId,reasonCode:'WRONG_ITEM',type:'VOID'})).rejects.toThrow('Legacy Bank postings require reconciliation');
  expect((await prisma.salesInvoice.findUniqueOrThrow({where:{id:invoice.id}})).paymentStatus).toBe('PAID');
  expect(await prisma.salesReturn.count({where:{salesInvoiceId:invoice.id}})).toBe(0);
 },30000);

 it('confirmed MoMo VOID reverses Bank with a balanced journal',async()=>{
  const invoice=await fixture();await confirm(input(invoice.payments[0].id));
  const result=await reverse({businessId,salesInvoiceId:invoice.id,userId,managerApprovedByUserId:userId,reasonCode:'WRONG_ITEM',type:'VOID'});
  expect(result.refundAmountPence).toBe(6000);
  const journal=await prisma.journalEntry.findFirstOrThrow({where:{referenceId:result.id},include:{lines:{include:{account:true}}}});
  expect(journal.lines.find(l=>l.account.code==='1010')?.creditPence).toBe(6000);await assertBalanced();
 },30000);

 it('role, tenant, branch and failed/cancelled status reject without ledger mutation',async()=>{
  const invoice=await fixture();const baseline=(await entries(invoice.id)).length;const value=input(invoice.payments[0].id);
  for(const change of [{actor:{...actor(),userRole:'CASHIER'}},{actor:{...actor(),businessId:'foreign'}},{authorisedStoreIds:['foreign']}])await expect(confirm({...value,...change})).rejects.toThrow();
  for(const status of ['FAILED','CANCELLED']){await prisma.salesPayment.update({where:{id:value.paymentId},data:{status}});await expect(confirm(value)).rejects.toMatchObject({code:'STATUS'});}
  expect((await entries(invoice.id)).length).toBe(baseline);
 },30000);
});
