import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { postJournalEntry } from '@/lib/accounting';
import { UserError } from '@/lib/action-utils';
import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';
import { lockSalesInvoiceForUpdate } from './money-idempotency';
import { lockInventoryValues } from './shared/inventory-utils';
import { readHistoricalCostPreview } from './historical-cost-preview-load';
import { buildHistoricalCostPostingPlan } from './historical-cost-posting-plan';
import { evaluateMarginSet } from '@/lib/reports/margin-line';

type Scope={businessId:string;storeId:string;productId:string};
type Request=Scope & {userId:string;fingerprint:string;reason:string;confirmed:boolean};
type Plan=ReturnType<typeof buildHistoricalCostPostingPlan>;
const APPLY='HISTORICAL_COST_CORRECTION', REVERSE='HISTORICAL_COST_REVERSAL';
const key=(fingerprint:string,reverse=false)=> (reverse?'cost-reverse:':'cost-apply:')+fingerprint;
const digest=(data:unknown)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');

async function owner(tx:Prisma.TransactionClient,input:Request) {
  if (!input.confirmed || !input.reason.trim() || input.reason.length>500 || !/^[a-f0-9]{64}$/.test(input.fingerprint)) throw new UserError('Confirm the exact reviewed correction and record a reason.');
  const user=await tx.user.findFirst({where:{id:input.userId,businessId:input.businessId,role:'OWNER',active:true},select:{id:true,name:true,role:true}});
  const store=await tx.store.findFirst({where:{id:input.storeId,businessId:input.businessId},select:{id:true}});
  const product=await tx.product.findFirst({where:{id:input.productId,businessId:input.businessId},select:{id:true}});
  if(!user||!store||!product) throw new UserError('Owner approval and matching business, branch and product required.');
  return user;
}
async function lockScope(tx:Prisma.TransactionClient,scope:Scope) {
  const invoices=await tx.salesInvoice.findMany({where:{businessId:scope.businessId,storeId:scope.storeId,lines:{some:{productId:scope.productId}}},select:{id:true},orderBy:{id:'asc'},take:501});
  if(invoices.length>500) throw new UserError('Too many receipts for automatic cost correction.');
  for(const invoice of invoices) await lockSalesInvoiceForUpdate(tx as any,scope.businessId,invoice.id);
  await lockInventoryValues(tx,scope.storeId,[scope.productId]);
}
async function snapshot(tx:Prisma.TransactionClient,scope:Scope) {
  const balance=await tx.inventoryBalance.findUniqueOrThrow({where:{storeId_productId:{storeId:scope.storeId,productId:scope.productId}}});
  const movements=await tx.stockMovement.findMany({where:{storeId:scope.storeId,productId:scope.productId},orderBy:{id:'asc'},take:501});
  const invoices=await tx.salesInvoice.findMany({where:{businessId:scope.businessId,storeId:scope.storeId,lines:{some:{productId:scope.productId}}},include:{lines:{orderBy:{id:'asc'}},salesReturn:true,payments:{orderBy:{id:'asc'}}},orderBy:{id:'asc'},take:501});
  const purchases=await tx.purchaseInvoice.findMany({where:{businessId:scope.businessId,storeId:scope.storeId,lines:{some:{productId:scope.productId}}},include:{lines:{orderBy:{id:'asc'}},returnCredits:{orderBy:{id:'asc'}},purchaseReturn:true},orderBy:{id:'asc'},take:501});
  if([movements,invoices,purchases].some(rows=>rows.length>500)) throw new UserError('History exceeds safe correction limit.');
  const refs=[...invoices.map(i=>i.id),...purchases.flatMap(p=>[p.id,...p.returnCredits.map(c=>c.id)]),...movements.flatMap(m=>m.referenceId?[m.referenceId]:[])];
  const journals=await tx.journalEntry.findMany({where:{businessId:scope.businessId,referenceId:{in:refs}},include:{lines:{orderBy:{id:'asc'}}},orderBy:{id:'asc'},take:2001});
  if(journals.length>2000) throw new UserError('Journal history exceeds safe correction limit.');
  return {balance,movements,invoices,purchases,journals};
}
type Snapshot=Awaited<ReturnType<typeof snapshot>>;
type Saved={scope:Scope;plan:Plan;before:{balance:Pick<Snapshot['balance'],'qtyOnHandBase'|'avgCostBasePence'|'knownValuePence'|'unvaluedQtyBase'>;margins:{id:string;grossMarginPence:number|null}[]};postHash:string};
function sameScope(a:Scope,b:Scope){return a.businessId===b.businessId&&a.storeId===b.storeId&&a.productId===b.productId}
const transactionOptions={isolationLevel:'Serializable' as const,maxWait:10000,timeout:30000};

