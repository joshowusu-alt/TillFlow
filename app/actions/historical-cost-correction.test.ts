import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),apply:vi.fn(),reverse:vi.fn(),cache:vi.fn(),tag:vi.fn(),path:vi.fn(),preview:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireBusiness:m.auth}));
vi.mock('@/lib/services/historical-cost-correction',()=>({applyHistoricalCostCorrection:m.apply,reverseHistoricalCostCorrection:m.reverse}));
vi.mock('@/lib/services/historical-cost-preview-load',()=>({loadHistoricalCostPreview:m.preview}));
vi.mock('@/lib/action-utils',()=>({UserError:Error,ok:(data:unknown)=>({success:true,data}),safeAction:async(fn:()=>Promise<unknown>)=>{try{return await fn()}catch(e){return {success:false,error:(e as Error).message}}}}));
vi.mock('@/lib/cache/pos-tags',()=>({revalidatePosInventory:m.cache}));
vi.mock('next/cache',()=>({revalidatePath:m.path,revalidateTag:m.tag}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url)}}));
import {submitHistoricalCostCorrection} from './historical-cost-correction';
const fp='a'.repeat(64);
function form(operation='apply',confirmation='POST COST'){
 const f=new FormData();for(const [key,value] of Object.entries({operation,confirmation,confirmed:'on',reason:'Evidence reviewed',productId:'product',storeId:'store',fingerprint:fp,businessId:'forged',userId:'forged'}))f.set(key,value);return f;
}
describe('owner cost confirmation boundary',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({business:{id:'business',billingCanWrite:true},user:{id:'owner'}});m.apply.mockResolvedValue({fingerprint:fp,replayed:false});m.reverse.mockResolvedValue({fingerprint:fp,replayed:false});});
 it('uses authenticated scope rather than submitted identity and invalidates scoped caches only after success',async()=>{
  await expect(submitHistoricalCostCorrection(form())).rejects.toThrow('REDIRECT:/products/product/cost-review/preview?storeId=store');
  expect(m.auth).toHaveBeenCalledWith(['OWNER']);
  expect(m.apply).toHaveBeenCalledWith({businessId:'business',userId:'owner',productId:'product',storeId:'store',fingerprint:fp,reason:'Evidence reviewed',confirmed:true});
  expect(m.cache).toHaveBeenCalledWith('business','store');
 });
 it('rejects missing explicit confirmation and forged operation before calling services',async()=>{
  const f=form();f.delete('confirmed');
  await expect(submitHistoricalCostCorrection(f)).rejects.toThrow('Explicit+confirmation');
  await expect(submitHistoricalCostCorrection(form('anything'))).rejects.toThrow('Invalid+cost+correction');
  expect(m.apply).not.toHaveBeenCalled();expect(m.reverse).not.toHaveBeenCalled();
 });
 it('blocks unauthorised caller, and surfaces failed stale reversals without cache invalidation',async()=>{
  m.auth.mockRejectedValueOnce(new Error('DENIED'));
  await expect(submitHistoricalCostCorrection(form())).rejects.toThrow('DENIED');
  m.reverse.mockRejectedValueOnce(new Error('Subsequent activity'));
  await expect(submitHistoricalCostCorrection(form('reverse','REVERSE COST'))).rejects.toThrow('Subsequent+activity');
  expect(m.apply).not.toHaveBeenCalled();expect(m.cache).not.toHaveBeenCalled();
 });
 it('preserves valid report dates on redirect without changing posting scope',async()=>{
  const f=form();f.set('from','2026-11-01');f.set('to','2026-11-26');f.set('metric','cogs');
  await expect(submitHistoricalCostCorrection(f)).rejects.toThrow('REDIRECT:/products/product/cost-review/preview?storeId=store&from=2026-11-01&to=2026-11-26&metric=cogs');
  expect(m.apply).toHaveBeenCalledWith({businessId:'business',userId:'owner',productId:'product',storeId:'store',fingerprint:fp,reason:'Evidence reviewed',confirmed:true});
 });
 it('requires positive typed cost and blocks it when the server cannot prove unvalued opening stock',async()=>{
  const f=form();f.set('oneScreen','1');f.set('source','owner');f.set('from','2026-11-01');f.set('to','2026-11-26');
  f.set('unitCost','0');await expect(submitHistoricalCostCorrection(f)).rejects.toThrow('positive+cost');
  f.set('unitCost','128');m.preview.mockResolvedValue({result:{status:'BLOCKED'}});
  await expect(submitHistoricalCostCorrection(f)).rejects.toThrow('entered+cost+cannot+be+used');
  expect(m.preview).toHaveBeenCalledWith('business','product','store',12800);expect(m.apply).not.toHaveBeenCalled();
 });
});
