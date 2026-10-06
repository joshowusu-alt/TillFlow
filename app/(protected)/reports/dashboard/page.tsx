import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportFilterDisclosure from '@/components/reports/ReportFilterDisclosure';
import ReportHeader from '@/components/reports/stage3b/ReportHeader';
import { reportScopeLabel } from '@/lib/reports/scope-labels';
import ReportSectionSkeleton from '@/components/reports/ReportSectionSkeleton';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { CONSOLIDATED_LABEL } from '@/lib/entitlements/types';
import { recordOwnerDashboardView, recordOwnerReportView } from '@/app/actions/activation';
import { getBusinessStores } from '@/lib/services/stores';
import {
  isReportingScopeStoreError,
  isReportingScopeToday,
  resolveReportingScope,
} from '@/lib/reports/reporting-scope';
import TradingDashboardContent from './TradingDashboardContent';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string; period?: string };
}) {
  const opened = await openLiveReport({
    surfaceId: 'trading_report',
    search: searchParams,
  });
  if (!opened.ok) return opened.denial;
  const { business, user } = opened;
  if (opened.branch.kind !== 'stores') notFound();
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

  const { stores } = await getBusinessStores(business.id, searchParams?.storeId);

  let scope;
  try {
    scope = resolveReportingScope({
      businessId: business.id,
      timeZone: (business as { timezone?: string | null }).timezone,
      params: {
        period: searchParams?.period,
        from: searchParams?.from,
        to: searchParams?.to,
        storeId: opened.branch.selected,
      },
      defaultPeriod: '7d',
      allowedStoreIds: stores.map((store) => store.id),
    });
  } catch (error) {
    if (isReportingScopeStoreError(error)) notFound();
    throw error;
  }

  const selectedStoreId = scope.storeId;
  const isToday = isReportingScopeToday(scope);

  const scopeLabel = reportScopeLabel(selectedStoreId, stores);

  return (
    <div className="space-y-4 sm:space-y-5">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      <ReportHeader
        title="Trading"
        scopeLabel={scopeLabel}
        periodLabel={isToday
          ? `Today (live) · ${scope.timeZone}`
          : `${scope.fromInputValue} to ${scope.toInputValue} · ${scope.timeZone}`}
      />

      <ReportFilterDisclosure>
        <div className="mt-2 space-y-2">
          <ReportFilterCard
            columnsClassName={'md:grid-cols-2 xl:grid-cols-4'}
            submitLabel="Apply filters"
            submitTone="primary"
            actions={
              <a href="/reports/dashboard" className="btn-secondary w-full justify-center text-sm sm:w-auto">
                Reset
              </a>
            }
          >
            <div>
              <label className="label" htmlFor="trading-period">Quick period</label>
              <select className="input" id="trading-period" name="period" defaultValue={scope.periodKey}>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="custom">Custom dates</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="trading-from">From</label>
              <input className="input" type="date" id="trading-from" name="from" defaultValue={scope.fromInputValue} />
            </div>
            <div>
              <label className="label" htmlFor="trading-to">To</label>
              <input className="input" type="date" id="trading-to" name="to" defaultValue={scope.toInputValue} />
            </div>
            {opened.branch.choices.length > 1 || opened.branch.offerAll ? (
              <div>
                <label className="label" htmlFor="trading-storeId">Report branch filter</label>
                <select className="input" id="trading-storeId" name="storeId" defaultValue={selectedStoreId}>
                  {opened.branch.offerAll ? <option value="ALL">{CONSOLIDATED_LABEL}</option> : null}
                  {opened.branch.choices.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" id="trading-storeId" name="storeId" value={selectedStoreId} />
            )}
          </ReportFilterCard>
        </div>
      </ReportFilterDisclosure>

      <Suspense fallback={<ReportSectionSkeleton />}>
        <TradingDashboardContent
          businessId={business.id}
          businessName={business.name}
          currency={business.currency}
          timeZone={scope.timeZone}
          userId={user.id}
          userName={user.name}
          userEmail={user.email}
          selectedStoreId={selectedStoreId}
          fromIso={scope.fromInputValue}
          toIso={scope.toInputValue}
          periodKey={scope.periodKey}
          startIso={scope.startInclusive.toISOString()}
          endIso={scope.endExclusive.toISOString()}
          isToday={isToday}
        />
      </Suspense>
    </div>
  );
}
