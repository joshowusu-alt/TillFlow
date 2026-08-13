import Link from 'next/link';
import DownloadLink from '@/components/DownloadLink';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
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
import MomoConfirmDrawer from './MomoConfirmDrawer';

export const dynamic = 'force-dynamic';

const SALE_STATUS_OPTIONS = ['PAID', 'PART_PAID', 'UNPAID', 'RETURNED', 'VOID'] as const;

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
          when Mobile Money was taken without a confirmed provider collection. Open <span className="font-medium">Review</span>{' '}
          to confirm money that was already received — this is not a new receipt.
        </p>
        <p className="mt-2 text-xs text-amber-900/80">
          After confirmation the amount appears in Money Received using the original payment date, not today.
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
        <MomoConfirmDrawer
          currency={currency}
          timeZone={timeZone}
          queryFailed={queryFailed}
          rows={list.rows.map((row) => ({
            paymentId: row.paymentId,
            receivedAtIso: row.receivedAt.toISOString(),
            amountPence: row.amountPence,
            method: row.method,
            status: row.status,
            receiptOrigin: row.receiptOrigin,
            reference: row.reference,
            network: row.network,
            provider: row.provider,
            payerMsisdn: row.payerMsisdn,
            collectionId: row.collectionId,
            salesInvoiceId: row.salesInvoiceId,
            transactionNumber: row.transactionNumber,
            saleStatus: row.saleStatus,
            storeName: row.storeName,
            cashierName: row.cashierName,
            customerName: row.customerName,
          }))}
        />
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
