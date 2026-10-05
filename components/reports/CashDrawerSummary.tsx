import ReportAmountCard from '@/components/reports/ReportAmountCard';

/** Totals supplied by the existing page query, not whole-period aggregates. */
export default function CashDrawerSummary({ expected, counted, difference, acceptedCount, openCount, page, currency }: {
  expected: number; counted: number; difference: number; acceptedCount: number;
  openCount: number; page: number; currency: string;
}) {
  const hasCounts = acceptedCount > 0;
  return (
    <section className="min-w-0" aria-labelledby="cash-summary-title" data-cash-summary>
      <h2 id="cash-summary-title" className="font-display text-lg font-semibold text-ink">Closed-shift cash summary</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Page {page} · {acceptedCount} closed {acceptedCount === 1 ? 'shift' : 'shifts'} with a valid cash count. These totals cover this page, not every shift in the date range.</p>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3">
        <ReportAmountCard currency={currency} label="Cash expected" pence={hasCounts ? expected : null} unavailableLabel="No closed shifts" helper="Expected cash on these closed shifts." />
        <ReportAmountCard currency={currency} label="Cash counted" pence={hasCounts ? counted : null} unavailableLabel="No cash counts" helper="Cash counted on the same closed shifts." />
        <ReportAmountCard currency={currency} label="Cash difference" pence={hasCounts ? difference : null} unavailableLabel="Not available yet" tone={!hasCounts || difference === 0 ? 'default' : difference > 0 ? 'success' : 'danger'} helper={!hasCounts ? 'Shown after a valid cash count.' : difference < 0 ? 'Counted cash is below expected.' : difference > 0 ? 'Counted cash is above expected.' : 'Counted cash matches expected.'} />
      </div>
      {openCount > 0 ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{openCount} {openCount === 1 ? 'shift is' : 'shifts are'} still open on this page. Open shifts are excluded from all three summary figures.</p> : null}
    </section>
  );
}
