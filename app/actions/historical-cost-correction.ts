'use server';
import { requireBusiness } from '@/lib/auth';
import { applyHistoricalCostCorrection, reverseHistoricalCostCorrection } from '@/lib/services/historical-cost-correction';
import { safeAction, UserError, ok } from '@/lib/action-utils';
import { revalidatePath, revalidateTag } from 'next/cache';
import { revalidatePosInventory } from '@/lib/cache/pos-tags';
import { redirect } from 'next/navigation';
import { costReviewPeriod } from '@/lib/reports/cost-review-navigation';
import { loadHistoricalCostPreview } from '@/lib/services/historical-cost-preview-load';
import { buildHistoricalCostPostingPlan } from '@/lib/services/historical-cost-posting-plan';

export async function submitHistoricalCostCorrection(form:FormData) {
  const {user,business}=await requireBusiness(['OWNER']);
  const productId=String(form.get('productId')??'');
  const storeId=String(form.get('storeId')??'');
  const fingerprint=String(form.get('fingerprint')??'');
  const operation=String(form.get('operation')??'');
  const reason=String(form.get('reason')??'').trim();
  const path='/products/'+encodeURIComponent(productId)+'/cost-review/preview';
  const query=new URLSearchParams({storeId});
  const period=costReviewPeriod({from:form.get('from'),to:form.get('to'),metric:form.get('metric')});
  const oneScreen=form.get('oneScreen')==='1' && period !== null;
  if(period) for(const [key,value] of Object.entries(period)) query.set(key,value);
  const result=await safeAction(async()=>{
    if(!business.billingCanWrite)throw new UserError('This business is currently read-only.');
    if(!productId||!storeId||productId.length>128||storeId.length>128||!['apply','reverse'].includes(operation))throw new UserError('Invalid cost correction scope.');
    if(form.get('confirmed')!=='on'||!reason||reason.length>500)throw new UserError('Explicit confirmation and a reason are required.');
    const scope={businessId:business.id,productId,storeId};
    let request={...scope,userId:user.id,fingerprint,reason,confirmed:true, ...{} } as Parameters<typeof applyHistoricalCostCorrection>[0];
    if (oneScreen && operation==='apply' && form.get('source')==='owner') {
      const raw=String(form.get('unitCost')??'').trim();
      if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw))throw new UserError('Enter a positive cost per stock unit with at most two decimal places.');
      const [whole,fraction='']=raw.split('.');
      const ownerUnitCost=Number(whole)*100+Number(fraction.padEnd(2,'0'));
      if(!Number.isSafeInteger(ownerUnitCost)||ownerUnitCost<=0||ownerUnitCost>2147483647)throw new UserError('Enter a positive cost per stock unit.');
      const preview=await loadHistoricalCostPreview(business.id,productId,storeId,ownerUnitCost);
      if(!preview||preview.result.status!=='REVIEWABLE'||!preview.result.source.opening?.needsValue)throw new UserError('The entered cost cannot be used with these stock records.');
      request={...request,ownerUnitCost,reviewFingerprint:fingerprint,fingerprint:buildHistoricalCostPostingPlan(scope,preview.result).fingerprint};
    }
    const outcome=operation==='apply'?await applyHistoricalCostCorrection(request):await reverseHistoricalCostCorrection(request);
    revalidatePosInventory(business.id,storeId);
    revalidateTag('reports');
    revalidatePath('/products','layout');
    revalidatePath('/reports','layout');
    revalidatePath('/sales','layout');
    return ok(outcome);
  });
  if(oneScreen && period) {
    const reportQuery=new URLSearchParams({from:period.from,to:period.to,metric:period.metric});
    if(result.success) { reportQuery.set('costFix',operation==='reverse'?'undone':'done'); if(operation==='apply'){reportQuery.set('costFixProduct',productId);reportQuery.set('costFixStore',storeId);} redirect('/reports/income-statement?'+reportQuery); }
    reportQuery.set('issues','1');
    reportQuery.set('error',result.error??'Cost fix could not be completed. Please review the records.');
    redirect('/reports/income-statement/entries?'+reportQuery);
  }
  if(!result.success)query.set('error',result.error??'Correction could not be completed. Refresh and review the evidence.');
  redirect(path+'?'+query);
}
