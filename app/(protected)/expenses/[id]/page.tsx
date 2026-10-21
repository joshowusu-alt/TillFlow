import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';

export default async function ExpenseDetailPage({params}:{params:{id:string}}){
  const {business}=await requireBusinessAndOptionalStore(['MANAGER','OWNER']);
  if(!business)return <div className="card p-5">Business not found.</div>;
  const expense=await prisma.expense.findFirst({where:{id:params.id,businessId:business.id},include:{account:{select:{name:true}},store:{select:{name:true}},payments:{orderBy:{paidAt:'asc'},include:{user:{select:{name:true}}}},purchaseCostInvoices:{select:{id:true,transactionNumber:true,supplierInvoiceNumber:true}}}});
  if(!expense)return <div className="card p-5">Expense not found.</div>;
  const money=(n:number)=>formatMoney(n,business.currency),paid=expense.payments.reduce((sum,p)=>sum+p.amountPence,0);
  const method=(p:{reference:string|null;method:string})=>p.reference?.startsWith('funding:3100.OWNER.')?'Owner’s money — contribution':p.reference?.startsWith('funding:2300.OWNER.')?'Owner’s money — repay owner':p.reference?.startsWith('funding:1000.HOLD.')?'Business cash held outside the till':p.method;
  return <div className="space-y-5"><Link href="/expenses" className="text-sm font-semibold text-accent">← Expenses</Link><div className="card space-y-2 p-5"><h1 className="text-xl font-semibold">{displayDocumentNumber('expense',expense.transactionNumber,expense.id)}</h1><p className="text-sm text-ink/60">{expense.account.name} · {expense.store.name} · {formatDateTime(expense.createdAt)}</p>{expense.vendorName?<p>Payee: {expense.vendorName}</p>:null}{expense.notes?<p className="break-words text-sm">{expense.notes}</p>:null}<dl className="grid gap-4 pt-3 sm:grid-cols-3">{[['Total',expense.amountPence],['Paid',paid],['Remaining',expense.amountPence-paid]].map(([label,value])=><div key={label}><dt className="text-xs text-ink/60">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{money(Number(value))}</dd></div>)}</dl></div>
  {expense.purchaseCostInvoices.length?<div className="card p-5"><h2 className="font-semibold">Linked purchase costs</h2>{expense.purchaseCostInvoices.map(p=><p className="mt-2 text-sm" key={p.id}><Link className="text-accent underline" href={`/purchases/${p.id}`}>{p.transactionNumber||'Purchase'}{p.supplierInvoiceNumber?` · Supplier invoice ${p.supplierInvoiceNumber}`:''}</Link></p>)}<p className="mt-2 text-xs text-ink/60">This cost is expensed separately from the goods. Recorded payments are split between the purchase and this expense.</p></div>:null}
  <section className="card p-5"><h2 className="font-semibold">Payment history</h2>{expense.payments.length?<ul className="mt-3 divide-y">{expense.payments.map(p=><li key={p.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div>{formatDateTime(p.paidAt)}<p className="mt-1 text-ink/60">{method(p)} · Recorded by {p.user.name}</p></div><strong className="tabular-nums">{money(p.amountPence)}</strong></li>)}</ul>:<p className="mt-3 text-sm text-ink/60">No payment recorded.</p>}{paid<expense.amountPence?<Link className="btn-secondary mt-4" href={`/payments/expense-payments?expenseId=${expense.id}`}>Record payment</Link>:null}</section></div>;
}
