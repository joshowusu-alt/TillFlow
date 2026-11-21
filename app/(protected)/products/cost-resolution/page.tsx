import Link from 'next/link';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { loadCostResolutionBatch } from '@/lib/services/cost-resolution-batch';

export const dynamic = 'force-dynamic';

export default async function CostResolutionPage(props:{searchParams:Promise<{after?:string;review?:string}>}) {
  const {business}=await requireBusiness(['OWNER','MANAGER']);
  const params=await props.searchParams;
  const after=typeof params.after==='string' && params.after.length<=128 ? params.after : undefined;
  const review=params.review==='1';
  const data=await loadCostResolutionBatch(business.id,after,review);
  const href=(cursor?:string,run=false)=>'/products/cost-resolution?'+new URLSearchParams({...cursor?{after:cursor}:{},...run?{review:'1'}:{}});
  const money=(amount:number)=>formatMoney(amount,business.currency);
  return <div className="space-y-4 min-w-0">
    <PageHeader title="Cost Resolution Centre" subtitle="Review unconfirmed stock values without changing stock or financial records." secondaryCta={{label:'← Products',href:'/products?issue=MISSING_COST'}} />
    <section className="card p-4 space-y-3">
      <p className="text-sm text-slate-600">Stock positions awaiting review</p>
      <p className="text-2xl font-semibold tabular-nums">{data.total}</p>
      <p className="text-sm">Review a small batch against original purchases, movements and journals. Candidates still require owner approval and wider ledger reconciliation. A blocked record needs manual evidence; no average or catalogue cost is substituted.</p>
      <div className="flex flex-wrap gap-3">
        <Link className="btn-secondary inline-flex min-h-11 items-center" href="/reports/income-statement">Review sales blocking period profit</Link>
        {!review && data.rows.length ? <Link className="btn-primary inline-flex min-h-11 items-center" href={href(after,true)}>Review this batch →</Link> : null}
        {after ? <Link className="btn-secondary inline-flex min-h-11 items-center" href={href()}>Start again</Link> : null}
      </div>
    </section>
    <section className="space-y-3" aria-label="Stock evidence batch">
      {data.rows.map(row=><article key={row.id} className="card p-4 space-y-2">
        <h2 className="font-semibold break-words">{row.product.name}</h2>
        <p className="text-sm text-slate-600">{row.store.name} · {row.qtyOnHandBase} base units</p>
        {row.preview?.status==='REVIEWABLE' ? <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-950">
          <p className="font-semibold">Evidence candidate — not posted</p>
          <p>Proposed stock value: {money(row.preview.stockValue)}</p>
          <p>Additional historical COGS: {money(row.preview.cogsDelta)}</p>
          <p>{row.preview.corrections.length} affected sale lines</p>
        </div> : row.preview?.status==='BLOCKED' ? <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-950">
          <p className="font-semibold">Manual reconciliation required</p><p>{row.preview.reason}</p>
        </div> : <p className="text-sm">Not reviewed yet.</p>}
        <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={`/products/${encodeURIComponent(row.productId)}/cost-review/preview?${new URLSearchParams({storeId:row.storeId})}`}>Open individual evidence →</Link>
      </article>)}
      {!data.rows.length ? <p className="card p-4">No more unconfirmed stock positions in this queue.</p> : null}
    </section>
    {data.next ? <Link className="btn-secondary inline-flex min-h-11 items-center" href={href(data.next)}>Next batch →</Link> : null}
    <p className="text-xs text-slate-600">Read-only: stock quantity, balances, sales, customer payments and journals are never changed by this review.</p>
  </div>;
}
