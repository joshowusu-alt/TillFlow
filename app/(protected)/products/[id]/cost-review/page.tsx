import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import AccountSection from '@/components/people/AccountSection';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { historyPage } from '@/lib/services/product-history';
import { COST_REVIEW_PAGE_SIZE, getProductCostReview } from '@/lib/services/product-cost-review';
import { affectedSalesHref, costReviewHref, costReviewPeriod } from '@/lib/reports/cost-review-navigation';

export const dynamic = 'force-dynamic';

export default async function ProductCostReviewPage(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ page?: string; from?: string; to?: string; metric?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  const data = await getProductCostReview(business.id, params.id, historyPage(searchParams?.page));
  if (!data) notFound();
  const { product } = data;
  const date = (value: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: business.timezone, dateStyle: 'medium' }).format(value);
  const pages = Math.max(1, Math.ceil(data.saleCount / COST_REVIEW_PAGE_SIZE));
  const period = costReviewPeriod(searchParams);
  const back = affectedSalesHref(searchParams);
  const previewHref = (storeId: string) => costReviewHref(product.id, searchParams, { storeId });
  const pageHref = (page: number) => costReviewHref(product.id, searchParams, { page: String(page) });
  return <div className="min-w-0 space-y-4">
    <PageHeader title="Check product costs" subtitle={[product.name, product.publisher, product.edition].filter(Boolean).join(' · ')} secondaryCta={{ label: back ? '← Affected sales' : '← Missing-cost review', href: back ?? '/products?issue=MISSING_COST' }} />
    <p className="text-sm text-slate-700">First check the purchase records, then review the proposed correction for the relevant branch. Nothing changes until the owner confirms it.</p>
    {period ? <p className="text-sm text-slate-600">You came from a selected Income Statement period. The full available history is shown here because earlier purchases can affect those sales.</p> : null}
    <AccountSection id="purchase-evidence" title="1. Check purchase records" description="Latest 10 purchase lines for this product" defaultOpen>
      <p className="text-sm text-slate-600">Use the original purchase records. A later purchase does not establish the cost of stock already held.</p>
      {data.receipts.map(row => <article key={row.id} className="mt-3 rounded-xl border border-slate-200 p-3 text-sm">
        <Link className="inline-flex min-h-11 items-center break-all font-semibold text-accent underline" href={`/purchases/${encodeURIComponent(row.purchaseInvoice.id)}`}>{row.purchaseInvoice.transactionNumber ?? row.purchaseInvoice.id}</Link>
        <p>{date(row.purchaseInvoice.createdAt)} · {row.purchaseInvoice.store.name} · {row.purchaseInvoice.supplier?.name ?? 'No supplier recorded'}</p>
        <p className="mt-1">Quantity {row.qtyBase} (stock units) · Goods cost {formatMoney(row.lineSubtotalPence, business.currency)} · Extra costs added to stock {formatMoney(row.allocatedCostPence, business.currency)}</p>
      </article>)}
      {!data.receipts.length ? <p className="mt-3 text-sm text-amber-900">No qualifying purchase receipt is recorded. Find the original invoice or opening stock records before attempting a correction. Do not guess a cost or record the same purchase again.</p> : null}
    </AccountSection>
    <section className="card p-4 sm:p-6">
      <h2 className="font-semibold">2. Check stock value by branch</h2>
      <p className="mt-1 text-sm text-slate-600">All branches in this business. Quantities are in the product&apos;s stock unit.</p>
      <div className="mt-3 space-y-3">{product.inventoryBalances.map(row => {
        const complete = row.qtyOnHandBase === 0 || (row.qtyOnHandBase > 0 && row.knownValuePence != null && row.unvaluedQtyBase === 0);
        return <article key={row.store.id} className="rounded-xl border border-slate-200 p-3 text-sm">
          <h3 className="font-semibold">{row.store.name}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-3"><div><dt className="text-slate-600">On hand</dt><dd>{row.qtyOnHandBase.toLocaleString()}</dd></div><div><dt className="text-slate-600">Confirmed stock value</dt><dd className="font-semibold">{complete ? formatMoney(row.qtyOnHandBase === 0 ? 0 : row.knownValuePence!, business.currency) : 'Not established'}</dd></div></dl>
          {!complete ? <p className="mt-2 text-amber-900">{row.knownValuePence == null ? 'The existing stock has no confirmed total value.' : `Quantity without confirmed cost: ${row.unvaluedQtyBase ?? row.qtyOnHandBase}.`} Today's product cost does not resolve this.</p> : null}
          <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent underline" href={previewHref(row.store.id)}>{complete ? 'Review branch correction history →' : 'Review proposed branch correction →'}</Link>
        </article>;
      })}</div>
      {!product.inventoryBalances.length ? <p className="mt-3 text-sm text-slate-600">No stock balance is recorded for this product.</p> : null}
    </section>
    <section className="card p-4 sm:p-6">
      <h2 className="font-semibold">3. Check earlier sale costs ({data.saleCount} lines)</h2>
      <p className="mt-1 text-sm text-slate-600">These sale lines may make profit incomplete in the periods when they occurred. Confirmed sale costs are excluded. The branch correction preview may include both stock value and earlier sale costs.</p>
      <ul className="mt-3 divide-y divide-slate-100">{data.sales.map(row => <li key={row.id} className="py-3 text-sm">
        <Link className="inline-flex min-h-11 items-center break-all font-semibold text-accent underline" href={`/sales/${encodeURIComponent(row.salesInvoice.id)}`}>{row.salesInvoice.transactionNumber ?? row.salesInvoice.id}</Link>
        <p>{date(row.salesInvoice.createdAt)} · {row.salesInvoice.store.name} · Quantity {row.qtyBase} (stock units)</p>
        <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={previewHref(row.salesInvoice.store.id)}>Review proposed branch correction →</Link>
      </li>)}</ul>
      {!data.saleCount ? <p className="mt-3 text-sm text-slate-600">No unresolved sale-cost lines for this product. An existing-stock warning alone does not mean all past sales have missing costs.</p> : null}
      {pages > 1 ? <nav aria-label="Affected sale pages" className="mt-3 flex min-h-11 flex-wrap justify-between gap-3 text-sm"><span>{data.page > 1 ? <Link className="inline-flex min-h-11 items-center text-accent underline" href={pageHref(data.page - 1)}>← Previous</Link> : null}</span><span>Page {data.page} of {pages}</span>{data.page < pages ? <Link className="inline-flex min-h-11 items-center text-accent underline" href={pageHref(data.page + 1)}>Next →</Link> : null}</nav> : null}
    </section>
    <AccountSection id="current-cost" title="Today's product cost" description={formatMoney(product.defaultCostBasePence, business.currency) + ' per stock unit'}>
      <p className="text-sm text-slate-600">This is the catalogue cost for future product setup. It does not confirm existing stock value or earlier sale costs.</p>
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent underline" href={`/products/${encodeURIComponent(product.id)}#cost`}>Open product cost settings</Link>
    </AccountSection>
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h2 className="font-semibold">Keep the records accurate</h2>
      <p className="mt-2">Do not add stock again or use today&apos;s cost to fill in earlier costs. Use original records. This page makes no changes.</p>
    </section>
  </div>;
}
