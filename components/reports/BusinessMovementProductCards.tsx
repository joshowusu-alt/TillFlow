import FinancialAmount from './FinancialAmount';
import type { OwnerPeriodLabels, OwnerProductMover } from '@/lib/reports/business-movement/owner-copy';

export default function BusinessMovementProductCards({ rows, labels, currency }: {
  rows: OwnerProductMover[]; labels: OwnerPeriodLabels; currency: string;
}) {
  return <section className="space-y-2 lg:hidden" aria-labelledby="movement-products-mobile" data-movement-product-cards>
    <h2 id="movement-products-mobile" className="font-display text-lg font-semibold text-ink">Product changes</h2>
    {rows.length === 0 ? <p className="text-sm text-slate-600">No material product changes for these periods.</p> : rows.map(row => (
      <article key={`${row.side}-${row.productId}`} className="min-w-0 border-b border-slate-200 py-2 last:border-b-0">
        <h3 className="break-words text-sm font-semibold text-ink"><a href={`/products/${encodeURIComponent(row.productId)}`} className="inline-flex min-h-11 items-center text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{row.productName}</a></h3>
        <p className="mt-1 text-xs text-slate-600">{row.side === 'New product' ? 'No sales in the earlier period' : row.side}</p>
        <dl className="mt-1 space-y-1 text-sm">
          {([
            [labels.currentFull, row.currentPence], [labels.comparisonFull, row.comparisonPence], ['Change', row.changePence],
          ] as const).map(([label, amount]) => <div key={label} className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] items-center gap-2">
            <dt className="min-w-0 break-words">{label}</dt><dd className="financial-fit"><FinancialAmount pence={amount} currency={currency} variant="compact" className="!text-base" /></dd>
          </div>)}
        </dl>
        <p className="mt-1 text-xs leading-5 text-slate-600">{row.qtyWording}</p>
      </article>
    ))}
  </section>;
}
