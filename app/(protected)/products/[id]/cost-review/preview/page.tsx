import Link from 'next/link';
import { notFound } from 'next/navigation';
import { submitHistoricalCostCorrection } from '@/app/actions/historical-cost-correction';
import { listHistoricalCostCorrections } from '@/lib/services/historical-cost-correction';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { buildHistoricalCostPostingPlan } from '@/lib/services/historical-cost-posting-plan';
import { loadHistoricalCostPreview } from '@/lib/services/historical-cost-preview-load';
import { affectedSalesHref, costReviewHref, costReviewPeriod } from '@/lib/reports/cost-review-navigation';

export const dynamic = 'force-dynamic';

export default async function HistoricalCostPreviewPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ storeId?: string; error?: string; from?: string; to?: string; metric?: string }> }) {
  const { business, user } = await requireBusiness(['OWNER', 'MANAGER']);
  const { id } = await props.params;
  const search = await props.searchParams;
  const { storeId, error } = search;
  const period = costReviewPeriod(search);
  const back = affectedSalesHref(search);
  if (!storeId) notFound();
  const data = await loadHistoricalCostPreview(business.id, id, storeId);
  if (!data) notFound();
  const history = user.role === 'OWNER' ? await listHistoricalCostCorrections({businessId:business.id,productId:id,storeId}) : [];
  const { result } = data;
  const plan = result.status === 'REVIEWABLE' ? buildHistoricalCostPostingPlan({businessId:business.id,productId:id,storeId},result) : null;
  const money = (value: number) => formatMoney(value, business.currency);
  const date = (value: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: business.timezone }).format(value);
  return <div className="min-w-0 space-y-4">
    <PageHeader title="Review proposed cost correction" subtitle={data.product + ' · ' + data.store} secondaryCta={{label:'← Check product costs',href:costReviewHref(id,search)}} />
    {back ? <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline" href={back}>← Back to affected sales</Link> : null}
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">TillFlow checks original purchases, supplier credits, stock movements, sales and accounting entries. Today&apos;s product cost is not used. This branch review covers the full relevant history, not just the report dates.</p>
    {typeof error === 'string' && error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error.slice(0,500)}</p> : null}
    {result.status === 'BLOCKED' ? <section className="card space-y-2 p-4">
      <h2 className="font-semibold text-amber-900">{history.some(row=>!row.reversed)?'No new automatic cost fix available':'Stock and sale records need review'}</h2>
      <p className="text-sm">{result.reason}</p>
      <p className="text-sm text-slate-600">No correction can be posted from this preview. Check the original invoices and stock records with your accountant. Profit remains incomplete until the evidence is resolved.</p>
      <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={costReviewHref(id,search)+'#purchase-evidence'}>Return to purchase records →</Link>
    </section> : <>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">1. Check the original stock record</h2>
        {result.source.opening?<p>{result.source.label}</p>:<Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={`/purchases/${encodeURIComponent(result.source.id)}`}>{result.source.label}</Link>}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div><dt className="text-slate-600">Original purchase</dt><dd>Quantity {result.source.qty} (stock units) · {money(result.source.value)}</dd></div>
          <div><dt className="text-slate-600">Cost per stock unit from records</dt><dd>{money(result.unitCost)}</dd></div>
          <div><dt className="text-slate-600">Proposed current stock value</dt><dd className="font-semibold">{money(result.stockValue)}</dd></div>
          <div><dt className="text-slate-600">Additional cost of earlier sales</dt><dd className="font-semibold">{money(result.cogsDelta)}</dd></div>
        </dl>
      </section>
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">2. Check affected sale lines ({result.corrections.length})</h2>
        {result.corrections.map(row => <article key={row.lineId} className="rounded-xl border border-slate-200 p-3 text-sm space-y-1">
          <p className="font-semibold">{row.receipt}</p><p>{date(row.date)} · Quantity {row.qty} (stock units)</p>
          <p>Recorded cost: unconfirmed · Proposed cost: {money(row.proposedCost)}</p>
        </article>)}
        {!result.corrections.length ? <p className="text-sm">No unverified sales in this reconstructed history.</p> : null}
      </section>
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2 text-sm text-amber-950">
        <h2 className="font-semibold">3. Check the effect on your accounts — not posted</h2>
        <p>Earlier sale costs increase by {money(result.cogsDelta)} and accounting inventory decreases by the same amount. This reduces profit by that amount across the affected sale dates, not necessarily just the selected report period.</p>
        <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">Accounting entries and reference</summary>
        <p>Dr Cost of Goods Sold (5000): {money(result.cogsDelta)}</p>
        <p>Cr Inventory (1200): {money(result.cogsDelta)}</p>
        <p>Stock quantity, selling prices, customer receipts, payments and supplier credits remain unchanged. Reconstructed stock value is a subledger confirmation, not a new purchase or inventory gain.</p>
        {plan ? <p>Correction preview reference: <span className="font-mono break-all">{plan.fingerprint.slice(0,16)}</span>. Each correction is linked to the original receipt date, sale line and stock movement; reversal entries swap the debit and credit.</p> : null}
        </details>
        <p>The owner must check the original stock and sale records. No stock quantity or customer payment will be altered.</p>
      </section>
      {plan && user.role === 'OWNER' ? <CostConfirmationForm productId={id} storeId={storeId} fingerprint={plan.fingerprint} operation="apply" period={period} /> : <p className="text-sm text-slate-600">Only an owner can post a confirmed correction.</p>}
    </>}
    {history.length ? <section className="card p-4 space-y-3">
      <h2 className="font-semibold">Posted correction history</h2>
      {history.map(row=><article key={row.fingerprint} className="rounded-xl border border-slate-200 p-3 space-y-2 text-sm">
        <p className="font-semibold">{row.reversed?'Reversed':'Posted'} · {date(row.createdAt)}</p>
        <p>Cost of earlier sales: {money(row.cogsDelta)} · Confirmed stock value: {money(row.remainingStockValue)}</p>
        {row.opening ? <details><summary className="min-h-11 cursor-pointer py-3 font-semibold">See accounting details</summary><p>Owner entered, no purchase record. Opening stock recorded at {money(row.opening.valuePence)} on {date(new Date(row.opening.entryDate))}.</p><p>Dr 1200 Inventory / Cr 3200 Opening Balance Equity; cost of earlier sales Dr 5000 / Cr 1200.</p></details>:null}
        <p>{row.userName} · {row.reason}</p>
        <p className="font-mono break-all text-xs">{row.fingerprint.slice(0,16)}</p>
        {!row.reversed ? <CostConfirmationForm productId={id} storeId={storeId} fingerprint={row.fingerprint} operation="reverse" period={period} /> : null}
      </article>)}
    </section> : null}
  </div>;
}

