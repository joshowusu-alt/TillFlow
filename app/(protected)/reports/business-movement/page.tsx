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
  BUSINESS_MOVEMENT_MONEY_LANGUAGE,
  STOCK_AVAILABILITY_READINESS,
  buildOwnerInsightSummary,
  computeBusinessMovementWithMoneyFromDb,
  containsForbiddenStockLanguage,
  describeChangeVsComparison,
  formatSignedGhPence,
  resolveBusinessMovementPeriodInput,
  type ChangePair,
  type RankedBusinessMovementInsight,
} from '@/lib/reports/business-movement';

export const dynamic = 'force-dynamic';

const STOCK_DISCLAIMER =
  'Historical stock availability is not yet reliable. This report does not attribute sales movement to stock-outs or inventory gaps.';

function formatScopeInstant(value: Date, timeZone: string) {
  return value.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}

function changeHelper(pair: ChangePair, currency: string): string {
  const described = describeChangeVsComparison(pair, 'Change');
  const abs = formatMoney(Math.abs(pair.absoluteChange), currency);
  if (pair.comparison === 0 && pair.current > 0) return `New this period · ${abs}`;
  if (pair.current === 0 && pair.comparison > 0) return `No current sales · was ${abs}`;
  const sign = pair.absoluteChange > 0 ? '+' : pair.absoluteChange < 0 ? '−' : '';
  if (described.usedPercentage && pair.percentageChange != null) {
    return `${sign}${abs} (${Math.abs(pair.percentageChange).toFixed(1)}%) vs comparison`;
  }
  return `${sign}${abs} vs comparison`;
}

