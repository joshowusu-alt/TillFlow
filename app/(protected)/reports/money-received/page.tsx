import DownloadLink from '@/components/DownloadLink';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import Pagination from '@/components/Pagination';
import { formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DEFAULT_BUSINESS_TIMEZONE } from '@/lib/notifications/utils';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { getBusinessStores } from '@/lib/services/stores';
import {
  classifyMoneyReceivedRowKind,
  computeMoneyReceivedBundle,
  drillDownForMetric,
  methodLabel,
  moneyReceivedRowKindHint,
  moneyReceivedRowKindLabel,
  resolveMoneyReceivedAccess,
  type MoneyReceivedMetricId,
} from '@/lib/reports/money-received';

export const dynamic = 'force-dynamic';

const DRILL_OPTIONS: { id: MoneyReceivedMetricId; label: string }[] = [
  { id: 'money_received', label: 'All money received' },
  { id: 'money_received_cash', label: 'Cash' },
  { id: 'money_received_momo', label: 'Mobile Money' },
  { id: 'money_received_card', label: 'Card' },
  { id: 'money_received_transfer', label: 'Bank transfer' },
  { id: 'money_received_other', label: 'Other methods' },
  { id: 'unverified_legacy_receipts', label: 'Needs MoMo confirmation' },
  { id: 'refund_outflows', label: 'Refund outflows' },
];

function formatScopeInstant(value: Date, timeZone: string) {
  return value.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}