/** Internal owner-only service; no public action until release acceptance. */
export async function applyHistoricalCostCorrection(input:Request) {
  return prisma.$transaction(async tx=>{
    const actor=await owner(tx,input);
    const scope={businessId:input.businessId,storeId:input.storeId,productId:input.productId};
    await lockScope(tx,scope);
    const where={businessId_key:{businessId:scope.businessId,key:key(input.fingerprint)}};
    const existing=await tx.moneyIdempotency.findUnique({where});
    if(existing){
      const saved=JSON.parse(existing.resultJson) as Saved;
      if(existing.commandKind!==APPLY||!sameScope(saved.scope,scope)) throw new UserError('Correction reference conflicts with this scope.');
      if(await tx.moneyIdempotency.findUnique({where:{businessId_key:{businessId:scope.businessId,key:key(input.fingerprint,true)}}})) throw new UserError('This correction was reversed. Review manually.');
      return {fingerprint:input.fingerprint,replayed:true};
    }
    const evidence=await readHistoricalCostPreview(tx,scope.businessId,scope.productId,scope.storeId);
    if(!evidence||evidence.result.status!=='REVIEWABLE') throw new UserError('Current evidence no longer supports this correction.');
    const plan=buildHistoricalCostPostingPlan(scope,evidence.result);
    if(plan.fingerprint!==input.fingerprint) throw new UserError('Correction preview changed. Review the new evidence.');
    const before=await snapshot(tx,scope);
    const balance=before.balance;
    if(balance.knownValuePence!==null) throw new UserError('Stock value already confirmed.');
    const affected=[...new Set(plan.rows.map(r=>r.invoiceId))];
    for(const row of plan.rows){
      const line=await tx.salesInvoiceLine.updateMany({where:{id:row.lineId,productId:scope.productId,salesInvoiceId:row.invoiceId,costBasis:UNVERIFIED_STOCK_V1,lineCostPence:0,salesInvoice:{businessId:scope.businessId,storeId:scope.storeId}},data:{lineCostPence:row.after.lineCostPence,costBasis:INVENTORY_VALUE_V1}});
      const movement=await tx.stockMovement.updateMany({where:{id:row.movementId,storeId:scope.storeId,productId:scope.productId,referenceId:row.invoiceId,referenceType:'SALES_INVOICE',type:'SALE',costBasis:UNVERIFIED_STOCK_V1,valuePence:null},data:{valuePence:row.after.movementValuePence,costBasis:INVENTORY_VALUE_V1}});
      if(line.count!==1||movement.count!==1) throw new UserError('Historical line or movement changed.');
      await postJournalEntry({businessId:scope.businessId,description:APPLY+' '+input.fingerprint+' '+row.lineId,referenceType:APPLY,referenceId:row.invoiceId,entryDate:new Date(row.entryDate),lines:row.journal,prismaClient:tx as unknown as PrismaClient});
    }
    for(const id of affected){
      const invoice=await tx.salesInvoice.findFirstOrThrow({where:{id,businessId:scope.businessId,storeId:scope.storeId},include:{lines:true}});
      const margin=evaluateMarginSet([invoice]);
      await tx.salesInvoice.update({where:{id},data:{grossMarginPence:margin.grossProfitPence}});
    }
    const changed=await tx.inventoryBalance.updateMany({where:{id:balance.id,qtyOnHandBase:balance.qtyOnHandBase,knownValuePence:null,unvaluedQtyBase:balance.unvaluedQtyBase},data:{knownValuePence:plan.remainingStockValue,unvaluedQtyBase:0,avgCostBasePence:balance.qtyOnHandBase?plan.unitCost:0}});
    if(changed.count!==1) throw new UserError('Current stock changed.');
    const saved:Saved={scope,plan,before:{balance:{qtyOnHandBase:balance.qtyOnHandBase,avgCostBasePence:balance.avgCostBasePence,knownValuePence:balance.knownValuePence,unvaluedQtyBase:balance.unvaluedQtyBase},margins:before.invoices.filter(i=>affected.includes(i.id)).map(i=>({id:i.id,grossMarginPence:i.grossMarginPence}))},postHash:digest(await snapshot(tx,scope))};
    await tx.moneyIdempotency.create({data:{businessId:scope.businessId,key:key(input.fingerprint),payloadHash:input.fingerprint,commandKind:APPLY,resultJson:JSON.stringify(saved)}});
    await tx.auditLog.create({data:{businessId:scope.businessId,userId:actor.id,userName:actor.name,userRole:actor.role,action:APPLY,entity:'Product',entityId:scope.productId,branchId:scope.storeId,reason:input.reason.trim(),details:JSON.stringify(saved)}});
    return {fingerprint:input.fingerprint,replayed:false};
  },transactionOptions);
}

