import { prisma } from '@/lib/prisma';

export type PurchaseDetailsInput = {
  businessId: string; invoiceId: string; actor: { id: string; name: string | null; role: string };
  expectedDetails?: string;
  supplierId: string | null; supplierInvoiceNumber: string; dueDate: string; additionalCostNote: string; reason: string;
};

/** Attribution changes never replay stock receipts or money postings. */
export async function updatePurchaseDetails(input: PurchaseDetailsInput) {
  if (!['OWNER', 'MANAGER'].includes(input.actor.role)) throw new Error('Only owners and managers can edit purchases.');
  const reference = input.supplierInvoiceNumber.trim(), note = input.additionalCostNote.trim(), reason = input.reason.trim();
  if (reference.length > 100 || /[\x00-\x1f]/.test(reference)) throw new Error('Supplier invoice number must be up to 100 characters.');
  if (note.length > 300) throw new Error('Cost description must be up to 300 characters.');
  if (!reason || reason.length > 300) throw new Error('Enter a reason for this correction (up to 300 characters).');
  const date = input.dueDate ? new Date(input.dueDate + 'T00:00:00Z') : null;
  if (input.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== input.dueDate)) throw new Error('Choose a valid due date.');
  return prisma.$transaction(async tx => {
    const invoice = await tx.purchaseInvoice.findFirst({where:{id:input.invoiceId,businessId:input.businessId},include:{payments:{select:{amountPence:true}},purchaseReturn:{select:{id:true}}}});
    if (!invoice) throw new Error('Purchase not found.');
    if (invoice.purchaseReturn || ['VOID','RETURNED'].includes(invoice.paymentStatus)) throw new Error('Returned or voided purchases cannot be edited.');
    if (input.supplierId) {
      const supplier = await tx.supplier.findFirst({where:{id:input.supplierId,businessId:input.businessId},select:{id:true}});
      if (!supplier) throw new Error('Choose a supplier from this business.');
    }
    const remaining = invoice.totalPence - invoice.payments.reduce((sum,p)=>sum+p.amountPence,0);
    if (remaining > 0 && !input.supplierId) throw new Error('A purchase with an unpaid balance must have a supplier.');
    const before={supplierId:invoice.supplierId,supplierInvoiceNumber:invoice.supplierInvoiceNumber,dueDate:invoice.dueDate?.toISOString()??null,additionalCostNote:invoice.additionalCostNote};
    if (input.expectedDetails && input.expectedDetails !== JSON.stringify(before)) throw new Error('This purchase was edited in another session. Refresh it before saving your correction.');
    const after={supplierId:input.supplierId,supplierInvoiceNumber:reference||null,dueDate:date?.toISOString()??null,additionalCostNote:note||null};
    if (JSON.stringify(before) === JSON.stringify(after)) return {invoiceId:invoice.id,previousSupplierId:invoice.supplierId};
    await tx.purchaseInvoice.update({where:{id:invoice.id},data:{...after,dueDate:date}});
    if (invoice.linkedCostExpenseId && invoice.additionalCostNote !== after.additionalCostNote) await tx.expense.updateMany({where:{id:invoice.linkedCostExpenseId,businessId:input.businessId},data:{notes:after.additionalCostNote}});
    await tx.auditLog.create({data:{businessId:input.businessId,userId:input.actor.id,userName:input.actor.name??'Unknown',userRole:input.actor.role,action:'PURCHASE_UPDATE',entity:'PurchaseInvoice',entityId:invoice.id,reason,details:JSON.stringify({before,after})}});
    return {invoiceId:invoice.id,previousSupplierId:invoice.supplierId};
  },{isolationLevel:'Serializable',maxWait:5000,timeout:15000});
}
