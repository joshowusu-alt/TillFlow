import { createHash } from 'node:crypto';
import type { previewHistoricalCost } from './historical-cost-evidence';
import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';

type Proof = Extract<ReturnType<typeof previewHistoricalCost>,{status:'REVIEWABLE'}>;
type JournalLine = {accountCode:'5000'|'1200';debitPence:number;creditPence:number};

/** An immutable, non-posting contract. An apply service must re-prove it inside its transaction. */
export function buildHistoricalCostPostingPlan(scope:{businessId:string;productId:string;storeId:string}, proof:Proof) {
  const rows=proof.corrections.map(row=>{
    const lines:JournalLine[]=[
      {accountCode:'5000',debitPence:row.proposedCost,creditPence:0},
      {accountCode:'1200',debitPence:0,creditPence:row.proposedCost},
    ];
    return {
      invoiceId:row.invoiceId,receipt:row.receipt,lineId:row.lineId,movementId:row.movementId,entryDate:row.date.toISOString(),
      before:{lineCostPence:row.recordedCost,costBasis:UNVERIFIED_STOCK_V1,movementValuePence:null},
      after:{lineCostPence:row.proposedCost,costBasis:INVENTORY_VALUE_V1,movementValuePence:-row.proposedCost},
      journal:lines,
      reversalJournal:lines.map(l=>({...l,debitPence:l.creditPence,creditPence:l.debitPence})),
    };
  }).sort((a,b)=>a.lineId.localeCompare(b.lineId));
  if(new Set(rows.map(r=>r.lineId)).size!==rows.length || new Set(rows.map(r=>r.movementId)).size!==rows.length ||
     rows.some(r=>r.before.lineCostPence!==0 || !Number.isSafeInteger(r.after.lineCostPence) || r.after.lineCostPence<=0) ||
     rows.reduce((sum,r)=>sum+r.after.lineCostPence,0)!==proof.cogsDelta) throw new Error('Historical cost proposal is inconsistent.');
  const payload={version:1,scope:{businessId:scope.businessId,productId:scope.productId,storeId:scope.storeId},sourceId:proof.source.id,unitCost:proof.unitCost,remainingStockValue:proof.stockValue,cogsDelta:proof.cogsDelta,rows};
  return {...payload,fingerprint:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}
