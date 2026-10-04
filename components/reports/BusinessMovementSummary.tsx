import FinancialAmount from '@/components/reports/FinancialAmount';
import { movementDisplayText, movementPeriodNote } from '@/lib/reports/business-movement/presentation';
import type { BusinessMovementWithMoneyResult, OwnerPeriodLabels, OwnerSummaryStrip } from '@/lib/reports/business-movement';

export default function BusinessMovementSummary({ result, labels, strip }: {
  result: BusinessMovementWithMoneyResult;
  labels: OwnerPeriodLabels;
  strip: OwnerSummaryStrip;
}) {
  const periods = result.scope.periods;
  const note = movementPeriodNote(periods);
  const currency = result.scope.currency;
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5" data-testid="owner-summary-strip">
      <h2 className="font-display text-lg font-semibold text-ink">Sales comparison</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">Business-local dates · {periods.timeZone}</p>
      <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        {([
          [labels.currentFull, result.headline.salesValuePence.current, periods.currentFromKey, periods.currentToKey, note.currentDays],
          [labels.comparisonFull, result.headline.salesValuePence.comparison, periods.comparisonFromKey, periods.comparisonToKey, note.comparisonDays],
        ] as const).map(([name, amount, from, to, days], index) => (
          <div key={from} className={`min-w-0 rounded-xl p-4 ${index === 0 ? 'bg-accentSoft' : 'bg-slate-50'}`}>
            <dt className="text-sm font-semibold text-ink">{name}</dt>
            <dd className="financial-fit mt-2"><FinancialAmount pence={amount} currency={currency} variant="prominent" /></dd>
            <dd className="mt-2 text-xs leading-5 text-slate-600"><time dateTime={from}>{from}</time> to <time dateTime={to}>{to}</time> · {days} days</dd>
            <dd className="mt-1 text-sm text-ink">{index === 0 ? result.headline.transactionCount.current : result.headline.transactionCount.comparison} sales</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm leading-6 text-ink">{movementDisplayText(strip.sales, currency)}.</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{note.explanation}</p>
      {strip.biggestCheck ? <p className="mt-2 text-sm leading-6 text-ink">{movementDisplayText(strip.biggestCheck, currency)}</p> : null}
    </section>
  );
}
