import FinancialAmount from '@/components/reports/FinancialAmount';
import { movementPeriodNote } from '@/lib/reports/business-movement/presentation';
import type { BusinessMovementWithMoneyResult, OwnerPeriodLabels, OwnerSummaryStrip } from '@/lib/reports/business-movement';
import type { ReactNode } from 'react';
import ReportSummaryCard from '@/components/reports/ReportSummaryCard';
import { readableReportPeriod } from '@/components/reports/PeriodChips';
import { formatMoney } from '@/lib/format';

export default function BusinessMovementSummary({ result, labels, children }: {
  result: BusinessMovementWithMoneyResult; labels: OwnerPeriodLabels; strip: OwnerSummaryStrip; children?: ReactNode;
}) {
  const periods = result.scope.periods;
  const note = movementPeriodNote(periods);
  const currency = result.scope.currency;
  const change = result.headline.salesValuePence.absoluteChange;
  const percentage = result.headline.salesValuePence.percentageChange;
  const days = (count: number) => `${count} day${count === 1 ? '' : 's'}`;
  return <section className="min-w-0" data-testid="owner-summary-strip" data-stage3b-report="movement">
    <ReportSummaryCard spacingClassName="min-w-0 space-y-3 !p-4 sm:!p-6">
      <h2 className="text-base font-semibold text-ink">Sales and money movement</h2>
      <div className="grid min-w-0 grid-cols-2 gap-3 text-xs text-slate-600">
        <div><p className="font-semibold text-ink">Current</p>{labels.currentFull} · {days(note.currentDays)}</div>
        <div className="text-right"><p className="font-semibold text-ink">Earlier</p>{readableReportPeriod(periods.comparisonFromKey, periods.comparisonToKey)} · {days(note.comparisonDays)}</div>
      </div>
      <section className="space-y-1 border-t border-black/10 pt-2" data-movement-sales>
        <h3 className="font-semibold text-ink">Sales</h3>
        <div className="grid min-w-0 grid-cols-2 gap-2 font-semibold tabular-nums">
          <div className="min-w-0 [overflow-wrap:anywhere]" data-stage3b-hero data-first-figure=""><FinancialAmount pence={result.headline.salesValuePence.current} currency={currency} variant="compact" className="!text-base !whitespace-normal" /></div>
          <div className="min-w-0 text-right [overflow-wrap:anywhere]"><FinancialAmount pence={result.headline.salesValuePence.comparison} currency={currency} variant="compact" className="!text-base !whitespace-normal" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600"><span>{result.headline.transactionCount.current} sales</span><span className="text-right">{result.headline.transactionCount.comparison} sales</span></div>
        <p className={`text-sm font-semibold ${change < 0 ? 'text-rose-700' : change > 0 ? 'text-emerald-700' : 'text-slate-600'}`}>{change === 0 ? 'Sales unchanged' : `Sales ${change > 0 ? 'up' : 'down'} ${formatMoney(Math.abs(change), currency)}`}{percentage != null && change !== 0 ? ` (${Math.abs(percentage).toFixed(1)}%)` : ''}</p>
      </section>
      {children}
      <p className="text-xs leading-5 text-slate-600">{note.explanation}</p>
    </ReportSummaryCard>
  </section>;
}