export default async function MoneyReceivedReportPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    storeId?: string;
    businessId?: string;
    metric?: string;
    page?: string;
    pageSize?: string;
  };
}) {
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return (
      <div className="card p-6">
        <EmptyState
          icon="chart"
          title="Setup required"
          subtitle="Complete your business setup to unlock Money Received."
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
                : 'You do not have access to Money Received.'
          }
        />
      </div>
    );
  }

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const {
    start: from,
    end: to,
    fromInputValue: fromIso,
    toInputValue: toIso,
  } = resolveReportDateRange(searchParams, weekAgo, today);

  const businessTz = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: { timezone: true },
  });
  const timeZone = businessTz?.timezone ?? DEFAULT_BUSINESS_TIMEZONE;

  const metricParam = (searchParams?.metric ?? 'money_received') as MoneyReceivedMetricId;
  const drillMetricId = DRILL_OPTIONS.some((o) => o.id === metricParam)
    ? metricParam
    : 'money_received';

  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams?.pageSize ?? '25', 10) || 25));
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const periodEndExclusive = new Date(to.getTime() + 1);

  const bundle = await computeMoneyReceivedBundle({
    businessId: access.businessId,
    currency: business.currency,
    timeZone,
    periodStart: from,
    periodEndInclusive: periodEndExclusive,
    branchIds: access.branchIds,
    absoluteBounds: true,
  });

  const drill = await drillDownForMetric(prisma, bundle, drillMetricId, page, pageSize);
  const currency = business.currency;
  const mr = bundle.byId.money_received;
  const refunds = bundle.byId.refund_outflows;
  const unverified = bundle.byId.unverified_legacy_receipts;
  const queryFailed = bundle.quality.overall === 'QUERY_FAILED';
  const selectedStoreId = access.selectedStoreId;
  const hasAmendOutRows = drill.page.rows.some(
    (row) => classifyMoneyReceivedRowKind(row) === 'sale_amend_out',
  );

  const exportQs = new URLSearchParams({
    from: fromIso,
    to: toIso,
    storeId: selectedStoreId,
    metric: drillMetricId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Money Received"
        subtitle="Confirmed customer money by the time it was received — separate from sales totals and from refunds."
        actions={
          <DownloadLink
            href={`/exports/money-received?${exportQs.toString()}`}
            fallbackFilename={`money-received-${fromIso}-${toIso}.csv`}
            className="btn-secondary justify-center text-sm"
            disabled={queryFailed}
          >
            Export CSV
          </DownloadLink>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <p>
          Use this report for cash-in totals. A later return or void does not erase a confirmed
          receipt already shown here. Full returns appear under Refund outflows; sale edits that
          gave money back appear as negative lines in the table below.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          {business.name} ·{' '}
          {selectedStoreId === 'ALL'
            ? 'All branches'
            : stores.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId}{' '}
          · {formatScopeInstant(bundle.scope.periodStart, bundle.scope.timeZone)} →{' '}
          {formatScopeInstant(
            new Date(bundle.scope.periodEndExclusive.getTime() - 1),
            bundle.scope.timeZone,
          )}{' '}
          ({bundle.scope.timeZone})
        </p>
      </div>

      {bundle.quality.legacyWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            {bundle.quality.messages[0] ??
              'Some Mobile Money payments still need confirmation and are left out of Money Received.'}
            {unverified?.valuePence != null && unverified.valuePence > 0 && (
              <span className="ml-1 font-medium">
                Needs confirmation: {formatMoney(unverified.valuePence, currency)}.
              </span>
            )}
          </p>
          <p className="mt-2">
            <Link
              href={`/reports/momo-confirmation?from=${fromIso}&to=${toIso}&storeId=${selectedStoreId}`}
              className="font-medium text-amber-950 underline underline-offset-2 hover:text-amber-800"
            >
              Review MoMo confirmations
            </Link>
          </p>
        </div>
      )}

      {queryFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Money Received could not be loaded. Values are not shown as zero — please retry.
          {bundle.results[0]?.dependencyReason ? ` (${bundle.results[0].dependencyReason})` : ''}
        </div>
      )}

      <ReportFilterCard columnsClassName="sm:grid-cols-5" submitLabel="Apply" submitTone="secondary">
        <div>
          <label className="label" htmlFor="storeId">
            Branch
          </label>
          <select id="storeId" className="input" name="storeId" defaultValue={selectedStoreId}>
            <option value="ALL">All branches</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">
            From
          </label>
          <input id="from" className="input" type="date" name="from" defaultValue={fromIso} />
        </div>
        <div>
          <label className="label" htmlFor="to">
            To
          </label>
          <input id="to" className="input" type="date" name="to" defaultValue={toIso} />
        </div>
        <div>
          <label className="label" htmlFor="metric">
            Show transactions for
          </label>
          <select id="metric" name="metric" defaultValue={drillMetricId} className="input">
            {DRILL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </ReportFilterCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Money received"
          value={queryFailed || mr?.valuePence == null ? '—' : formatMoney(mr.valuePence, currency)}
          helper="Confirmed receipts in period (net of sale amends)"
        />
        <StatCard
          label="Refund outflows"
          value={
            queryFailed || refunds?.valuePence == null
              ? '—'
              : formatMoney(refunds.valuePence, currency)
          }
          helper="Returns/voids paid back — not subtracted from Money Received"
        />
        <Link
          href={`/reports/momo-confirmation?from=${fromIso}&to=${toIso}&storeId=${selectedStoreId}`}
          className="block rounded-[1.25rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          <StatCard
            label="Needs MoMo confirmation"
            value={
              queryFailed || unverified?.valuePence == null
                ? '—'
                : formatMoney(unverified.valuePence, currency)
            }
            helper="Left out of Money Received until confirmed — open review"
            tone="warn"
          />
        </Link>
        <StatCard
          label="Method check"
          value={bundle.methodReconcile.ok ? 'Balances' : 'Check needed'}
          helper={
            bundle.methodReconcile.ok
              ? 'Cash + MoMo + Card + Transfer + Other equals Money Received'
              : bundle.methodReconcile.reason ?? 'Method totals do not match'
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ['money_received_cash', 'Cash'],
            ['money_received_momo', 'Mobile Money'],
            ['money_received_card', 'Card'],
            ['money_received_transfer', 'Transfer'],
            ['money_received_other', 'Other'],
          ] as const
        ).map(([id, label]) => {
          const m = bundle.byId[id];
          return (
            <div key={id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {queryFailed || m?.valuePence == null ? '—' : formatMoney(m.valuePence, currency)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          Selected total:{' '}
          {queryFailed || bundle.byId[drillMetricId]?.valuePence == null
            ? 'unavailable'
            : formatMoney(bundle.byId[drillMetricId]!.valuePence!, currency)}
          {' · '}
          {drill.page.totalCount} matching transaction
          {drill.page.totalCount === 1 ? '' : 's'}
          {' · '}
          page {drill.page.page} of {drill.page.totalPages}. Changing pages does not change the
          totals above.
          {drill.reconcile.ok
            ? ''
            : ` Detail check: ${drill.reconcile.reason ?? 'needs review'}.`}
        </p>
        {hasAmendOutRows && (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Negative amounts labelled <span className="font-medium">Sale amend (money out)</span>{' '}
            are sale edits that returned money to the customer. They stay inside Money Received so
            the total matches cash movement on the sale.
          </p>
        )}
        <ReportTableCard
          title={DRILL_OPTIONS.find((o) => o.id === drillMetricId)?.label ?? 'Transactions'}
        >
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Method</th>
              <th>Sale</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {drill.page.rows.length === 0 ? (
              <ReportTableEmptyRow
                colSpan={5}
                message={
                  queryFailed ||
                  drill.page.queryFailed ||
                  drill.reconcile.reason === 'QUERY_FAILED'
                    ? 'No rows — query failed.'
                    : 'No transactions in this scope for the selected figure.'
                }
              />
            ) : (
              drill.page.rows.map((row) => {
                const kind = classifyMoneyReceivedRowKind(row);
                const hint = moneyReceivedRowKindHint(kind);
                return (
                  <tr key={`${row.sourceType}:${row.sourceId}`}>
                    <td>{formatScopeInstant(row.eventAt, bundle.scope.timeZone)}</td>
                    <td>
                      <span className="font-medium text-slate-800">
                        {moneyReceivedRowKindLabel(kind)}
                      </span>
                      {hint ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
                      ) : null}
                    </td>
                    <td>{row.method ? methodLabel(row.method) : '—'}</td>
                    <td>{row.transactionNumber ?? '—'}</td>
                    <td
                      className={`text-right tabular-nums ${
                        row.amountPence < 0 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {formatMoney(row.amountPence, currency)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </ReportTableCard>
      </div>

      <Pagination
        currentPage={drill.page.page}
        totalPages={drill.page.totalPages}
        basePath="/reports/money-received"
        pageSize={pageSize}
        searchParams={{
          from: fromIso,
          to: toIso,
          storeId: selectedStoreId,
          metric: drillMetricId,
        }}
      />
    </div>
  );
}
