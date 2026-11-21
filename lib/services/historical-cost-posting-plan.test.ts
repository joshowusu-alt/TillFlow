import {describe,expect,it} from 'vitest';
import {buildHistoricalCostPostingPlan} from './historical-cost-posting-plan';
const scope={businessId:'business',productId:'rice',storeId:'main'};
const proof={status:'REVIEWABLE' as const,source:{id:'purchase',label:'PUR-1',qty:25,value:320000,journalMatches:true},unitCost:12800,stockValue:38400,cogsDelta:25600,
  corrections:[{invoiceId:'sale1',movementId:'move1',lineId:'line1',receipt:'INV-1',date:new Date('2026-11-16T10:00:00Z'),qty:1,recordedCost:0,proposedCost:12800},
  {invoiceId:'sale2',movementId:'move2',lineId:'line2',receipt:'INV-2',date:new Date('2026-11-19T10:00:00Z'),qty:1,recordedCost:0,proposedCost:12800}]};
describe('immutable historical correction contract',()=>{
  it('builds balanced per-receipt historic-date entries and exact inverse journals without manufacturing stock income',()=>{
    const plan=buildHistoricalCostPostingPlan(scope,proof);
    expect(plan.rows[0]).toMatchObject({invoiceId:'sale1',movementId:'move1',entryDate:'2026-11-16T10:00:00.000Z',after:{costBasis:'INVENTORY_VALUE_V1',lineCostPence:12800,movementValuePence:-12800}});
    for(const row of plan.rows){
      expect(row.journal.reduce((n,l)=>n+l.debitPence-l.creditPence,0)).toBe(0);
      expect(row.reversalJournal).toEqual(row.journal.map(l=>({...l,debitPence:l.creditPence,creditPence:l.debitPence})));
      expect(row.journal.map(l=>l.accountCode)).toEqual(['5000','1200']);
    }
    expect(plan.fingerprint).toBe(buildHistoricalCostPostingPlan(scope,{...proof,corrections:[...proof.corrections].reverse()}).fingerprint);
    expect(plan.fingerprint).not.toBe(buildHistoricalCostPostingPlan({...scope,storeId:'other'},proof).fingerprint);
  });
  it('rejects duplicated movement IDs and inconsistent COGS totals',()=>{
    expect(()=>buildHistoricalCostPostingPlan(scope,{...proof,cogsDelta:1})).toThrow();
    expect(()=>buildHistoricalCostPostingPlan(scope,{...proof,corrections:[proof.corrections[0],{...proof.corrections[1],movementId:'move1'}]})).toThrow();
  });
});
