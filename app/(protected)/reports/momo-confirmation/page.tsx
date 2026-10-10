import { notFound } from 'next/navigation';
import { CONSOLIDATED_LABEL } from '@/lib/entitlements/types';
import Link from 'next/link';
import DownloadLink from '@/components/DownloadLink';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import Pagination from '@/components/Pagination';
import { formatMoney } from '@/lib/format';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { prisma } from '@/lib/prisma';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { defaultTenantLocalRange } from '@/lib/reports/reporting-clock';
import { getBusinessStores } from '@/lib/services/stores';
import { resolveMoneyReceivedAccess } from '@/lib/reports/money-received';
import {
  defaultMomoConfirmationStatusFilter,
  listMomoConfirmationCashiers,
  listMomoConfirmationPayments,
  momoConfirmationDateInputValue,
  momoConfirmationReceiptScope,
  summarizeMomoConfirmationPayments,
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
    queue?: string;
  };
}) {
  const opened = await openLiveReport({
    surfaceId: 'momo_confirmation',
    search: searchParams,
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
                : 'You do not have access to MoMo confirmation review.'
          }
        />
      </div>
    );
  }

  const businessTz = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: { timezone: true },
  });
  const now = new Date();
  const fallback = defaultTenantLocalRange(now, businessTz?.timezone, 30);
  const timeZone = fallback.timeZone;

  const {
    start: from,
    end: to,
    fromInputValue: fromIso,
    toInputValue: toIso,
  } = resolveReportDateRange(searchParams, fallback.startInclusive, now, timeZone);

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
  const periodEndExclusive = to;
  const receiptScope = momoConfirmationReceiptScope(searchParams);

  const filters = {
    businessId: access.businessId,
    branchIds: access.branchIds,
    periodStart: from,
    periodEndExclusive,
    status: statusFilter,
    saleStatus: saleStatusFilter,
    cashierUserId: cashierFilter,
    receiptScope,
  };

  const [list, cashiers] = await Promise.all([
    listMomoConfirmationPayments(prisma, filters, page, pageSize),
    listMomoConfirmationCashiers(prisma, access.businessId),
  ]);

  const currency = business.currency;
  const selectedStoreId = access.selectedStoreId;
  const queryFailed = Boolean(list.queryFailed);
  let outsideCount = 0;
  let outsideAmountPence = 0;
  if (receiptScope === 'period' && !queryFailed) {
    try {
      const outstanding = await summarizeMomoConfirmationPayments(prisma, {
        ...filters,
        receiptScope: 'outstanding',
      });
      outsideCount = Math.max(0, outstanding.totalCount - list.totalCount);
      outsideAmountPence = Math.max(0, outstanding.totalAmountPence - list.totalAmountPence);
    } catch {
      outsideCount = 0;
      outsideAmountPence = 0;
    }
  }

  const exportQs = new URLSearchParams({
    ...(receiptScope === 'period' ? { from: fromIso, to: toIso } : { queue: 'outstanding' }),
    storeId: selectedStoreId,
    status: statusFilter,
    saleStatus: saleStatusFilter,
    cashierUserId: cashierFilter,
  });
  const outstandingQs = new URLSearchParams({
    queue: 'outstanding',
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
      <ReportsDestinationHead
        title="MoMo Confirmation Review"
        periodLabel="Mobile Money payments that still need confirmation — not included in Money Received until confirmed."
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
          A payment recorded at checkout is not a confirmed receipt. These rows stay{' '}
          <span className="font-medium">{MOMO_CONFIRMATION_STATUS}</span> until an owner or manager checks that the
          money arrived. The sale can already say paid because the tender was recorded. Pending receipts stay out of
          Money Received and do not reduce what customers owe.
        </p>
        <p className="mt-2">
          Open <span className="font-medium">Review</span> to confirm one receipt. Confirmation is not a new receipt,
          and it does not change the sale stamp.
        </p>
        <p className="mt-2 text-xs text-amber-900/80">
          {receiptScope === 'outstanding'
            ? 'This list includes every outstanding receipt, including payments recorded before the usual 30-day report window. Apply a date range only when you want to limit the list.'
            : 'This list follows the selected dates. After confirmation the amount appears in Money Received on the original payment date, not today.'}
        </p>
        {receiptScope === 'period' && outsideCount > 0 ? (
          <p className="mt-2 text-sm">
            {outsideCount.toLocaleString('en-GH')} receipt{outsideCount === 1 ? '' : 's'} totalling{' '}
            {formatMoney(outsideAmountPence, currency)} {outsideCount === 1 ? 'was' : 'were'} recorded outside this
            date range and still need confirmation.{' '}
            <Link href={`/reports/momo-confirmation?${outstandingQs.toString()}`} className="font-semibold underline">
              Show every outstanding receipt
            </Link>
          </p>
        ) : null}
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
            {opened.branch.offerAll ? <option value="ALL">{CONSOLIDATED_LABEL}</option> : null}
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
          <input id="from" className="input" type="date" name="from" defaultValue={momoConfirmationDateInputValue(receiptScope, fromIso)} />
        </div>
        <div>
          <label className="label" htmlFor="to">
            To
          </label>
          <input id="to" className="input" type="date" name="to" defaultValue={momoConfirmationDateInputValue(receiptScope, toIso)} />
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
          ...(receiptScope === 'period' ? { from: fromIso, to: toIso, queue: 'period' } : { queue: 'outstanding' }),
          storeId: selectedStoreId,
          status: statusFilter,
          saleStatus: saleStatusFilter,
          cashierUserId: cashierFilter,
        }}
      />
    </div>
  );
}
