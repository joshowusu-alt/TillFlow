import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import AccountSection from '@/components/people/AccountSection';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { historyPage } from '@/lib/services/product-history';
import { COST_REVIEW_PAGE_SIZE, getProductCostReview } from '@/lib/services/product-cost-review';

export const dynamic = 'force-dynamic';

export default async function ProductCostReviewPage(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ page?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  const data = await getProductCostReview(business.id, params.id, historyPage(searchParams?.page));
  if (!data) notFound();
  const { product } = data;
  const date = (value: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: business.timezone, dateStyle: 'medium' }).format(value);
  const pages = Math.max(1, Math.ceil(data.saleCount / COST_REVIEW_PAGE_SIZE));
  return <div className="min-w-0 space-y-4">
    <PageHeader title="Review cost evidence" subtitle={[product.name, product.publisher, product.edition].filter(Boolean).join(' · ')} secondaryCta={{ label: '← Missing-cost review', href: '/products?issue=MISSING_COST' }} />
    <section className="card p-4 sm:p-6">
      <h2 className="font-semibold">Current product cost</h2>
      <p className="mt-2 text-xl font-semibold">{formatMoney(product.defaultCostBasePence, business.currency)} per base unit</p>
      <p className="mt-2 text-sm text-slate-600">This is the catalogue cost for product setup. It does not confirm the value of existing stock or the cost of an earlier sale.</p>
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent underline" href={`/products/${encodeURIComponent(product.id)}#cost`}>Open product cost settings</Link>
    </section>
    <section className="card p-4 sm:p-6">
      <h2 className="font-semibold">Existing stock by branch</h2>
      <p className="mt-1 text-sm text-slate-600">All branches in this business. Quantities below are base units.</p>
      <div className="mt-3 space-y-3">{product.inventoryBalances.map(row => {
        const complete = row.qtyOnHandBase === 0 || (row.qtyOnHandBase > 0 && row.knownValuePence != null && row.unvaluedQtyBase === 0);
        return <article key={row.store.id} className="rounded-xl border border-slate-200 p-3 text-sm">
          <h3 className="font-semibold">{row.store.name}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-3"><div><dt className="text-slate-600">On hand</dt><dd>{row.qtyOnHandBase.toLocaleString()}</dd></div><div><dt className="text-slate-600">Confirmed stock value</dt><dd className="font-semibold">{complete ? formatMoney(row.qtyOnHandBase === 0 ? 0 : row.knownValuePence!, business.currency) : 'Not established'}</dd></div></dl>
          {!complete ? <p className="mt-2 text-amber-900">{row.knownValuePence == null ? 'The existing stock has no confirmed total value.' : `${row.unvaluedQtyBase ?? row.qtyOnHandBase} base units have no confirmed cost.`} A displayed average or default cost does not resolve this.</p> : null}
        </article>;
      })}</div>
      {!product.inventoryBalances.length ? <p className="mt-3 text-sm text-slate-600">No stock balance is recorded for this product.</p> : null}
    </section>
    <section className="card p-4 sm:p-6">
      <h2 className="font-semibold">Sales with unconfirmed costs ({data.saleCount})</h2>
      <p className="mt-1 text-sm text-slate-600">These sale lines can make Cost of products sold and profit incomplete for the period containing them. Sales with confirmed costs are excluded.</p>
      <ul className="mt-3 divide-y divide-slate-100">{data.sales.map(row => <li key={row.id} className="py-3 text-sm">
        <Link className="inline-flex min-h-11 items-center break-all font-semibold text-accent underline" href={`/sales/${encodeURIComponent(row.salesInvoice.id)}`}>{row.salesInvoice.transactionNumber ?? row.salesInvoice.id}</Link>
        <p>{date(row.salesInvoice.createdAt)} · {row.salesInvoice.store.name} · {row.qtyBase} base units</p>
      </li>)}</ul>
      {!data.saleCount ? <p className="mt-3 text-sm text-slate-600">No unresolved sale-cost lines for this product. An existing-stock warning alone does not mean all past sales have missing costs.</p> : null}
      {pages > 1 ? <nav aria-label="Affected sale pages" className="mt-3 flex min-h-11 flex-wrap justify-between gap-3 text-sm"><span>{data.page > 1 ? <Link className="text-accent underline" href={`?page=${data.page - 1}`}>← Previous</Link> : null}</span><span>Page {data.page} of {pages}</span>{data.page < pages ? <Link className="text-accent underline" href={`?page=${data.page + 1}`}>Next →</Link> : null}</nav> : null}
    </section>
    <AccountSection id="purchase-evidence" title="Recorded purchase evidence" description="Latest 10 receipt lines for this product">
      <p className="text-sm text-slate-600">Use the source invoices to establish costs. A later purchase does not automatically establish the cost of stock already held.</p>
      {data.receipts.map(row => <article key={row.id} className="mt-3 rounded-xl border border-slate-200 p-3 text-sm">
        <Link className="inline-flex min-h-11 items-center break-all font-semibold text-accent underline" href={`/purchases/${encodeURIComponent(row.purchaseInvoice.id)}`}>{row.purchaseInvoice.transactionNumber ?? row.purchaseInvoice.id}</Link>
        <p>{date(row.purchaseInvoice.createdAt)} · {row.purchaseInvoice.store.name} · {row.purchaseInvoice.supplier?.name ?? 'No supplier recorded'}</p>
        <p className="mt-1">{row.qtyBase} base units · Net goods cost {formatMoney(row.lineSubtotalPence, business.currency)} · Capitalised extras {formatMoney(row.allocatedCostPence, business.currency)}</p>
      </article>)}
      {!data.receipts.length ? <p className="mt-3 text-sm text-slate-600">No qualifying purchase receipt is recorded for this product.</p> : null}
    </AccountSection>
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h2 className="font-semibold">What needs to be established</h2>
      <p className="mt-2">Existing stock needs a supported total value from opening records and stock movements. Affected sales need the cost at the time of sale, with any accounting correction recorded separately. Do not add the same stock quantity again or replace historical costs with today’s default just to remove a warning.</p>
      <p className="mt-2">This review makes no changes to quantities, costs or accounting entries.</p>
    </section>
  </div>;
}
