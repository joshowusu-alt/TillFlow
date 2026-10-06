import FinancialAmount from '@/components/reports/FinancialAmount';
import { movementDisplayText, movementPeriodNote } from '@/lib/reports/business-movement/presentation';
import type { BusinessMovementWithMoneyResult, OwnerPeriodLabels, OwnerSummaryStrip } from '@/lib/reports/business-movement';
import { ReportSalesHero } from '@/components/reports/stage3b/ReportPrimitives';

export default function BusinessMovementSummary({ result, labels, strip }: {
  result: BusinessMovementWithMoneyResult; labels: OwnerPeriodLabels; strip: OwnerSummaryStrip;
}) {
  const periods = result.scope.periods;
  const note = movementPeriodNote(periods);
  const currency = result.scope.currency;
  return <section className="min-w-0" data-testid="owner-summary-strip" data-stage3b-report="movement">
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <ReportSalesHero title={`Sales · ${labels.currentFull}`} pence={result.headline.salesValuePence.current} currency={currency}
        subtitle={<><p>{result.headline.transactionCount.current} sales · {note.currentDays} days</p><p className="mt-1"><time dateTime={periods.currentFromKey}>{periods.currentFromKey}</time> to <time dateTime={periods.currentToKey}>{periods.currentToKey}</time></p></>}>
        <p>{movementDisplayText(strip.sales, currency)}.</p>
      </ReportSalesHero>
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Sales comparison</h2>
        <p className="mt-2 text-sm text-slate-600">{labels.comparisonFull}</p>
        <div className="financial-fit mt-2 text-ink"><FinancialAmount pence={result.headline.salesValuePence.comparison} currency={currency} variant="prominent" /></div>
        <p className="mt-2 text-sm text-ink">{result.headline.transactionCount.comparison} sales · {note.comparisonDays} days</p>
        <p className="mt-1 text-xs leading-5 text-slate-600"><time dateTime={periods.comparisonFromKey}>{periods.comparisonFromKey}</time> to <time dateTime={periods.comparisonToKey}>{periods.comparisonToKey}</time></p>
        <p className="mt-3 text-sm leading-5 text-slate-600">{note.explanation}</p>
        <p className="mt-2 text-xs text-slate-600">Business-local dates · {periods.timeZone}</p>
      </div>
    </div>
    {strip.biggestCheck ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">{movementDisplayText(strip.biggestCheck, currency)}</p> : null}
  </section>;
}
