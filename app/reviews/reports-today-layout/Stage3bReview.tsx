import AnalyticsClient from '@/app/(protected)/reports/analytics/AnalyticsClient';
import AnalyticsPeriodSelector from '@/app/(protected)/reports/analytics/AnalyticsPeriodSelector';
import ReportHeader from '@/components/reports/stage3b/ReportHeader';
import TradingReportView from '@/components/reports/stage3b/TradingReportView';
import BusinessMovementReportView from '@/components/reports/stage3b/BusinessMovementReportView';
import { ownerMovementFixture } from '@/lib/reviews/reports-owner-fixtures';
import { stage3bAnalyticsFixture, stage3bTradingFixture, type Stage3bFixture } from '@/lib/reviews/reports-stage3b-fixtures';
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import { returnPathFor } from '@/lib/reports/today/stage3a-nav';
import ReportFilterDisclosure from '@/components/reports/ReportFilterDisclosure';

export default function Stage3bReview({ screen, fixture }: { screen: 'trading' | 'analytics' | 'movement'; fixture: Stage3bFixture }) {
  const route = screen === 'trading' ? '/reports/dashboard' : screen === 'analytics' ? '/reports/analytics' : '/reports/business-movement';
  const path = returnPathFor(route)!;
  let movement = ownerMovementFixture(fixture === 'large', fixture === 'empty');
  if (fixture === 'failed') movement = { ...movement, moneyQueryFailed: true, moneyQueryError: 'Sample unavailable' };
  return <div className="space-y-4" data-stage3b-review data-reports-focus-scope>
    <p role="note" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Synthetic review figures — not a customer business.</p>
    <ReportsReturnPath path={path} storeId="sample-branch" />
    {screen === 'movement' ? <BusinessMovementReportView result={movement} scopeLabel="Sample Main Branch" choices={[{ id: 'sample-branch', name: 'Sample Main Branch' }]} offerAll={false} selectedStoreId="sample-branch" selectedPreset="last_full_calendar_month" currentFromValue="2026-09-01" currentToValue="2026-09-30" exportQuery="preset=last_full_calendar_month&storeId=sample-branch" moneyQuery="from=2026-09-01&to=2026-09-30&storeId=sample-branch" /> : <>
      <ReportHeader title={screen === 'trading' ? 'Trading' : 'Sales analytics'} scopeLabel="Sample Main Branch" periodLabel={screen === 'trading' ? '2026-09-01 to 2026-09-30 · Africa/Accra' : '7 days, including today · Africa/Accra'} />
      {screen === 'trading' ? <><ReportFilterDisclosure><form method="GET" className="space-y-3"><label className="block text-sm" htmlFor="stage3b-from">From<input id="stage3b-from" name="from" type="date" className="input mt-1" defaultValue="2026-09-01" /></label><button type="submit" className="btn-primary">Apply filters</button></form></ReportFilterDisclosure><TradingReportView data={stage3bTradingFixture(fixture)} /></> : <><AnalyticsPeriodSelector /><AnalyticsClient data={stage3bAnalyticsFixture(fixture)} /></>}
    </>}
  </div>;
}
