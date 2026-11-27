import { loadHistoricalCostPreview } from '@/lib/services/historical-cost-preview-load';
import { buildHistoricalCostPostingPlan } from '@/lib/services/historical-cost-posting-plan';
import { submitHistoricalCostCorrection } from '@/app/actions/historical-cost-correction';
import { formatMoney } from '@/lib/format';
import type { CostReviewGroup } from '@/lib/reports/cost-review-navigation';

export type OneScreenCostFixContext = {
  businessId: string; stores: { id: string; name: string }[]; currency: string; timezone: string; from:string; to:string; metric:string;
};

export default async function OneScreenCostFix({ group, businessId, stores, currency, timezone, from, to, metric }: OneScreenCostFixContext & { group: CostReviewGroup }) {
  if (!group.productId) return null;
  const productId=group.productId;
  const money=(n:number)=>formatMoney(n,currency);
  const date=(value:Date)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:timezone}).format(value);
  const receiptIds=new Set(group.items.map(item=>item.receipt.id.replace(/^sale:/,'')));
  const candidates=[];
  for(const store of stores) {
    const recorded=await loadHistoricalCostPreview(businessId,productId,store.id);
    const typed=recorded?.result.status==='BLOCKED' ? await loadHistoricalCostPreview(businessId,productId,store.id,1) : null;
    const preview=recorded?.result.status==='REVIEWABLE'?recorded:typed;
    if(!preview||preview.result.status!=='REVIEWABLE'||!preview.result.corrections.some(row=>receiptIds.has(row.invoiceId)))continue;
    const proof=preview.result;
    const plan=buildHistoricalCostPostingPlan({businessId,productId,storeId:store.id},proof);
    const owner=proof.source.opening?.needsValue===true;
    const count=new Set(proof.corrections.map(row=>row.invoiceId)).size;
    candidates.push(<form key={store.id} action={submitHistoricalCostCorrection} className="space-y-3 rounded-xl border border-black/10 p-3">
      {stores.length>1?<p className="font-semibold">{store.name}</p>:null}
      <p className="text-sm">{count} {count===1?'sale':'sales'} missing a cost · {Array.from(new Set(proof.corrections.map(row=>date(row.date)))).join(', ')}</p>
      {proof.corrections.some(row=>!receiptIds.has(row.invoiceId))?<p className="text-sm text-amber-900">This also fixes earlier sales outside the selected dates.</p>:null}
      {owner?<><p>No purchase record found for this product.</p><label className="block text-sm font-semibold">What did you pay per stock unit? ({currency==='GHS'?'GH₵':currency})<input className="input mt-1 min-h-11 w-full" name="unitCost" inputMode="decimal" required placeholder="0.00" /></label><p className="text-sm">This also records the value of your opening stock.</p></>:<p className="text-sm font-semibold">Use {money(proof.unitCost)} per stock unit from {proof.source.label}{proof.source.date?' ('+date(proof.source.date)+')':''}?</p>}
      {Object.entries({productId,storeId:store.id,fingerprint:plan.fingerprint,operation:'apply',oneScreen:'1',source:owner?'owner':'recorded',from,to,metric}).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
      <label className="block text-sm font-semibold">Reason<textarea className="input mt-1 min-h-11 w-full" name="reason" required maxLength={500} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="confirmed" required />Confirm — this updates the cost of {count===1?'this sale':`these ${count} sales`}.</label>
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">See accounting details</summary>
        {owner?<p className="text-sm">Owner entered, no purchase record. Opening stock: {proof.source.qty} stock units × entered cost. Dr 1200 Inventory / Cr 3200 Opening Balance Equity.</p>:null}
        <p className="text-sm">Dr 5000 Cost of earlier sales / Cr 1200 Inventory{owner?' — sold stock units × entered cost':': '+money(proof.cogsDelta)}.</p>
        <p className="text-sm">Remaining stock value: {owner?'remaining stock units × entered cost':money(proof.stockValue)}. Stock quantities do not change.</p>
      </details>
      <button className="btn-primary min-h-11 w-full" type="submit">{owner?'Confirm cost':'Use this cost'}</button>
    </form>);
  }
  return candidates.length ? <div className="space-y-3">{candidates}</div> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The recorded stock and sale records do not support an automatic fix. Check the original purchase or opening stock records first.</p>;
}