/** Reversal is conservative: any subsequent movement, receipt edit/return or journal change blocks it. */
export async function reverseHistoricalCostCorrection(input:Request) {
  return prisma.$transaction(async tx=>{
    const actor=await owner(tx,input);
    const scope={businessId:input.businessId,storeId:input.storeId,productId:input.productId};
    await lockScope(tx,scope);
    const original=await tx.moneyIdempotency.findUnique({where:{businessId_key:{businessId:scope.businessId,key:key(input.fingerprint)}}});
    if(!original||original.commandKind!==APPLY||original.payloadHash!==input.fingerprint) throw new UserError('Original correction not found.');
    const saved=JSON.parse(original.resultJson) as Saved;
    if(!sameScope(saved.scope,scope)||saved.plan.fingerprint!==input.fingerprint) throw new UserError('Correction belongs to another scope.');
    const reversed=await tx.moneyIdempotency.findUnique({where:{businessId_key:{businessId:scope.businessId,key:key(input.fingerprint,true)}}});
    if(reversed){if(reversed.commandKind!==REVERSE||reversed.payloadHash!==input.fingerprint)throw new UserError('Reversal conflicts with existing request.');return {fingerprint:input.fingerprint,replayed:true};}
    if(digest(await snapshot(tx,scope))!==saved.postHash) throw new UserError('Subsequent stock, sale or journal activity requires manual reconciliation; reversal blocked.');
    for(const row of saved.plan.rows){
      const line=await tx.salesInvoiceLine.updateMany({where:{id:row.lineId,productId:scope.productId,salesInvoiceId:row.invoiceId,costBasis:INVENTORY_VALUE_V1,lineCostPence:row.after.lineCostPence,salesInvoice:{businessId:scope.businessId,storeId:scope.storeId}},data:{lineCostPence:row.before.lineCostPence,costBasis:UNVERIFIED_STOCK_V1}});
      const movement=await tx.stockMovement.updateMany({where:{id:row.movementId,storeId:scope.storeId,productId:scope.productId,costBasis:INVENTORY_VALUE_V1,valuePence:row.after.movementValuePence},data:{valuePence:null,costBasis:UNVERIFIED_STOCK_V1}});
      if(line.count!==1||movement.count!==1) throw new UserError('Correction state changed.');
      await postJournalEntry({businessId:scope.businessId,description:REVERSE+' '+input.fingerprint+' '+row.lineId,referenceType:REVERSE,referenceId:row.invoiceId,entryDate:new Date(row.entryDate),lines:row.reversalJournal,prismaClient:tx as unknown as PrismaClient});
    }
    for(const margin of saved.before.margins) await tx.salesInvoice.update({where:{id:margin.id,businessId:scope.businessId},data:{grossMarginPence:margin.grossMarginPence}});
    await tx.inventoryBalance.update({where:{storeId_productId:{storeId:scope.storeId,productId:scope.productId}},data:saved.before.balance});
    await tx.moneyIdempotency.create({data:{businessId:scope.businessId,key:key(input.fingerprint,true),payloadHash:input.fingerprint,commandKind:REVERSE,resultJson:JSON.stringify({scope})}});
    await tx.auditLog.create({data:{businessId:scope.businessId,userId:actor.id,userName:actor.name,userRole:actor.role,action:REVERSE,entity:'Product',entityId:scope.productId,branchId:scope.storeId,reason:input.reason.trim(),details:JSON.stringify({fingerprint:input.fingerprint})}});
    return {fingerprint:input.fingerprint,replayed:false};
  },transactionOptions);
}

/** Read-only scoped correction history; never trusts a client-supplied scope or amount. */
export async function listHistoricalCostCorrections(scope:Scope) {
  const entries=await prisma.auditLog.findMany({where:{businessId:scope.businessId,entity:'Product',entityId:scope.productId,branchId:scope.storeId,action:APPLY},orderBy:{createdAt:'desc'},take:20,select:{details:true,createdAt:true,reason:true,userName:true}});
  const result=[];
  for(const entry of entries){
    if(!entry.details)continue;
    const saved=JSON.parse(entry.details) as Saved;
    if(!sameScope(saved.scope,scope)||!saved.plan?.fingerprint) continue;
    const original=await prisma.moneyIdempotency.findUnique({where:{businessId_key:{businessId:scope.businessId,key:key(saved.plan.fingerprint)}}});
    if(!original||original.commandKind!==APPLY||original.payloadHash!==saved.plan.fingerprint)continue;
    const reversed=await prisma.moneyIdempotency.findUnique({where:{businessId_key:{businessId:scope.businessId,key:key(saved.plan.fingerprint,true)}}});
    result.push({fingerprint:saved.plan.fingerprint,cogsDelta:saved.plan.cogsDelta,remainingStockValue:saved.plan.remainingStockValue,createdAt:entry.createdAt,reason:entry.reason,userName:entry.userName,reversed:!!reversed});
  }
  return result;
}
