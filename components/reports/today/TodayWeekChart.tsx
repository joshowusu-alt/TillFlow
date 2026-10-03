import FinancialAmount from '@/components/reports/FinancialAmount';
import type { TodaySnapshot } from '@/lib/reports/today/model';

/** Scale only: the chart consumes the same recorded daily sales as Today. */
export default function TodayWeekChart({ days, currency }: { days: TodaySnapshot['days']; currency: string }) {
  const hasSales = days.some((day) => day.salesPence !== 0);
  const positivePeak = Math.max(0, ...days.map((day) => day.salesPence));
  const negativePeak = Math.max(0, ...days.map((day) => -day.salesPence));
  const range = positivePeak + negativePeak || 1;
  const baseline = (positivePeak / range) * 100;
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card" aria-labelledby="today-week-title" data-today-week>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="today-week-title" className="font-display text-lg font-semibold text-ink">Sales over the last seven days</h3>
        <span className="text-xs text-muted">{currency}</span>
      </div>
      {hasSales ? (
        <>
          <div className="today-week-chart mt-5" aria-hidden="true" data-week-chart>
            <div className="today-week-chart__baseline" style={{ top: `${baseline}%` }} />
            <div className="today-week-chart__columns" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((day, index) => (
                <div key={day.key} className="today-week-chart__column">
                  <span className={`today-week-chart__bar ${index === days.length - 1 ? 'today-week-chart__bar--today' : ''}`}
                    style={{ top: `${day.salesPence >= 0 ? baseline - (day.salesPence / range) * 100 : baseline}%`, height: `${Math.abs(day.salesPence / range) * 100}%` }} />
                  <span className="today-week-chart__label">{day.label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-10 text-xs leading-5 text-muted">Today is still in progress. Earlier dates show full days.</p>
          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">View daily sales figures</summary>
            <table className="mt-2 w-full text-sm" aria-label="Daily sales over the last seven days">
              <thead><tr className="border-b border-slate-200"><th scope="col" className="py-2 text-left">Date</th><th scope="col" className="py-2 text-right">Sales</th></tr></thead>
              <tbody>{days.map((day, index) => (
                <tr key={day.key} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-3 text-left font-normal text-ink"><time dateTime={day.key}>{day.key}</time>{index === days.length - 1 ? <span className="block text-xs text-muted">Today so far</span> : null}</th>
                  <td className="py-3 text-right"><FinancialAmount pence={day.salesPence} currency={currency} variant="compact" /></td>
                </tr>
              ))}</tbody>
            </table>
          </details>
        </>
      ) : <p className="mt-3 text-sm text-muted">No sales in the last seven dates.</p>}
    </section>
  );
}
