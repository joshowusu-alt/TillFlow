import FinancialAmount from '@/components/reports/FinancialAmount';
import { movementPeriodNote } from '@/lib/reports/business-movement/presentation';
import type { BusinessMovementWithMoneyResult, OwnerPeriodLabels, OwnerSummaryStrip } from '@/lib/reports/business-movement';
import { ReportSalesHero } from '@/components/reports/stage3b/ReportPrimitives';
import { readableReportPeriod } from '@/components/reports/PeriodChips';
import { formatMoney } from '@/lib/format';

export default function BusinessMovementSummary({ result, labels }: {
  result: BusinessMovementWithMoneyResult; labels: OwnerPeriodLabels; strip: OwnerSummaryStrip;
}) {
  const periods = result.scope.periods;
  const note = movementPeriodNote(periods);
  const currency = result.scope.currency;
  const change = result.headline.salesValuePence.absoluteChange;
  const percentage = result.headline.salesValuePence.percentageChange;
  const days = (count: number) => `${count} day${count === 1 ? '' : 's'}`;
  return <section className="min-w-0" data-testid="owner-summary-strip" data-stage3b-report="movement">
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <ReportSalesHero title={`Sales · ${labels.currentFull}`} pence={result.headline.salesValuePence.current} currency={currency}
        subtitle={<p>{result.headline.transactionCount.current} sales · {days(note.currentDays)}</p>}>
        <p>{change === 0 ? 'Sales unchanged' : `Sales ${change > 0 ? 'up' : 'down'} ${formatMoney(Math.abs(change), currency)}`}{percentage != null && change !== 0 ? ` (${Math.abs(percentage).toFixed(1)}%)` : ''} compared with the earlier period.</p>
      </ReportSalesHero>
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Sales in the earlier period</h2>
        <p className="mt-2 text-sm text-slate-600">{readableReportPeriod(periods.comparisonFromKey, periods.comparisonToKey)}</p>
        <div className="financial-fit mt-2 text-ink"><FinancialAmount pence={result.headline.salesValuePence.comparison} currency={currency} variant="prominent" /></div>
        <p className="mt-2 text-sm text-ink">{result.headline.transactionCount.comparison} sales · {days(note.comparisonDays)}</p>
        <p className="mt-3 text-sm leading-5 text-slate-600">{note.explanation}</p>
      </div>
    </div>
  </section>;
}