function InsightCard({ insight }: { insight: RankedBusinessMovementInsight }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {insight.category.replace(/_/g, ' ')}
        </span>
        <span>{insight.severity}</span>
        <span>confidence {insight.confidence}</span>
      </div>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fact</dt>
          <dd>{insight.fact}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</dt>
          <dd className="text-slate-700">{insight.evidence}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signal</dt>
          <dd className="text-slate-700">{insight.signal}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recommended check
          </dt>
          <dd className="text-slate-700">{insight.recommendedCheck}</dd>
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
  const currency = business.currency;
  const selectedStoreId = access.selectedStoreId;
  const p = result.scope.periods;
  const gap = result.leakage.salesMinusMoneyReceivedCurrentPence;
  const queryFailed = result.moneyQueryFailed;

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
    .map((i) => `${i.fact} ${i.evidence} ${i.signal} ${i.recommendedCheck}`)
    .join(' ');
  if (
    STOCK_AVAILABILITY_READINESS === 'NOT_RELIABLE' &&
    containsForbiddenStockLanguage(insightBlob)
  ) {
    throw new Error('Business Movement page refused stock-causation language');
  }

  const productMovers = [
    ...result.productDecliners.map((row) => ({ row, side: 'Decline' as const })),
    ...result.productGrowers.map((row) => ({ row, side: 'Growth' as const })),
  ].sort(
    (a, b) =>
      Math.abs(b.row.salesValuePence.absoluteChange) -
      Math.abs(a.row.salesValuePence.absoluteChange),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Movement"
        subtitle="What changed this month vs last — facts first."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/reports/money-received?${moneyQs.toString()}`}
              className="btn-secondary justify-center text-sm"
            >
              Money Received
            </Link>
            <Link
              href={`/reports/momo-confirmation?${momoQs.toString()}`}
              className="btn-secondary justify-center text-sm"
            >
              MoMo Confirmation
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

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Stock limitation</p>
        <p className="mt-1">{STOCK_DISCLAIMER}</p>
        <p className="mt-1 text-xs text-amber-900/80">
          Readiness: {STOCK_AVAILABILITY_READINESS}. Days-unavailable history is not claimed on this
          report.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p>
          {business.name} ·{' '}
          {selectedStoreId === 'ALL'
            ? 'All branches'
            : stores.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId}
        </p>
        <p className="mt-1">
          Current: {p.currentFromKey} → {p.currentToKey} (
          {formatScopeInstant(p.currentStart, p.timeZone)} →{' '}
          {formatScopeInstant(new Date(p.currentEndExclusive.getTime() - 1), p.timeZone)})
        </p>
        <p className="mt-1">
          Comparison: {p.comparisonFromKey} → {p.comparisonToKey} (
          {formatScopeInstant(p.comparisonStart, p.timeZone)} →{' '}
          {formatScopeInstant(new Date(p.comparisonEndExclusive.getTime() - 1), p.timeZone)})
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {BUSINESS_MOVEMENT_MONEY_LANGUAGE.salesVsMoney} Timezone {p.timeZone}.
        </p>
      </div>

      <ReportFilterCard columnsClassName="sm:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Period</span>
          <select
            className="input w-full"
            name="preset"
            defaultValue={selectedPreset}
          >
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
          helper={changeHelper(result.headline.salesValuePence, currency)}
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
              : changeHelper(result.money.moneyReceived, currency)
          }
          tone="accent"
        />
        <StatCard
          label="Refund outflows"
          value={formatMoney(result.money.refundOutflows.current, currency)}
          helper={changeHelper(result.money.refundOutflows, currency)}
          tone={result.money.refundOutflows.absoluteChange > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Needs MoMo confirmation"
          value={formatMoney(result.money.needsMomoConfirmation.current, currency)}
          helper={changeHelper(result.money.needsMomoConfirmation, currency)}
          tone={result.money.needsMomoConfirmation.current > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Sales vs Money Received gap"
          value={gap == null ? '—' : formatMoney(Math.abs(gap), currency)}
          helper={
            gap == null
              ? 'Unavailable'
              : gap > 0
                ? `Sales ahead by ${formatMoney(gap, currency)} — timing/quality indicator`
                : gap < 0
                  ? `Money ahead by ${formatMoney(-gap, currency)} — timing/quality indicator`
                  : 'Aligned this period'
          }
          tone="default"
        />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Owner summary</h2>
          <p className="text-sm text-slate-600">
            {summary.headline} Deterministic ranking — not AI advice.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {summary.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      </section>

      <ReportTableCard title="Product movers">
        <caption className="mb-2 caption-top text-left text-sm text-slate-600">
          Largest growers and decliners by invoice line sales (createdAt).
        </caption>
        <thead>
          <tr>
            <th className="text-left">Product</th>
            <th className="text-left">Side</th>
            <th className="text-right">Current</th>
            <th className="text-right">Comparison</th>
            <th className="text-right">Change</th>
            <th className="text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {productMovers.length === 0 ? (
            <ReportTableEmptyRow colSpan={6} message="No material product movers for this period pair." />
          ) : (
            productMovers.map(({ row, side }) => (
              <tr key={`${side}-${row.productId}`}>
                <td>
                  {row.productName}
                  {row.kind !== 'continuing' ? (
                    <span className="ml-1 text-xs text-slate-500">({row.kind.replace(/_/g, ' ')})</span>
                  ) : null}
                </td>
                <td>{side}</td>
                <td className="text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="text-right">
                  {formatSignedGhPence(row.salesValuePence.absoluteChange)}
                </td>
                <td className="text-right">
                  {row.qtyBase.current} / {row.qtyBase.comparison}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>

      <ReportTableCard title="Branch movement">
        <caption className="mb-2 caption-top text-left text-sm text-slate-600">
          Invoice sales by store for the current vs comparison windows.
        </caption>
        <thead>
          <tr>
            <th className="text-left">Branch</th>
            <th className="text-right">Current</th>
            <th className="text-right">Comparison</th>
            <th className="text-right">Change</th>
            <th className="text-right">Transactions</th>
          </tr>
        </thead>
        <tbody>
          {result.branches.length === 0 ? (
            <ReportTableEmptyRow colSpan={5} message="No branch sales in either period." />
          ) : (
            result.branches.map((row) => (
              <tr key={row.storeId}>
                <td>{row.storeName}</td>
                <td className="text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="text-right">
                  {formatSignedGhPence(row.salesValuePence.absoluteChange)}
                </td>
                <td className="text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>

      <ReportTableCard title="Cashier movement">
        <caption className="mb-2 caption-top text-left text-sm text-slate-600">
          Attributed via SalesInvoice.cashierUserId (schema-required; shown when rows exist).
        </caption>
        <thead>
          <tr>
            <th className="text-left">Cashier</th>
            <th className="text-right">Current</th>
            <th className="text-right">Comparison</th>
            <th className="text-right">Change</th>
            <th className="text-right">Transactions</th>
          </tr>
        </thead>
        <tbody>
          {result.cashiers.length === 0 ? (
            <ReportTableEmptyRow colSpan={5} message="No cashier-attributed sales in either period." />
          ) : (
            result.cashiers.map((row) => (
              <tr key={row.cashierUserId}>
                <td>{row.cashierName}</td>
                <td className="text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="text-right">
                  {formatSignedGhPence(row.salesValuePence.absoluteChange)}
                </td>
                <td className="text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>

      <section className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
        <h2 className="text-lg font-semibold text-slate-900">Leakage / quality notes</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {result.leakage.languageNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {queryFailed ? (
          <p className="mt-3 text-amber-800">
            Money Received layer query failed
            {result.moneyQueryError ? `: ${result.moneyQueryError}` : '.'} Sales movement above may
            still be usable.
          </p>
        ) : null}
      </section>
    </div>
  );
}
