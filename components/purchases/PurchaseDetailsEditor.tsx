'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {updatePurchaseDetailsAction} from '@/app/actions/purchases';
export default function PurchaseDetailsEditor({invoice,suppliers,expectedDetails,initiallyOpen=false}:{invoice:{id:string;supplierId:string|null;supplierInvoiceNumber:string|null;dueDate:string;additionalCostNote:string|null;additionalCostPence:number};suppliers:{id:string;name:string}[];expectedDetails:string;initiallyOpen?:boolean}){
  const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  return <details id="edit-purchase" open={initiallyOpen||undefined} className="card p-5"><summary className="cursor-pointer font-semibold">Edit purchase details</summary><p className="mt-2 text-sm text-black/60">Correct the supplier, original invoice number, due date or cost description. Your stock quantities, costs and payment history stay linked to this purchase.</p><form className="mt-4 grid gap-4 sm:grid-cols-2" action={async data=>{if(busy)return;setBusy(true);setError('');setSaved(false);try{const result=await updatePurchaseDetailsAction(data);if(!result.success){setError(result.error);return;}setSaved(true);router.refresh();}catch{setError('Could not save this correction. Please try again.');}finally{setBusy(false);}}}>
    <input type="hidden" name="invoiceId" value={invoice.id}/><input type="hidden" name="expectedDetails" value={expectedDetails}/>
    <label className="label">Supplier<select className="input mt-1" name="supplierId" defaultValue={invoice.supplierId??''}><option value="">No supplier selected</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="label">Supplier’s original invoice number<input className="input mt-1" name="supplierInvoiceNumber" defaultValue={invoice.supplierInvoiceNumber??''} maxLength={100}/></label>
    <label className="label">Due date (optional)<input className="input mt-1" type="date" name="dueDate" defaultValue={invoice.dueDate}/></label>
    {invoice.additionalCostPence>0?<label className="label">Additional-cost description<input className="input mt-1" name="additionalCostNote" defaultValue={invoice.additionalCostNote??''} maxLength={300}/></label>:<input type="hidden" name="additionalCostNote" value={invoice.additionalCostNote??''}/>}
    <label className="label sm:col-span-2">Reason for correction<input className="input mt-1" name="reason" placeholder="e.g. Supplier was missed when receiving this delivery" required maxLength={300}/></label>
    {error?<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>:null}{saved?<p role="status" className="text-sm text-emerald-700 sm:col-span-2">Purchase details updated. The correction has been recorded.</p>:null}
    <button type="submit" className="btn-primary w-full sm:w-fit" disabled={busy}>{busy?'Saving…':'Save changes'}</button>
  </form><p className="mt-4 text-xs text-black/55">To correct received quantities or financial amounts, use the purchase’s Return action and record the corrected purchase.</p></details>;
}
