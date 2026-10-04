import BusinessMovementProductCards from '@/components/reports/BusinessMovementProductCards';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import CashDrawerSummary from '@/components/reports/CashDrawerSummary';
import BusinessMovementSummary from '@/components/reports/BusinessMovementSummary';
import BusinessMovementInsight from '@/components/reports/BusinessMovementInsight';
import ReportAmountCard from '@/components/reports/ReportAmountCard';
import { buildOwnerInsightSummary } from '@/lib/reports/business-movement/insight-engine';
import { buildOwnerSummaryStrip, ownerPeriodChrome, ownerProductMovers } from '@/lib/reports/business-movement/owner-copy';
import { movementGapCopy, visibleMovementInsights } from '@/lib/reports/business-movement/presentation';
import { ownerMovementFixture } from '@/lib/reviews/reports-owner-fixtures';

export default function OwnerCorrectionReview({ screen, large = false }: { screen: 'cash' | 'movement'; large?: boolean }) {
  const amount = large ? 1_234_567_890 : 110_050;
  const result = ownerMovementFixture(large);
  const labels = ownerPeriodChrome(result.scope.periods);
  const summary = buildOwnerInsightSummary(result);
  const strip = buildOwnerSummaryStrip(result, summary.insights);
  return (
    <div className="space-y-4" data-owner-correction-review>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950" role="note">Synthetic review figures — not a customer business.</p>
      <ReportsDestinationHead title={screen === 'cash' ? 'Cash drawer' : 'Business movement'} scopeLabel="Sample Main Branch"
        periodLabel={screen === 'cash' ? '2026-09-28 to 2026-10-04 · Shifts opened in this period' : labels.comparingLine}
        actions={screen === 'cash' ? <a href="#review-content" className="btn-secondary">Open till cash ledger</a> : <>
          <a href="#review-content" className="btn-secondary">Review MoMo confirmations</a><a href="#review-content" className="btn-secondary">Open money received</a><a href="#review-content" className="btn-secondary">Export CSV</a>
        </>} />
      <div id="review-content" className="space-y-4">
        {screen === 'cash' ? <CashDrawerSummary expected={amount + 10000} counted={10000} difference={-amount} acceptedCount={3} openCount={1} page={1} currency="GHS" /> : <>
          <BusinessMovementSummary result={result} labels={labels} strip={strip} />
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <ReportAmountCard label="Confirmed receipts" pence={result.money.moneyReceived.current} currency="GHS" />
            <ReportAmountCard label="Sales and receipts gap" pence={Math.abs(result.leakage.salesMinusMoneyReceivedCurrentPence ?? 0)} currency="GHS" helper={movementGapCopy(result.leakage.salesMinusMoneyReceivedCurrentPence, 'GHS')} />
          </div>
          <BusinessMovementProductCards rows={ownerProductMovers(result)} labels={labels} currency="GHS" />
          <h2 className="font-display text-lg font-semibold text-ink">What to look at</h2>
          <div className="grid gap-3 lg:grid-cols-2">{visibleMovementInsights(summary.insights, result).map(insight => <BusinessMovementInsight key={insight.id} insight={insight} labels={labels} currency="GHS" />)}</div>
        </>}
      </div>
    </div>
  );
}
