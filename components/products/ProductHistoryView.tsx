import Link from 'next/link';
import AccountSection from '@/components/people/AccountSection';
import { formatMoney } from '@/lib/format';
import { PRODUCT_HISTORY_PAGE_SIZE, type getProductHistory } from '@/lib/services/product-history';

type History = NonNullable<Awaited<ReturnType<typeof getProductHistory>>>;
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('en-GB')}`;
export default function ProductHistoryView({ data, currency, timeZone, from = '', to = '' }: { data: History; currency: string; timeZone: string; from?: string; to?: string }) {
  const date = (value: Date) => new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(value);
  const unit = data.product.productUnits[0]?.unit.name ?? 'base unit';
  const href = (page: number, receiptsPage: number, anchor: string) => `?${new URLSearchParams({ from, to, page: String(page), receiptsPage: String(receiptsPage) })}#${anchor}`;
  const pages = (kind: 'movements' | 'supplier-costs', page: number, count: number) => <nav aria-label={`${kind === 'movements' ? 'Stock movement' : 'Supplier receipt'} pages`} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
    {page > 1 ? <Link className="btn-secondary" href={href(kind === 'movements' ? page - 1 : data.page, kind === 'supplier-costs' ? page - 1 : data.receiptsPage, kind)}>Previous</Link> : <span />}
    <span>Page {page} of {Math.max(1, Math.ceil(count / PRODUCT_HISTORY_PAGE_SIZE))} · {count.toLocaleString()} records</span>
    {page * PRODUCT_HISTORY_PAGE_SIZE < count ? <Link className="btn-secondary" href={href(kind === 'movements' ? page + 1 : data.page, kind === 'supplier-costs' ? page + 1 : data.receiptsPage, kind)}>Next</Link> : null}
  </nav>;
  return <div className="min-w-0 space-y-5" data-product-history-store={data.store.id} data-product-history-product={data.product.id} data-history-current-quantity={data.currentQty} data-history-recorded-quantity={data.recordedMovementQty}>
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Current quantity reconciliation">
      {[['Current stock', data.currentQty], ['All recorded stock movements', data.recordedMovementQty], ['Difference to investigate', data.reconciliationDifference]].map(([label, value]) => <div key={label} className="card min-w-0 p-4"><h2 className="text-sm text-slate-600">{label}</h2><p className="mt-2 break-words text-2xl font-semibold tabular-nums">{Number(value).toLocaleString('en-GB')}</p><p className="mt-1 text-xs text-slate-600">{unit} · {data.store.name} · all dates</p></div>)}
    </section>
    <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{data.reconciliationDifference === 0 ? 'The recorded movement total matches the current quantity. This arithmetic check does not certify the physical count or historical records.' : 'Current stock differs from the sum of recorded movements. Earlier opening stock or other missing records may explain the difference; no adjustment has been created.'} Date filters below do not change these current-stock figures.</p>
    <form className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" aria-label="Product history dates">
      <label className="text-sm">From<input className="input mt-1 w-full" type="date" name="from" defaultValue={from} /></label>
      <label className="text-sm">To<input className="input mt-1 w-full" type="date" name="to" defaultValue={to} /></label>
      <button className="btn-primary" type="submit">Apply dates</button><Link className="btn-secondary" href={`/products/${encodeURIComponent(data.product.id)}/history`}>All dates</Link>
    </form>
    <section id="movements" className="card min-w-0 scroll-mt-24 p-4 sm:p-6">
      <h2 className="font-display text-lg font-semibold">Stock movements</h2>
      <p className="mt-1 text-sm text-slate-600">Recorded in {data.store.name}. Quantities use {unit}. Stock value is recorded cost, not sales revenue. Unverified costs and missing before/after quantities stay unavailable.</p>
      <div className="mt-4 space-y-3 lg:hidden">{data.movements.map(row => <article key={row.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{row.label}</h3><span className="font-semibold tabular-nums">{signed(row.qtyBase)} {unit}</span></div>
        <p className="mt-1 text-sm text-slate-600">{date(row.createdAt)} · {row.user?.name ?? 'Actor not recorded'}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-600">Before → after</dt><dd>{row.beforeQtyBase ?? '—'} → {row.afterQtyBase ?? '—'}</dd></div><div><dt className="text-slate-600">Recorded stock value</dt><dd>{row.verifiedValuePence == null ? 'Unverified / unavailable' : formatMoney(row.verifiedValuePence, currency)}</dd></div></dl>
        <div className="mt-3 break-words text-sm">{row.source.href ? <Link className="font-semibold text-accent underline" href={row.source.href}>{row.source.label}</Link> : <span>{row.source.label}</span>}{row.source.detail ? <p className="mt-1 text-slate-600">{row.source.detail}</p> : null}</div>
      </article>)}</div>
      <div className="responsive-table-shell mt-4 hidden lg:block"><table className="table w-full min-w-[60rem]"><thead><tr><th>Date</th><th>Movement / actor</th><th className="!text-right">Quantity</th><th className="!text-right">Before → after</th><th className="!text-right">Recorded stock value</th><th>Source record</th></tr></thead><tbody>{data.movements.map(row => <tr key={row.id}>
        <td>{date(row.createdAt)}</td><td>{row.label}<p className="mt-1 text-xs text-slate-600">{row.user?.name ?? 'Actor not recorded'}</p></td><td className="text-right tabular-nums">{signed(row.qtyBase)}</td><td className="text-right tabular-nums">{row.beforeQtyBase ?? '—'} → {row.afterQtyBase ?? '—'}</td><td className="text-right tabular-nums">{row.verifiedValuePence == null ? 'Unverified / unavailable' : formatMoney(row.verifiedValuePence, currency)}</td><td className="max-w-xs break-words">{row.source.href ? <Link className="font-semibold text-accent underline" href={row.source.href}>{row.source.label}</Link> : row.source.label}{row.source.detail ? <p className="mt-1 text-xs text-slate-600">{row.source.detail}</p> : null}</td>
      </tr>)}</tbody></table></div>
      {!data.movements.length ? <p className="py-6 text-sm text-slate-600">No recorded stock movements in this selection.</p> : null}
      {pages('movements', data.page, data.movementCount)}
    </section>
    <AccountSection id="supplier-costs" title="Supplier receipt cost history" description={`${data.receiptCount} matching receipt lines · compare recorded purchase costs`}>
      <p className="text-sm text-slate-600">These are actual purchase-invoice suppliers, independent of today’s preferred supplier. The quoted unit cost is before discounts; net goods cost includes purchase discounts and excludes tax. Capitalised extras are shown separately. Returned / voided purchases remain labelled as historical receipts. This is not an amount owed or a supplier settlement.</p>
      <div className="mt-4 space-y-3">{data.receipts.map(row => <article key={row.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{row.purchaseInvoice.supplier?.name ?? 'No supplier recorded'}</h3><span className="text-xs text-slate-600">{row.purchaseInvoice.paymentStatus.replace(/_/g, ' ')}</span></div>
        <p className="mt-1 text-sm text-slate-600">{date(row.purchaseInvoice.createdAt)} · {row.qtyBase.toLocaleString()} {unit}</p>
        <Link className="mt-2 inline-block break-all text-sm font-semibold text-accent underline" href={`/purchases/${encodeURIComponent(row.purchaseInvoice.id)}`}>{row.purchaseInvoice.transactionNumber ?? row.purchaseInvoice.id}</Link>
        {row.purchaseInvoice.supplierInvoiceNumber ? <p className="mt-1 break-words text-xs text-slate-600">Supplier reference: {row.purchaseInvoice.supplierInvoiceNumber}</p> : null}
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-slate-600">Quoted cost per {row.unit.name}</dt><dd className="font-semibold tabular-nums">{formatMoney(row.unitCostPence, currency)}</dd></div><div><dt className="text-slate-600">Net goods cost ({row.qtyBase.toLocaleString()} {unit})</dt><dd className="font-semibold tabular-nums">{formatMoney(row.lineSubtotalPence, currency)}</dd></div><div><dt className="text-slate-600">Capitalised extras</dt><dd className="font-semibold tabular-nums">{formatMoney(row.allocatedCostPence, currency)}</dd></div></dl>
      </article>)}</div>
      {!data.receipts.length ? <p className="py-6 text-sm text-slate-600">No supplier receipt lines in this selection.</p> : null}
      {pages('supplier-costs', data.receiptsPage, data.receiptCount)}
    </AccountSection>
  </div>;
}
