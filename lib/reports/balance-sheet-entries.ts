import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export function signedLedgerAmount(type: string, debit: number, credit: number) {
  return type === 'ASSET' || type === 'EXPENSE' ? debit - credit : credit - debit;
}

/** One source and exclusive cutoff for both the summary and its supporting entries. */
async function readBalanceSheetEntries(db: Prisma.TransactionClient, businessId: string, code: string, cutoff: Date) {
  const profit = code === 'CURRENT_PROFIT';
  const accounts = await db.account.findMany({where:{businessId,...(profit ? {type:{in:['INCOME','EXPENSE']}} : {code})},select:{id:true,name:true,type:true}});
  if (!accounts.length && !profit) return null;
  const grouped = await db.journalLine.groupBy({by:['journalEntryId'],where:{accountId:{in:accounts.map(a=>a.id)},account:{businessId},journalEntry:{businessId,entryDate:{lt:cutoff}}},_sum:{debitPence:true,creditPence:true}});
  const journals = await db.journalEntry.findMany({where:{businessId,entryDate:{lt:cutoff},lines:{some:{accountId:{in:accounts.map(a=>a.id)},account:{businessId}}}},select:{id:true,entryDate:true,description:true,referenceType:true,referenceId:true},orderBy:[{entryDate:'asc'},{id:'asc'}]});
  const totals = new Map(grouped.map(row=>[row.journalEntryId,row._sum]));
  const type = profit ? 'EQUITY' : accounts[0].type;
  const returnRefs=journals.filter(j=>j.referenceType==='PURCHASE_RETURN').map(j=>j.referenceId!).filter(Boolean);
  const returns=returnRefs.length?await db.purchaseReturn.findMany({where:{id:{in:returnRefs},purchaseInvoice:{businessId}},select:{id:true,purchaseInvoiceId:true}}):[];
  const creditRefs=journals.filter(j=>j.referenceType==='PURCHASE_RETURN_CREDIT').map(j=>j.referenceId!).filter(Boolean);
  const credits=creditRefs.length?await db.purchaseReturnCredit.findMany({where:{id:{in:creditRefs},businessId},select:{id:true,purchaseInvoiceId:true}}):[];
  const returnMap=new Map([...returns,...credits].map(r=>[r.id,r.purchaseInvoiceId]));
  const purchaseIdFor=(j:{referenceType:string|null;referenceId:string|null})=>['PURCHASE_RETURN','PURCHASE_RETURN_CREDIT'].includes(j.referenceType??'')?returnMap.get(j.referenceId??'')??null:['PURCHASE_INVOICE','SUPPLIER_PAYMENT'].includes(j.referenceType??'')?j.referenceId:null;
  const purchaseIds=[...new Set(journals.map(purchaseIdFor).filter((id):id is string=>Boolean(id)))];
  const saleIds=[...new Set(journals.filter(j=>['SALES_INVOICE','CUSTOMER_RECEIPT'].includes(j.referenceType??'')).map(j=>j.referenceId!).filter(Boolean))];
  const sales=saleIds.length?await db.salesInvoice.findMany({where:{businessId,id:{in:saleIds}},select:{id:true,transactionNumber:true,customer:{select:{name:true}}}}):[];
  const saleMap=new Map(sales.map(s=>[s.id,s]));
  const paymentRefs=journals.filter(j=>j.referenceType==='EXPENSE_PAYMENT').map(j=>j.referenceId!).filter(Boolean);
  const expensePayments=paymentRefs.length?await db.expensePayment.findMany({where:{businessId,id:{in:paymentRefs}},select:{id:true,expenseId:true}}):[];
  const expensePaymentMap=new Map(expensePayments.map(p=>[p.id,p.expenseId]));
  const expenseIdFor=(journal:{referenceType:string|null;referenceId:string|null})=>journal.referenceType==='EXPENSE_PAYMENT'?expensePaymentMap.get(journal.referenceId??'')??null:journal.referenceType==='EXPENSE'?journal.referenceId:null;
  const expenseIds=[...new Set(journals.map(expenseIdFor).filter((id):id is string=>Boolean(id)))];
  const [purchases,expenses] = await Promise.all([
    db.purchaseInvoice.findMany({where:{businessId,id:{in:purchaseIds}},select:{id:true,transactionNumber:true,supplierInvoiceNumber:true,supplier:{select:{name:true}}}}),
    db.expense.findMany({where:{businessId,id:{in:expenseIds}},select:{id:true,transactionNumber:true,vendorName:true}}),
  ]);
  const purchaseMap=new Map(purchases.map(p=>[p.id,p])), expenseMap=new Map(expenses.map(e=>[e.id,e]));
  let running=0;
  const entries=journals.map(journal=>{
    const sum=totals.get(journal.id)!;
    const amount=signedLedgerAmount(type,sum.debitPence??0,sum.creditPence??0);running+=amount;
    const purchase=purchaseMap.get(purchaseIdFor(journal)??''),expense=expenseMap.get(expenseIdFor(journal)??''),sale=saleMap.get(journal.referenceId??'');
    return {...journal,sourceId:expenseIdFor(journal)??purchaseIdFor(journal)??journal.referenceId,amountPence:amount,runningPence:running,label:purchase ? [purchase.transactionNumber,purchase.supplierInvoiceNumber,purchase.supplier?.name].filter(Boolean).join(' · ') : expense ? [expense.transactionNumber,expense.vendorName].filter(Boolean).join(' · ') : sale ? [sale.transactionNumber,sale.customer?.name].filter(Boolean).join(' · ') || 'Sale' : journal.description,href:purchase ? `/purchases/${purchase.id}` : expense ? `/expenses/${expense.id}` : sale ? `/sales/${sale.id}` : null};
  });
  // AP is grouped from journals at the selected date, including payments and opening entries.
  const sourceBalances=new Map<string,{label:string;href:string|null;amountPence:number}>();
  for(const entry of entries){const kind=['PURCHASE_INVOICE','SUPPLIER_PAYMENT','PURCHASE_RETURN','PURCHASE_RETURN_CREDIT'].includes(entry.referenceType??'')?'PURCHASE': ['EXPENSE','EXPENSE_PAYMENT'].includes(entry.referenceType??'')?'EXPENSE':entry.referenceType;const key=entry.sourceId?`${kind}:${entry.sourceId}`:entry.id;const source=sourceBalances.get(key)??{label:entry.label,href:entry.href,amountPence:0};source.amountPence+=entry.amountPence;sourceBalances.set(key,source);}
  let inventory: {id:string;name:string;qtyBase:number;valuePence:number;unknownCostCount:number}[]=[];
  if(code==='1200'){
    const movements=await db.stockMovement.groupBy({by:['productId'],where:{store:{businessId},product:{businessId},createdAt:{lt:cutoff}},_sum:{qtyBase:true,valuePence:true}});
    const products=await db.product.findMany({where:{businessId,id:{in:movements.map(m=>m.productId)}},select:{id:true,name:true}});
    const unknown=await db.stockMovement.groupBy({by:['productId'],where:{store:{businessId},product:{businessId},createdAt:{lt:cutoff},valuePence:null},_count:{_all:true}});
    const productMap=new Map(products.map(p=>[p.id,p.name])),unknownMap=new Map(unknown.map(m=>[m.productId,m._count._all]));
    inventory=movements.map(m=>({id:m.productId,name:productMap.get(m.productId)??'Product',qtyBase:m._sum.qtyBase??0,valuePence:m._sum.valuePence??0,unknownCostCount:unknownMap.get(m.productId)??0}));
  }
  return {name:profit?'Profit to date':accounts[0].name,type,balancePence:running,entries,sources:[...sourceBalances.values()].filter(s=>s.amountPence!==0),inventory};
}

export async function getBalanceSheetEntries(businessId: string, code: string, cutoff: Date) {
  return prisma.$transaction(tx=>readBalanceSheetEntries(tx,businessId,code,cutoff),{isolationLevel:'Serializable',maxWait:5000,timeout:15000});
}
