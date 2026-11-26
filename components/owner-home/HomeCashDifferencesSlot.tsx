import { switchOperationalStoreAction } from '@/app/actions/operational-store';
import { getUnreviewedHomeCashDifferences, type HomeCashDifference } from '@/lib/owner-home/cash-differences';
import { formatDateTime, formatMoney } from '@/lib/format';
import { withStoreQuery } from '@/lib/reliability/selected-store';

export function HomeCashDifferencesCard({ rows, currency }: { rows: HomeCashDifference[]; currency: string }) {
  if (!rows.length) return null;
  const outstandingByCashier = new Map<string, number>();
  for (const row of rows) outstandingByCashier.set(row.cashierId, (outstandingByCashier.get(row.cashierId) ?? 0) + 1);
  const priority = [...rows].sort((a, b) => Number(b.large) - Number(a.large) || Math.abs(b.variancePence) - Math.abs(a.variancePence) || (outstandingByCashier.get(b.cashierId) ?? 0) - (outstandingByCashier.get(a.cashierId) ?? 0) || b.date.getTime() - a.date.getTime());
  const largeCount = rows.filter(row => row.large).length;
  const renderRow = (row: HomeCashDifference) => (
          <li key={row.id}>
            <form action={switchOperationalStoreAction}>
              <input type="hidden" name="storeId" value={row.storeId} />
              <input type="hidden" name="returnTo" value={withStoreQuery(`/shifts/variance/${row.id}`, row.storeId)} />
              <button type="submit" className="w-full rounded-lg py-3 text-left transition hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-ink">{row.cashier}</p>
                    <p className="mt-0.5 text-[11px] text-black/55">{formatDateTime(row.date)} · {row.storeName}</p>
                    {(outstandingByCashier.get(row.cashierId) ?? 0) > 1 && <p className="mt-1 text-xs text-black/60">{outstandingByCashier.get(row.cashierId)} outstanding reviews for this cashier</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${row.large ? 'text-rose-700' : 'text-ink'}`}>{row.variancePence > 0 ? '+' : ''}{formatMoney(row.variancePence, currency)}</p>
                    {row.large && <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">Large</span>}
                  </div>
                </div>
                <p className="mt-2 break-words text-sm text-black/70">{row.reason}</p>
                <span className="mt-1 block text-xs font-semibold text-accent">Review →</span>
              </button>
            </form>
          </li>
  );
  return (
    <section aria-label="Needs your attention" className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-sm" data-testid="home-cash-differences">
      <h2 className="text-base font-bold text-ink">Needs your attention</h2>
      <p className="mt-1 text-sm text-black/70">Cash differences to review ({rows.length}) · All dates</p>
      {largeCount > 0 && <p className="mt-1 text-sm font-semibold text-rose-800">{largeCount} large {largeCount === 1 ? 'difference' : 'differences'} to check first</p>}
      <ul className="mt-3 divide-y divide-black/10">
        {priority.slice(0, 3).map(renderRow)}
      </ul>
      {priority.length > 3 && <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-accent">View all {rows.length} cash differences</summary>
        <ul className="divide-y divide-black/10">{priority.slice(3).map(renderRow)}</ul>
      </details>}
    </section>
  );
}

export default async function HomeCashDifferencesSlot({ businessId, currency }: { businessId: string; currency: string }) {
  try {
    const rows = await getUnreviewedHomeCashDifferences(businessId);
    return <HomeCashDifferencesCard rows={rows} currency={currency} />;
  } catch (error) {
    console.error('[home.cash-differences] could not load cash differences', error);
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Cash differences could not be loaded. Open Shifts to review them.</p>;
  }
}
