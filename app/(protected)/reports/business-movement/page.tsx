import Link from 'next/link';
import DownloadLink from '@/components/DownloadLink';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import { formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DEFAULT_BUSINESS_TIMEZONE } from '@/lib/notifications/utils';
import { getBusinessStores } from '@/lib/services/stores';
import { resolveMoneyReceivedAccess } from '@/lib/reports/money-received';
import {
  STOCK_AVAILABILITY_READINESS,
  buildOwnerInsightSummary,
  buildOwnerSummaryStrip,
  computeBusinessMovementWithMoneyFromDb,
  containsForbiddenStockLanguage,
  describeChangeVsComparison,
  formatSignedGhPence,
  ownerCategoryLabel,
  ownerConfidenceHint,
  ownerInsightCopy,
  ownerPeriodChrome,
  ownerProductMovers,
  OWNER_STOCK_DATA_NOTE,
  resolveBusinessMovementPeriodInput,
  singleBranchNote,
  singleCashierNote,
  type ChangePair,
  type OwnerPeriodLabels,
  type RankedBusinessMovementInsight,
} from '@/lib/reports/business-movement';

export const dynamic = 'force-dynamic';

function formatScopeInstant(value: Date, timeZone: string) {
  return value.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}

function changeHelper(pair: ChangePair, currency: string, labels: OwnerPeriodLabels): string {
  const described = describeChangeVsComparison(pair, 'Change');
  const abs = formatMoney(Math.abs(pair.absoluteChange), currency);
  if (pair.comparison === 0 && pair.current > 0) {
    return `New in ${labels.currentFull} · ${abs}`;
  }
  if (pair.current === 0 && pair.comparison > 0) {
    return `No sales in ${labels.currentFull} · was ${abs} in ${labels.comparisonFull}`;
  }
  const sign = pair.absoluteChange > 0 ? '+' : pair.absoluteChange < 0 ? '−' : '';
  if (described.usedPercentage && pair.percentageChange != null) {
    return `${sign}${abs} (${Math.abs(pair.percentageChange).toFixed(1)}%) vs ${labels.comparisonFull}`;
  }
  return `${sign}${abs} vs ${labels.comparisonFull}`;
}

function InsightCard({
  insight,
  labels,
}: {
  insight: RankedBusinessMovementInsight;
  labels: OwnerPeriodLabels;
}) {
  const confidenceHint = ownerConfidenceHint(insight.confidence);
  const copy = ownerInsightCopy(insight, labels);
  return (
    <article className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {ownerCategoryLabel(insight.category)}
        </span>
        {confidenceHint ? <span>{confidenceHint}</span> : null}
      </div>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            What changed
          </dt>
          <dd>{copy.fact}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Why it matters
          </dt>
          <dd className="text-slate-700">{copy.signal}</dd>
          <dd className="mt-1 text-xs text-slate-500">{copy.evidence}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            What to check
          </dt>
          <dd className="text-slate-700">{copy.recommendedCheck}</dd>
        </div>
      </dl>
    </article>
  );
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
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
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
    requestedStoreId: searchParams?.storeId,
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
  const timeZone = businessTz?.timezone ?? DEFAULT_BUSINESS_TIMEZONE;

  const periodInput = resolveBusinessMovementPeriodInput({
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
    branchIds: access.branchIds,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Movement"
        subtitle="What changed, in plain language."
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
              Open Money Received
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

      <div>
        <p
          className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-800"
          data-testid="comparing-line"
        >
          {chrome.comparingLine}
        </p>
        <p className="mt-1 text-xs text-slate-500" data-testid="period-audit-range">
          {chrome.currentRangeKeys} vs {chrome.comparisonRangeKeys}
        </p>
      </div>

      <section
        className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-800"
        data-testid="owner-summary-strip"
      >
        <h2 className="text-lg font-semibold text-slate-900">In short</h2>
        <p className="mt-2 leading-relaxed">{strip.paragraph}</p>
        <p className="mt-2 text-xs text-slate-500">
          {business.name} ·{' '}
          {selectedStoreId === 'ALL'
            ? 'All branches'
            : stores.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId}{' '}
          · {formatScopeInstant(p.currentStart, p.timeZone)} →{' '}
          {formatScopeInstant(new Date(p.currentEndExclusive.getTime() - 1), p.timeZone)}
        </p>
      </section>

      <ReportFilterCard columnsClassName="sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Period</span>
          <select className="input w-full" name="preset" defaultValue={selectedPreset}>
            <option value="last_full_calendar_month">Last full calendar month</option>
            <option value="equal_length_custom">Custom equal-length window</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Current from</span>
          <input
            className="input w-full"
            type="date"
            name="currentFrom"
            defaultValue={currentFromValue || p.currentFromKey}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Current to</span>
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
            <option value="ALL">All branches</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      </ReportFilterCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Sales"
          value={formatMoney(result.headline.salesValuePence.current, currency)}
          helper={changeHelper(result.headline.salesValuePence, currency, chrome)}
          tone={
            result.headline.salesValuePence.absoluteChange < 0
              ? 'danger'
              : result.headline.salesValuePence.absoluteChange > 0
                ? 'success'
                : 'default'
          }
        />
        <StatCard
          label="Money Received"
          value={formatMoney(result.money.moneyReceived.current, currency)}
          helper={
            queryFailed
              ? 'Money layer unavailable'
              : changeHelper(result.money.moneyReceived, currency, chrome)
          }
          tone="accent"
        />
        <StatCard
          label="Refunds"
          value={formatMoney(result.money.refundOutflows.current, currency)}
          helper={changeHelper(result.money.refundOutflows, currency, chrome)}
          tone={result.money.refundOutflows.absoluteChange > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="MoMo to confirm"
          value={formatMoney(result.money.needsMomoConfirmation.current, currency)}
          helper={changeHelper(result.money.needsMomoConfirmation, currency, chrome)}
          tone={result.money.needsMomoConfirmation.current > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Sales vs money in"
          value={gap == null ? '—' : formatMoney(Math.abs(gap), currency)}
          helper={
            gap == null
              ? 'Unavailable'
              : gap > 0
                ? `Sales ahead by ${formatMoney(gap, currency)} — timing, not an error`
                : gap < 0
                  ? `Money ahead by ${formatMoney(-gap, currency)} — timing, not an error`
                  : `Aligned in ${chrome.currentFull}`
          }
          tone="default"
        />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">What to look at</h2>
          <p className="text-sm text-slate-600">
            The few movements that matter most in {chrome.currentFull}.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {summary.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} labels={chrome} />
          ))}
        </div>
      </section>

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
                <td>{row.side}</td>
                <td className="text-right">{formatMoney(row.currentPence, currency)}</td>
                <td className="text-right">{formatMoney(row.comparisonPence, currency)}</td>
                <td className="text-right">{formatSignedGhPence(row.changePence)}</td>
                <td className="text-right">{row.qtyWording}</td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>

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
                <td className="text-right">{formatSignedGhPence(row.salesValuePence.absoluteChange)}</td>
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
                <td className="text-right">{formatSignedGhPence(row.salesValuePence.absoluteChange)}</td>
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
          came in. A gap is a timing check, not a balancing error.
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
