import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import PageHeader from '@/components/PageHeader';
import { loadHistoricalCostPreview } from '@/lib/services/historical-cost-preview-load';

export const dynamic = 'force-dynamic';

export default async function HistoricalCostPreviewPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ storeId?: string }> }) {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  const { id } = await props.params;
  const { storeId } = await props.searchParams;
  if (!storeId) notFound();
  const data = await loadHistoricalCostPreview(business.id, id, storeId);
  if (!data) notFound();
  const { result } = data;
  const money = (value: number) => formatMoney(value, business.currency);
  const date = (value: Date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: business.timezone }).format(value);
  return <div className="min-w-0 space-y-4">
    <PageHeader title="Historical cost correction preview" subtitle={data.product + ' · ' + data.store} secondaryCta={{label:'← Cost evidence',href:`/products/${encodeURIComponent(id)}/cost-review`}} />
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Preview only. Nothing has been posted. This checks recorded purchase, supplier credit, stock movement, sale and journal evidence; current catalogue prices are not used.</p>
    {result.status === 'BLOCKED' ? <section className="card space-y-2 p-4">
      <h2 className="font-semibold text-amber-900">Manual reconciliation required</h2>
      <p className="text-sm">{result.reason}</p>
      <p className="text-sm text-slate-600">Keep profit unconfirmed until the missing or conflicting evidence is resolved.</p>
    </section> : <>
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Candidate supported by recorded history</h2>
        <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={`/purchases/${encodeURIComponent(result.source.id)}`}>{result.source.label}</Link>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div><dt className="text-slate-600">Original purchase</dt><dd>{result.source.qty} base units · {money(result.source.value)}</dd></div>
          <div><dt className="text-slate-600">Reconstructed unit cost</dt><dd>{money(result.unitCost)}</dd></div>
          <div><dt className="text-slate-600">Proposed current stock value</dt><dd className="font-semibold">{money(result.stockValue)}</dd></div>
          <div><dt className="text-slate-600">Additional historical cost of goods sold</dt><dd className="font-semibold">{money(result.cogsDelta)}</dd></div>
        </dl>
      </section>
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Affected sale lines ({result.corrections.length})</h2>
        {result.corrections.map(row => <article key={row.lineId} className="rounded-xl border border-slate-200 p-3 text-sm space-y-1">
          <p className="font-semibold">{row.receipt}</p><p>{date(row.date)} · {row.qty} base units</p>
          <p>Recorded cost: unconfirmed · Proposed cost: {money(row.proposedCost)}</p>
        </article>)}
        {!result.corrections.length ? <p className="text-sm">No unverified sales in this reconstructed history.</p> : null}
      </section>
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2 text-sm text-amber-950">
        <h2 className="font-semibold">Proposed accounting impact — not posted</h2>
        <p>Dr Cost of Goods Sold (5000): {money(result.cogsDelta)}</p>
        <p>Cr Inventory (1200): {money(result.cogsDelta)}</p>
        <p>Stock quantity, selling prices, customer receipts, payments and supplier credits remain unchanged. Reconstructed stock value is a subledger confirmation, not a new purchase or inventory gain.</p>
        <p>Owner approval, source-document verification, confirmation of the wider inventory ledger and a reversible posting workflow are required before any correction. This preview cannot apply changes.</p>
      </section>
    </>}
  </div>;
}
