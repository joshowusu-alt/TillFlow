import BusinessMovementProductCards from '@/components/reports/BusinessMovementProductCards';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import DownloadLink from '@/components/DownloadLink';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { reportScopeLabel } from '@/lib/reports/scope-labels';
import ReportAmountCard from '@/components/reports/ReportAmountCard';
import BusinessMovementSummary from '@/components/reports/BusinessMovementSummary';
import BusinessMovementInsight from '@/components/reports/BusinessMovementInsight';
import FinancialAmount from '@/components/reports/FinancialAmount';
import { movementGapCopy, visibleMovementInsights } from '@/lib/reports/business-movement/presentation';
import EmptyState from '@/components/EmptyState';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import { formatMoney } from '@/lib/format';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { addCalendarDays } from '@/lib/entitlements/range';
import { CONSOLIDATED_LABEL } from '@/lib/entitlements/types';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { prisma } from '@/lib/prisma';
import { requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { getBusinessStores } from '@/lib/services/stores';
import { resolveMoneyReceivedAccess } from '@/lib/reports/money-received';
import {
  STOCK_AVAILABILITY_READINESS,
  buildOwnerInsightSummary,
  buildOwnerSummaryStrip,
  computeBusinessMovementWithMoneyFromDb,
  containsForbiddenStockLanguage,
  describeChangeVsComparison,
  ownerInsightCopy,
  ownerPeriodChrome,
  ownerProductMovers,
  OWNER_STOCK_DATA_NOTE,
  resolveBusinessMovementPeriodInput,
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
  singleBranchNote,
  singleCashierNote,
  type ChangePair,
  type OwnerPeriodLabels,
} from '@/lib/reports/business-movement';

export const dynamic = 'force-dynamic';

function changeHelper(pair: ChangePair, currency: string, labels: OwnerPeriodLabels, noun = 'activity'): string {
  const described = describeChangeVsComparison(pair, 'Change');
  const abs = formatMoney(Math.abs(pair.absoluteChange), currency);
  if (pair.comparison === 0 && pair.current > 0) {
    return `New in ${labels.currentFull} · ${abs}`;
  }
  if (pair.current === 0 && pair.comparison > 0) {
    return `No ${noun} in ${labels.currentFull} · was ${abs} in ${labels.comparisonFull}`;
  }
  const sign = pair.absoluteChange > 0 ? '+' : pair.absoluteChange < 0 ? '−' : '';
  if (described.usedPercentage && pair.percentageChange != null) {
    return `${sign}${abs} (${Math.abs(pair.percentageChange).toFixed(1)}%) vs ${labels.comparisonFull}`;
  }
  return `${sign}${abs} vs ${labels.comparisonFull}`;
}

export default async function BusinessMovementReportPage({
  searchParams,
}: {
  searchParams?: {
    preset?: string;
    currentFrom?: string;
    currentTo?: string;
    storeId?: string;
    businessId?: string;
  };
}) {
  const opened = await openLiveReport({
    surfaceId: 'business_movement',
    search: searchParams,
    range: ({ timezone, now, canonicalPlan }) => {
      const custom =
        searchParams?.preset === 'equal_length_custom' &&
        Boolean(searchParams.currentFrom) &&
        Boolean(searchParams.currentTo);
      if (canonicalPlan === 'STARTER' && !custom && !searchParams?.preset) {
        const today = formatBusinessLocalDateKey(now, timezone);
        return { fromLocalDate: addCalendarDays(today, -29), toLocalDate: today, preset: 'CUSTOM' };
      }
      if (custom && searchParams?.currentFrom && searchParams.currentTo) {
        const pair = resolveEqualLengthPeriodPair({
          timeZone: timezone,
          currentFromKey: searchParams.currentFrom,
          currentToKey: searchParams.currentTo,
        });
        return { fromLocalDate: pair.comparisonFromKey, toLocalDate: pair.currentToKey, preset: 'CUSTOM' };
      }
      const pair = resolveLastFullCalendarMonthPair({ timeZone: timezone, asOf: now });
      return { fromLocalDate: pair.comparisonFromKey, toLocalDate: pair.currentToKey, preset: 'CUSTOM' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business, user } = opened;
  if (opened.branch.kind !== 'stores') notFound();
  if (!business) {
    return (
      <div className="card p-6">
        <EmptyState
          icon="chart"
          title="Setup required"
          subtitle="Complete your business setup to unlock Business Movement."
          cta={{ label: 'Complete Setup', href: '/onboarding' }}
        />
      </div>
    );
  }

  const { stores } = await getBusinessStores(business.id, searchParams?.storeId);
  const access = resolveMoneyReceivedAccess({
    actor: { role: user.role, businessId: user.businessId },
    requestedBusinessId: searchParams?.businessId,
    requestedStoreId: opened.branch.selected,
    authorisedStoreIds: stores.map((s) => s.id),
  });
  if (!access.ok) {
    return (
      <div className="card p-6">
        <EmptyState
          icon="chart"
          title="Access denied"
          subtitle={
            access.reason === 'BRANCH_NOT_AUTHORISED'
              ? 'That branch is not available for your business.'
              : access.reason === 'TENANT_MISMATCH'
                ? 'You cannot open another business from this account.'
                : 'You do not have access to Business Movement.'
          }
        />
      </div>
    );
  }

  const businessTz = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: { timezone: true },
  });
  const timeZone = requireReportTimeZone(businessTz?.timezone);

  const starterDefault =
    business.canonicalPlan === 'STARTER' &&
    searchParams?.preset !== 'equal_length_custom' &&
    !searchParams?.preset;
  const periodInput = starterDefault
    ? {
        preset: 'equal_length_custom' as const,
        currentFromKey: addCalendarDays(formatBusinessLocalDateKey(new Date(), timeZone), -14),
        currentToKey: formatBusinessLocalDateKey(new Date(), timeZone),
      }
    : resolveBusinessMovementPeriodInput({
        preset: searchParams?.preset,
        currentFrom: searchParams?.currentFrom,
        currentTo: searchParams?.currentTo,
      });
  const selectedPreset =
    periodInput.preset === 'equal_length_custom'
      ? 'equal_length_custom'
      : 'last_full_calendar_month';
  const currentFromValue =
    periodInput.preset === 'equal_length_custom'
      ? periodInput.currentFromKey
      : (searchParams?.currentFrom ?? '');
  const currentToValue =
    periodInput.preset === 'equal_length_custom'
      ? periodInput.currentToKey
      : (searchParams?.currentTo ?? '');

  const result = await computeBusinessMovementWithMoneyFromDb(prisma, {
    businessId: access.businessId,
    currency: business.currency,
    timeZone,
    branchIds: opened.branch.storeIds,
    period: periodInput,
  });
  const summary = buildOwnerInsightSummary(result);
  const strip = buildOwnerSummaryStrip(result, summary.insights);
  const chrome = ownerPeriodChrome(result.scope.periods);
  const currency = business.currency;
  const selectedStoreId = access.selectedStoreId;
  const p = result.scope.periods;
  const gap = result.leakage.salesMinusMoneyReceivedCurrentPence;
  const queryFailed = result.moneyQueryFailed;
  const productMovers = ownerProductMovers(result);
  const branchNote = singleBranchNote(result.branches);
  const cashierNote = singleCashierNote(result.cashiers);

  const exportQs = new URLSearchParams({
    preset: selectedPreset,
    storeId: selectedStoreId,
  });
  if (selectedPreset === 'equal_length_custom') {
    exportQs.set('currentFrom', currentFromValue);
    exportQs.set('currentTo', currentToValue);
  }

  const moneyQs = new URLSearchParams({
    from: p.currentFromKey,
    to: p.currentToKey,
    storeId: selectedStoreId,
  });
  const momoQs = new URLSearchParams(moneyQs);

  const insightBlob = summary.insights
    .map((i) => {
      const copy = ownerInsightCopy(i, chrome);
      return `${copy.fact} ${copy.evidence} ${copy.signal} ${copy.recommendedCheck}`;
    })
    .join(' ');
  if (
    STOCK_AVAILABILITY_READINESS === 'NOT_RELIABLE' &&
    containsForbiddenStockLanguage(`${insightBlob} ${strip.paragraph} ${OWNER_STOCK_DATA_NOTE}`)
  ) {
    throw new Error('Business Movement page refused stock-causation language');
  }

  const scopeLabel = reportScopeLabel(selectedStoreId, stores);
  const insights = visibleMovementInsights(summary.insights, result);

  return (
    <div className="space-y-6">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      <ReportsDestinationHead
        title="Business movement"
        scopeLabel={scopeLabel}
        periodLabel={chrome.comparingLine}
        readingTitle="How to read this"
        reading={
          <>
            <p>
              This compares {chrome.currentFull} with {chrome.comparisonFull}. The totals below are what changed.
              The notes show which recorded products and payments contributed; they do not establish the cause.
            </p>
            <p>
              Sales, confirmed payments, refunds and Mobile Money waiting for confirmation are operational figures for the selected period.
              They are not the income statement. This report does not calculate purchases, expenses, or customer and supplier balances.
            </p>
            <p>
              Next, open Money received or MoMo to confirm when a payment needs a person, and use the product list to see what moved.
            </p>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/reports/momo-confirmation?${momoQs.toString()}`}
              className="btn-secondary justify-center text-sm"
            >
              Review MoMo confirmations
            </Link>
            <Link
              href={`/reports/money-received?${moneyQs.toString()}`}
              className="btn-secondary justify-center text-sm"
            >
              Open money received
            </Link>
            <DownloadLink
              href={`/exports/business-movement?${exportQs.toString()}`}
              fallbackFilename={`business-movement-${p.currentFromKey}-${p.currentToKey}.csv`}
              className="btn-secondary justify-center text-sm"
              disabled={queryFailed}
            >
              Export CSV
            </DownloadLink>
          </div>
        }
      />
      <BusinessMovementSummary result={result} labels={chrome} strip={strip} />

      <details className="rounded-xl border border-slate-200 bg-white px-3 py-1">
        <summary className="flex min-h-11 w-fit max-w-full cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Change period or branch</summary>
      <ReportFilterCard columnsClassName="md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Period</span>
          <select className="input w-full" name="preset" defaultValue={selectedPreset}>
            <option value="last_full_calendar_month">Last full calendar month</option>
            <option value="equal_length_custom">Custom dates (same-length comparison)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">From</span>
          <input
            className="input w-full"
            type="date"
            name="currentFrom"
            defaultValue={currentFromValue || p.currentFromKey}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">To</span>
          <input
            className="input w-full"
            type="date"
            name="currentTo"
            defaultValue={currentToValue || p.currentToKey}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Branch</span>
          <select className="input w-full" name="storeId" defaultValue={selectedStoreId}>
            {opened.branch.offerAll ? <option value="ALL">{CONSOLIDATED_LABEL}</option> : null}
            {opened.branch.choices.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      </ReportFilterCard>
      </details>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportAmountCard currency={currency}
          label="Confirmed receipts"
          pence={queryFailed ? null : result.money.moneyReceived.current}
          helper={
            queryFailed
              ? 'Confirmed receipts could not be loaded'
              : changeHelper(result.money.moneyReceived, currency, chrome)
          }
          tone="accent"
        />
        <ReportAmountCard currency={currency}
          label="Refunds"
          pence={queryFailed ? null : result.money.refundOutflows.current}
          helper={queryFailed ? 'Refund figures could not be loaded' : changeHelper(result.money.refundOutflows, currency, chrome, 'refunds')}
          tone={result.money.refundOutflows.absoluteChange > 0 ? 'warn' : 'default'}
        />
        <ReportAmountCard currency={currency}
          label="MoMo to confirm"
          pence={queryFailed ? null : result.money.needsMomoConfirmation.current}
          helper={queryFailed ? 'Pending payments could not be loaded' : changeHelper(result.money.needsMomoConfirmation, currency, chrome, 'pending MoMo payments')}
          tone={result.money.needsMomoConfirmation.current > 0 ? 'warn' : 'default'}
        />
        <ReportAmountCard currency={currency}
          label="Sales and receipts gap"
          pence={queryFailed || gap == null ? null : Math.abs(gap)}
          helper={movementGapCopy(queryFailed ? null : gap, currency)}
          tone="default"
        />
      </div>

      <p className="text-sm leading-6 text-slate-600">Refunds are shown separately here. Confirmed receipts are different from Today’s net money received.</p>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">What to look at</h2>
          <p className="text-sm text-slate-600">
            Recorded changes to review in {chrome.currentFull}.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((insight) => (
            <BusinessMovementInsight key={insight.id} insight={insight} labels={chrome} currency={currency} />
          ))}
        </div>
      </section>

      <BusinessMovementProductCards rows={productMovers} labels={chrome} currency={currency} />
      <div className="hidden lg:block">
      <ReportTableCard title="Product movers">
        <caption className="mb-2 caption-top text-left text-sm text-slate-600">
          Products that grew, dropped, appeared, or had no sales in {chrome.currentFull}.
        </caption>
        <thead>
          <tr>
            <th className="text-left">Product</th>
            <th className="text-left">What happened</th>
            <th className="text-right">{chrome.currentFull}</th>
            <th className="text-right">{chrome.comparisonFull}</th>
            <th className="text-right">Change</th>
            <th className="text-right">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {productMovers.length === 0 ? (
            <ReportTableEmptyRow
              colSpan={6}
              message={`No material product movers for ${chrome.currentFull} vs ${chrome.comparisonFull}.`}
            />
          ) : (
            productMovers.map((row) => (
              <tr key={`${row.side}-${row.productId}`}>
                <td>{row.productName}</td>
                <td>{row.side === 'New product' ? 'No sales in the earlier period' : row.side}</td>
                <td className="text-right">{formatMoney(row.currentPence, currency)}</td>
                <td className="text-right">{formatMoney(row.comparisonPence, currency)}</td>
                <td className="text-right">{row.changePence > 0 ? '+' : null}<FinancialAmount pence={row.changePence} currency={currency} variant="compact" /></td>
                <td className="text-right">{row.qtyWording}</td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>
      </div>

      {branchNote ? (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">Branches</h2>
          <p className="mt-1">{branchNote}</p>
        </section>
      ) : (
        <ReportTableCard title="Branch movement">
          <caption className="mb-2 caption-top text-left text-sm text-slate-600">
            How each branch’s sales moved compared with {chrome.comparisonFull}.
          </caption>
          <thead>
            <tr>
              <th className="text-left">Branch</th>
              <th className="text-right">{chrome.currentFull}</th>
              <th className="text-right">{chrome.comparisonFull}</th>
              <th className="text-right">Change</th>
              <th className="text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {result.branches.map((row) => (
              <tr key={row.storeId}>
                <td>{row.storeName}</td>
                <td className="text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="text-right">{row.salesValuePence.absoluteChange > 0 ? '+' : null}<FinancialAmount pence={row.salesValuePence.absoluteChange} currency={currency} variant="compact" /></td>
                <td className="text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTableCard>
      )}

      {cashierNote ? (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">Cashiers</h2>
          <p className="mt-1">{cashierNote}</p>
        </section>
      ) : (
        <ReportTableCard title="Cashier movement">
          <caption className="mb-2 caption-top text-left text-sm text-slate-600">
            How cashier-attributed sales moved compared with {chrome.comparisonFull}.
          </caption>
          <thead>
            <tr>
              <th className="text-left">Cashier</th>
              <th className="text-right">{chrome.currentFull}</th>
              <th className="text-right">{chrome.comparisonFull}</th>
              <th className="text-right">Change</th>
              <th className="text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {result.cashiers.map((row) => (
              <tr key={row.cashierUserId}>
                <td>{row.cashierName}</td>
                <td className="text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="text-right">{row.salesValuePence.absoluteChange > 0 ? '+' : null}<FinancialAmount pence={row.salesValuePence.absoluteChange} currency={currency} variant="compact" /></td>
                <td className="text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTableCard>
      )}

      <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <h2 className="text-sm font-semibold text-slate-800">Data note</h2>
        <p className="mt-1">{OWNER_STOCK_DATA_NOTE}</p>
        <p className="mt-1">
          Sales use the time the invoice was created. Money Received uses the time confirmed money
          came in. Different payment dates can cause a gap. This report does not reconcile individual sales and receipts, so the gap alone cannot confirm its cause.
        </p>
        {queryFailed ? (
          <p className="mt-2 text-amber-800">
            Money Received could not be loaded
            {result.moneyQueryError ? `: ${result.moneyQueryError}` : '.'} Sales figures above may
            still be usable.
          </p>
        ) : null}
      </section>
    </div>
  );
}
