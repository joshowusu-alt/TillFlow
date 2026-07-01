import { Suspense } from 'react';
import RefreshIndicator from '@/components/RefreshIndicator';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportSectionSkeleton from '@/components/reports/ReportSectionSkeleton';
import { requireBusiness } from '@/lib/auth';
import { recordOwnerDashboardView, recordOwnerReportView } from '@/app/actions/activation';
import { getBusinessStores } from '@/lib/services/stores';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import TradingDashboardContent from './TradingDashboardContent';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string };
}) {
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  if (user.role === 'OWNER') {
    await Promise.all([recordOwnerDashboardView(), recordOwnerReportView()]);
  }
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  const { stores, selectedStoreId: rawStoreId } = await getBusinessStores(
    business.id,
    searchParams?.storeId,
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const defaultRangeStart = new Date(todayStart);
  defaultRangeStart.setDate(defaultRangeStart.getDate() - 6);

  const { start, end, fromInputValue: fromIso, toInputValue: toIso } = resolveReportDateRange(
    searchParams,
    defaultRangeStart,
    todayEnd,
  );

  const selectedStoreId = rawStoreId ?? 'ALL';
  const isToday =
    start.toDateString() === todayStart.toDateString() &&
    end.toDateString() === todayEnd.toDateString();
  const hasNonDefaultParams = !!(
    searchParams?.from ||
    searchParams?.to ||
    (searchParams?.storeId && searchParams?.storeId !== 'ALL')
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Trading Report</p>
          <h1 className="mt-1 text-xl font-display font-bold tracking-tight text-ink sm:text-2xl">
            {business.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isToday ? 'Today (live)' : `${fromIso} to ${toIso}`}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <a href="/reports/weekly-digest" className="btn-secondary justify-center text-sm">
            Weekly Digest
          </a>
          <RefreshIndicator fetchedAt={new Date().toISOString()} autoRefreshMs={120_000} />
        </div>
      </div>

      <details className="details-mobile" open={hasNonDefaultParams}>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="text-sm font-semibold text-ink">Adjust date range / branch</span>
          <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="mt-2 space-y-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <p>
              Figures use the selected period and branch where supported. Sales and receipts may differ
              because customer credit can be paid later.
            </p>
            <p className="mt-1">
              Customer and supplier balances show the current position, not only this period. Gross profit
              uses sale-line cost snapshots.
            </p>
          </div>
          <ReportFilterCard
            columnsClassName={stores.length > 1 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}
            submitLabel="Apply filters"
            submitTone="primary"
            actions={
              <a href="/reports/dashboard" className="btn-secondary w-full justify-center text-sm sm:w-auto">
                Reset
              </a>
            }
          >
            <div>
              <label className="label">From</label>
              <input className="input" type="date" name="from" defaultValue={fromIso} />
            </div>
            <div>
              <label className="label">To</label>
              <input className="input" type="date" name="to" defaultValue={toIso} />
            </div>
            {stores.length > 1 ? (
              <div>
                <label className="label">Branch</label>
                <select className="input" name="storeId" defaultValue={selectedStoreId}>
                  <option value="ALL">All branches</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="storeId" value={selectedStoreId} />
            )}
          </ReportFilterCard>
        </div>
      </details>

      <Suspense fallback={<ReportSectionSkeleton />}>
        <TradingDashboardContent
          businessId={business.id}
          businessName={business.name}
          currency={business.currency}
          userId={user.id}
          userName={user.name}
          userEmail={user.email}
          selectedStoreId={selectedStoreId}
          fromIso={fromIso}
          toIso={toIso}
          startIso={start.toISOString()}
          endIso={end.toISOString()}
          isToday={isToday}
        />
      </Suspense>
    </div>
  );
}
