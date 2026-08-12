import Link from 'next/link';
import DownloadLink from '@/components/DownloadLink';
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
import { resolveMoneyReceivedAccess } from '@/lib/reports/money-received';
import {
  defaultMomoConfirmationStatusFilter,
  listMomoConfirmationCashiers,
  listMomoConfirmationPayments,
  MOMO_CONFIRMATION_STATUS,
} from '@/lib/reports/momo-confirmation';

export const dynamic = 'force-dynamic';

const SALE_STATUS_OPTIONS = ['PAID', 'PART_PAID', 'UNPAID', 'RETURNED', 'VOID'] as const;

function formatScopeInstant(value: Date, timeZone: string) {
  return value.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}

export default async function MomoConfirmationReviewPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    storeId?: string;
    businessId?: string;
    status?: string;
    saleStatus?: string;
    cashierUserId?: string;
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
          subtitle="Complete your business setup to review MoMo confirmations."
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
                : 'You do not have access to MoMo confirmation review.'
          }
        />
      </div>
    );
  }

  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 30);

  const {
    start: from,
    end: to,
    fromInputValue: fromIso,
    toInputValue: toIso,
  } = resolveReportDateRange(searchParams, monthAgo, today);

  const businessTz = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: { timezone: true },
  });
  const timeZone = businessTz?.timezone ?? DEFAULT_BUSINESS_TIMEZONE;

  const statusFilter =
    searchParams?.status === 'ALL'
      ? 'ALL'
      : searchParams?.status?.trim() || defaultMomoConfirmationStatusFilter();
  const saleStatusFilter =
    searchParams?.saleStatus === 'ALL' || !searchParams?.saleStatus
      ? 'ALL'
      : searchParams.saleStatus;
  const cashierFilter =
    searchParams?.cashierUserId === 'ALL' || !searchParams?.cashierUserId
      ? 'ALL'
      : searchParams.cashierUserId;

  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams?.pageSize ?? '25', 10) || 25));
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const periodEndExclusive = new Date(to.getTime() + 1);

  const filters = {
    businessId: access.businessId,
    branchIds: access.branchIds,
    periodStart: from,
    periodEndExclusive,
    status: statusFilter,
    saleStatus: saleStatusFilter,
    cashierUserId: cashierFilter,
  };

  const [list, cashiers] = await Promise.all([
    listMomoConfirmationPayments(prisma, filters, page, pageSize),
    listMomoConfirmationCashiers(prisma, access.businessId),
  ]);

  const currency = business.currency;
  const selectedStoreId = access.selectedStoreId;
  const queryFailed = Boolean(list.queryFailed);

  const exportQs = new URLSearchParams({
    from: fromIso,
    to: toIso,
    storeId: selectedStoreId,
    status: statusFilter,
    saleStatus: saleStatusFilter,
    cashierUserId: cashierFilter,
  });

  const moneyReceivedQs = new URLSearchParams({
    from: fromIso,
    to: toIso,
    storeId: selectedStoreId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="MoMo Confirmation Review"
        subtitle="Mobile Money payments that still need confirmation — not included in Money Received until confirmed."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/reports/money-received?${moneyReceivedQs.toString()}`}
              className="btn-secondary justify-center text-sm"
            >
              Back to Money Received
            </Link>
            <DownloadLink
              href={`/exports/momo-confirmation?${exportQs.toString()}`}
              fallbackFilename={`momo-confirmation-${fromIso}-${toIso}.csv`}
              className="btn-secondary justify-center text-sm"
              disabled={queryFailed}
            >
              Export CSV
            </DownloadLink>
          </div>
        }
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p>
          These rows are usually recorded as <span className="font-medium">{MOMO_CONFIRMATION_STATUS}</span>{' '}
          when Mobile Money was taken without a confirmed provider collection. Review them against the
          customer receipt or statement. Confirmation actions are not available on this read-only
          report yet.
        </p>
        <p className="mt-2 text-xs text-amber-900/80">
          They do not change Money Received totals until status becomes CONFIRMED.
        </p>
      </div>

      {queryFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          MoMo confirmation list could not be loaded. Values are not shown as zero — please retry.
          {list.queryError ? ` (${list.queryError})` : ''}
        </div>
      )}

      <ReportFilterCard columnsClassName="sm:grid-cols-3 lg:grid-cols-6" submitLabel="Apply" submitTone="secondary">
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
          <label className="label" htmlFor="status">
            Payment status
          </label>
          <select id="status" className="input" name="status" defaultValue={statusFilter}>
            <option value={MOMO_CONFIRMATION_STATUS}>{MOMO_CONFIRMATION_STATUS}</option>
            <option value="ALL">All needing confirmation</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="saleStatus">
            Sale status
          </label>
          <select id="saleStatus" className="input" name="saleStatus" defaultValue={saleStatusFilter}>
            <option value="ALL">All sale statuses</option>
            {SALE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cashierUserId">
            Cashier
          </label>
          <select
            id="cashierUserId"
            className="input"
            name="cashierUserId"
            defaultValue={cashierFilter}
          >
            <option value="ALL">All cashiers</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </ReportFilterCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Payments needing confirmation"
          value={queryFailed ? '—' : String(list.totalCount)}
          helper="Not in Money Received yet"
        />
        <StatCard
          label="Total amount"
          value={queryFailed ? '—' : formatMoney(list.totalAmountPence, currency)}
          helper="Sum of listed payment statuses"
        />
        <StatCard
          label="Default view"
          value={MOMO_CONFIRMATION_STATUS}
          helper="Mobile Money awaiting manual confirmation"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          {queryFailed
            ? 'List unavailable.'
            : `${list.totalCount} matching payment${list.totalCount === 1 ? '' : 's'} · page ${list.page} of ${list.totalPages}.`}
        </p>
        <ReportTableCard title="Needs MoMo confirmation">
          <thead>
            <tr>
              <th>When</th>
              <th>Branch</th>
              <th>Cashier</th>
              <th>Sale</th>
              <th>Customer</th>
              <th>Method</th>
              <th>Status</th>
              <th>Sale status</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 ? (
              <ReportTableEmptyRow
                colSpan={9}
                message={
                  queryFailed
                    ? 'No rows — query failed.'
                    : 'No payments need MoMo confirmation in this scope.'
                }
              />
            ) : (
              list.rows.map((row) => (
                <tr key={row.paymentId}>
                  <td>{formatScopeInstant(row.receivedAt, timeZone)}</td>
                  <td>{row.storeName}</td>
                  <td>{row.cashierName ?? '—'}</td>
                  <td>{row.transactionNumber ?? '—'}</td>
                  <td>{row.customerName ?? '—'}</td>
                  <td>{row.method === 'MOBILE_MONEY' ? 'Mobile Money' : row.method}</td>
                  <td>
                    <span className="font-medium text-amber-900">{row.status}</span>
                  </td>
                  <td>{row.saleStatus}</td>
                  <td className="text-right tabular-nums">{formatMoney(row.amountPence, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </ReportTableCard>
      </div>

      <Pagination
        currentPage={list.page}
        totalPages={list.totalPages}
        basePath="/reports/momo-confirmation"
        pageSize={pageSize}
        searchParams={{
          from: fromIso,
          to: toIso,
          storeId: selectedStoreId,
          status: statusFilter,
          saleStatus: saleStatusFilter,
          cashierUserId: cashierFilter,
        }}
      />
    </div>
  );
}
