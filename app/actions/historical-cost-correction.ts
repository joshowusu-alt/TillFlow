'use server';
import { requireBusiness } from '@/lib/auth';
import { applyHistoricalCostCorrection, reverseHistoricalCostCorrection } from '@/lib/services/historical-cost-correction';
import { safeAction, UserError, ok } from '@/lib/action-utils';
import { revalidatePath, revalidateTag } from 'next/cache';
import { revalidatePosInventory } from '@/lib/cache/pos-tags';
import { redirect } from 'next/navigation';

export async function submitHistoricalCostCorrection(form:FormData) {
  const {user,business}=await requireBusiness(['OWNER']);
  const productId=String(form.get('productId')??'');
  const storeId=String(form.get('storeId')??'');
  const fingerprint=String(form.get('fingerprint')??'');
  const operation=String(form.get('operation')??'');
  const reason=String(form.get('reason')??'').trim();
  const path='/products/'+encodeURIComponent(productId)+'/cost-review/preview';
  const query=new URLSearchParams({storeId});
  const result=await safeAction(async()=>{
    if(!productId||!storeId||productId.length>128||storeId.length>128||!['apply','reverse'].includes(operation))throw new UserError('Invalid cost correction scope.');
    const expected=operation==='apply'?'POST COST':'REVERSE COST';
    if(form.get('confirmation')!==expected||form.get('confirmed')!=='on')throw new UserError('Explicit confirmation is required.');
    const request={businessId:business.id,userId:user.id,productId,storeId,fingerprint,reason,confirmed:true};
    const outcome=operation==='apply'?await applyHistoricalCostCorrection(request):await reverseHistoricalCostCorrection(request);
    revalidatePosInventory(business.id,storeId);
    revalidateTag('reports');
    revalidatePath('/products','layout');
    revalidatePath('/reports','layout');
    revalidatePath('/sales','layout');
    return ok(outcome);
  });
  if(!result.success)query.set('error',result.error??'Correction could not be completed. Refresh and review the evidence.');
  redirect(path+'?'+query);
}
