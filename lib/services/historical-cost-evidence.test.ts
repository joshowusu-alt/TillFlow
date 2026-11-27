import { describe, expect, it } from 'vitest';
import { previewHistoricalCost, type HistoricalCostEvidence } from './historical-cost-evidence';
import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';
import { buildHistoricalCostPostingPlan } from './historical-cost-posting-plan';

const date = new Date('2026-11-01');
function evidence(): HistoricalCostEvidence {
  return {
    balance: {qty:3,knownValue:null,unvalued:3},
    purchases:[{id:'purchase',label:'PUR-1',qty:25,value:320000,journalMatches:true}],
    movements:[
      {id:'m1',date,type:'PURCHASE',referenceType:'PURCHASE_INVOICE',referenceId:'purchase',qty:25,value:null,basis:null,before:null,after:null},
      {id:'m2',date,type:'SALE',referenceType:'SALES_INVOICE',referenceId:'old',qty:-10,value:null,basis:null,before:25,after:15},
      {id:'m3',date,type:'PURCHASE_RETURN',referenceType:'PURCHASE_RETURN_CREDIT',referenceId:'credit',qty:-10,value:-128000,basis:INVENTORY_VALUE_V1,before:null,after:null},
      {id:'m4',date,type:'SALE',referenceType:'SALES_INVOICE',referenceId:'sale1',qty:-1,value:null,basis:UNVERIFIED_STOCK_V1,before:5,after:4},
      {id:'m5',date,type:'SALE',referenceType:'SALES_INVOICE',referenceId:'sale2',qty:-1,value:null,basis:UNVERIFIED_STOCK_V1,before:4,after:3},
    ],
    sales:[
      {id:'old',label:'OLD',date,eligible:true,journalMatches:true,lines:[{id:'old-line',qty:10,cost:128000,basis:null}]},
      {id:'sale1',label:'S1',date,eligible:true,journalMatches:true,lines:[{id:'line1',qty:1,cost:0,basis:UNVERIFIED_STOCK_V1}]},
      {id:'sale2',label:'S2',date,eligible:true,journalMatches:true,lines:[{id:'line2',qty:1,cost:0,basis:UNVERIFIED_STOCK_V1}]},
    ],
    credits:[{id:'credit',purchaseId:'purchase',qty:10,value:128000,journalMatches:true}],
  };
}
describe('historical cost evidence preview', () => {
  it('reconstructs stock and only missing sale costs from a purchase and subsequent supplier credit', () => {
    const input=evidence(), before=JSON.stringify(input);
    expect(previewHistoricalCost(input)).toMatchObject({status:'REVIEWABLE',unitCost:12800,stockValue:38400,cogsDelta:25600,corrections:[{lineId:'line1',proposedCost:12800},{lineId:'line2',proposedCost:12800}]});
    expect(JSON.stringify(input)).toBe(before);
  });
  it('rejects mismatched quantity and unsupported movements', () => {
    const input=evidence();input.balance.qty=4;
    expect(previewHistoricalCost(input).status).toBe('BLOCKED');
    const other=evidence();other.movements[2].type='ADJUSTMENT';
    expect(previewHistoricalCost(other).status).toBe('BLOCKED');
  });
  it('rejects missing journal, conflicting cost and wrong source credit', () => {
    const input=evidence();input.sales[1].journalMatches=false;
    expect(previewHistoricalCost(input).status).toBe('BLOCKED');
    const other=evidence();other.sales[1].lines[0].cost=12800;
    expect(previewHistoricalCost(other).status).toBe('BLOCKED');
    const credit=evidence();credit.credits[0].purchaseId='different';
    expect(previewHistoricalCost(credit).status).toBe('BLOCKED');
  });
  it('blocks contradictory movement authority, recorded unit cost and unsupported free-cost reconstruction',()=>{
    const a=evidence();a.movements[1].basis=UNVERIFIED_STOCK_V1;
    expect(previewHistoricalCost(a).status).toBe('BLOCKED');
    const b=evidence();b.movements[3].unitCost=12900;
    expect(previewHistoricalCost(b).status).toBe('BLOCKED');
    const c=evidence();c.purchases[0].value=0;
    expect(previewHistoricalCost(c).status).toBe('BLOCKED');
    const d=evidence();d.movements[2].basis=null;
    expect(previewHistoricalCost(d).status).toBe('BLOCKED');
  });
  it('rejects mixed sources, incomplete movement history and partially valued balances', () => {
    const input=evidence();input.purchases.push({...input.purchases[0],id:'second'});
    expect(previewHistoricalCost(input).status).toBe('BLOCKED');
    const missing=evidence();missing.movements.pop();missing.balance.qty=4;missing.balance.unvalued=4;
    expect(previewHistoricalCost(missing).status).toBe('BLOCKED');
    const partial=evidence();partial.balance.knownValue=12800;
    expect(previewHistoricalCost(partial).status).toBe('BLOCKED');
  });
  it('proves five unvalued opening units, two sold and three remaining using the owner cost only',()=>{
    const input=evidence();
    input.purchases=[];input.credits=[];input.balance={qty:3,knownValue:0,unvalued:3};
    input.opening={id:'opening',label:'Opening stock',qty:5,value:64000,journalMatches:true,opening:{movementId:'opening-movement',date,needsValue:true,before:{valuePence:null,unitCostBasePence:null,costBasis:null}}};
    input.movements=[{id:'opening-movement',date,type:'OPENING',referenceType:'OPENING_BALANCE_INVENTORY',referenceId:'opening',qty:5,value:null,basis:null,before:null,after:null},...input.movements.slice(-2).map(m=>({...m,unitCost:99999}))];
    input.sales=input.sales.slice(-2);
    expect(previewHistoricalCost(input)).toMatchObject({status:'REVIEWABLE',unitCost:12800,stockValue:38400,cogsDelta:25600});
    input.opening.journalMatches=false;
    expect(previewHistoricalCost(input).status).toBe('BLOCKED');
  });
  it('uses the recorded opening value and plans only the missing sales cost, never another opening posting',()=>{
    const input=evidence();
    input.purchases=[];input.credits=[];
    input.opening={id:'opening',label:'Opening stock',qty:5,value:64000,journalMatches:true,opening:{movementId:'opening-movement',date,needsValue:false,before:{valuePence:64000,unitCostBasePence:12800,costBasis:INVENTORY_VALUE_V1}}};
    input.movements=[{id:'opening-movement',date,type:'OPENING',referenceType:'OPENING_BALANCE_INVENTORY',referenceId:'opening',qty:5,value:64000,unitCost:12800,basis:INVENTORY_VALUE_V1,before:null,after:null},...input.movements.slice(-2)];
    input.sales=input.sales.slice(-2);
    const proof=previewHistoricalCost(input);
    expect(proof).toMatchObject({status:'REVIEWABLE',unitCost:12800,stockValue:38400,cogsDelta:25600});
    if(proof.status!=='REVIEWABLE')throw new Error('Recorded opening evidence was not reviewable');
    const plan=buildHistoricalCostPostingPlan({businessId:'b',productId:'p',storeId:'s'},proof);
    expect(plan).not.toHaveProperty('opening');
    expect(plan.rows.flatMap(row=>row.journal)).toEqual([
      {accountCode:'5000',debitPence:12800,creditPence:0},{accountCode:'1200',debitPence:0,creditPence:12800},
      {accountCode:'5000',debitPence:12800,creditPence:0},{accountCode:'1200',debitPence:0,creditPence:12800},
    ]);
  });
});