function CostConfirmationForm({productId,storeId,fingerprint,operation,period}:{productId:string;storeId:string;fingerprint:string;operation:'apply'|'reverse';period:ReturnType<typeof costReviewPeriod>}) {
  const reverse=operation==='reverse';
  return <form action={submitHistoricalCostCorrection} className="card p-4 space-y-3 text-sm">
    <h3 className="font-semibold">{reverse?'Undo this cost fix':'Confirm the cost fix'}</h3>
    <p>{reverse?'Undo is blocked if there has been any later stock, sale or accounting activity.':'Check the original purchase, sales and stock records. This changes the cost of earlier sales and stock value, not sales revenue or quantity.'}</p>
    <input type="hidden" name="operation" value={operation} />
    <input type="hidden" name="productId" value={productId} />
    <input type="hidden" name="storeId" value={storeId} />
    <input type="hidden" name="fingerprint" value={fingerprint} />
    {period ? Object.entries(period).map(([name,value]) => <input key={name} type="hidden" name={name} value={value} />) : null}
    {period && reverse ? <input type="hidden" name="oneScreen" value="1" /> : null}
    <label className="block">Reason<textarea name="reason" required maxLength={500} className="input mt-1 w-full" /></label>
    <label className="flex min-h-11 items-start gap-2"><input name="confirmed" type="checkbox" required className="mt-1" /> <span>{reverse?'I have checked the original cost fix and understand the undo conditions.':'I have checked the original records and confirm this cost fix.'}</span></label>
    <button className="btn-primary min-h-11 w-full sm:w-auto" type="submit">{reverse?'Undo this cost fix':'Post confirmed correction'}</button>
  </form>;
}
