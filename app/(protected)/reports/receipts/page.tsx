import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import { DataCard, DataCardField, DataCardHeader } from '@/components/DataCard';
import { requireBusiness } from '@/lib/auth';
import { formatDateTime, formatMoney } from '@/lib/format';
import { getBusinessStores } from '@/lib/services/stores';
import {
  isReportingScopeToday,
  moneyReceivedHref,
  resolveReportingScope,
  tradingReportHref,
} from '@/lib/reports/reporting-scope';
import {
  listMoneyReceivedPayments,
  parseReceiptMethodParam,
  parseReceiptOriginParam,
  RECEIPT_CLASSIFICATION_LABELS,
  RECEIPT_METHOD_LABELS,
  SUPPORTED_RECEIPT_METHODS,
  SUPPORTED_RECEIPT_ORIGINS,
} from '@/lib/reports/money-received';

export const dynamic = 'force-dynamic';

export default async function MoneyReceivedReceiptsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    storeId?: string;
    period?: string;
    method?: string;
    origin?: string;
    page?: string;
    pageSize?: string;
  };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return <div className="card p-6">Setup Required</div>;
  }

  const { stores, selectedStoreId: rawStoreId } = await getBusinessStores(
    business.id,
    searchParams?.storeId,
  );

  const scope = resolveReportingScope({
    businessId: business.id,
    timeZone: (business as { timezone?: string | null }).timezone,
    params: {
      period: searchParams?.period,
      from: searchParams?.from,
      to: searchParams?.to,
      storeId: rawStoreId ?? searchParams?.storeId ?? 'ALL',
    },
    defaultPeriod: 'today',
    allowedStoreIds: stores.map((store) => store.id),
  });

  const method = parseReceiptMethodParam(searchParams?.method);
  const origin = parseReceiptOriginParam(searchParams?.origin);
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams?.pageSize ?? '25', 10) || 25));

  const { rows, totalCount, totalPages, page: currentPage } = await listMoneyReceivedPayments({
    scope,
    method,
    origin,
    page,
    pageSize,
  });

  const isToday = isReportingScopeToday(scope);
  const methodLabel = method ? RECEIPT_METHOD_LABELS[method] : 'All methods';
  const originLabel = origin ? RECEIPT_CLASSIFICATION_LABELS[origin] : 'All origins';

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Money received"
        subtitle="Payment records for the selected period — not a sales list."
        actions={
          <Link href={tradingReportHref(scope)} className="btn-secondary text-sm">
            Back to Trading Report
          </Link>
        }
      />

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        <p>
          Showing <strong>{methodLabel}</strong>
          {' · '}
          <strong>{originLabel}</strong> for{' '}
          {isToday ? 'Today' : `${scope.fromInputValue} → ${scope.toInputValue}`}
          {scope.storeId === 'ALL' ? ' · All branches' : ''}.
          Rows are individual <strong>SalesPayment</strong> records. Origin comes from the
          persisted payment field — historical payments without origin stay “not classified”.
        </p>
      </section>

      <ReportFilterCard
        columnsClassName="sm:grid-cols-6"
        submitLabel="Apply"
        submitTone="secondary"
      >
        <div>
          <label className="label">Quick period</label>
          <select className="input" name="period" defaultValue={scope.periodKey}>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="custom">Custom dates</option>
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={scope.fromInputValue} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={scope.toInputValue} />
        </div>
        <div>
          <label className="label">Payment method</label>
          <select className="input" name="method" defaultValue={method ?? ''}>
            <option value="">All methods</option>
            {SUPPORTED_RECEIPT_METHODS.map((value) => (
              <option key={value} value={value}>
                {RECEIPT_METHOD_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Receipt origin</label>
          <select className="input" name="origin" defaultValue={origin ?? ''}>
            <option value="">All origins</option>
            {SUPPORTED_RECEIPT_ORIGINS.map((value) => (
              <option key={value} value={value}>
                {RECEIPT_CLASSIFICATION_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        {stores.length > 1 ? (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="storeId" defaultValue={scope.storeId}>
              <option value="ALL">All branches</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="storeId" value={scope.storeId} />
        )}
      </ReportFilterCard>

      <div className="text-sm text-muted">
        {totalCount.toLocaleString()} payment{totalCount === 1 ? '' : 's'}
      </div>

      {rows.length === 0 ? (
        <div className="card px-4 py-10 text-center text-sm text-muted">
          No payment records in this scope.
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <DataCard key={row.paymentId}>
                <DataCardHeader
                  title={row.methodLabel}
                  subtitle={formatDateTime(row.receivedAt)}
                  aside={
                    <span className="font-bold tabular-nums text-ink">
                      {formatMoney(row.amountPence, business.currency)}
                    </span>
                  }
                />
                <DataCardField label="When received" value={RECEIPT_CLASSIFICATION_LABELS[row.classification]} />
                <DataCardField label="Receipt" value={row.transactionNumber ?? row.invoiceId.slice(0, 8)} />
                <DataCardField label="Branch" value={row.storeName} />
                <DataCardField label="Till" value={row.tillName} />
                <DataCardField label="Cashier" value={row.cashierName ?? '—'} />
                <DataCardField label="Customer" value={row.customerName ?? '—'} />
                <DataCardField label="Sale total" value={formatMoney(row.invoiceTotalPence, business.currency)} />
                <DataCardField label="Reference" value={row.reference || row.provider || '—'} />
                <div className="mt-2">
                  <Link href={`/receipts/${row.invoiceId}`} className="text-xs font-medium text-accent underline-offset-2 hover:underline">
                    Open receipt
                  </Link>
                </div>
              </DataCard>
            ))}
          </div>

          <div className="card hidden overflow-x-auto p-2 md:block">
            <table className="table w-full min-w-[64rem]">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Method</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Receipt #</th>
                  <th>Branch</th>
                  <th>Till</th>
                  <th>Cashier</th>
                  <th>Customer</th>
                  <th>Sale total</th>
                  <th>Reference</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.paymentId}>
                    <td className="whitespace-nowrap text-sm">{formatDateTime(row.receivedAt)}</td>
                    <td className="text-sm">{row.methodLabel}</td>
                    <td className="text-sm">
                      <span
                        className={
                          row.classification === 'RECEIVED_AT_SALE'
                            ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800'
                            : row.classification === 'LATER_CREDIT_COLLECTION'
                              ? 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800'
                              : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700'
                        }
                      >
                        {row.classificationLabel}
                      </span>
                      {row.paymentState === 'REVERSAL' ? (
                        <span className="ml-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                          Reversal
                        </span>
                      ) : null}
                    </td>
                    <td className="font-semibold tabular-nums">
                      {formatMoney(row.amountPence, business.currency)}
                    </td>
                    <td className="font-mono text-xs">{row.transactionNumber ?? '—'}</td>
                    <td className="text-sm">{row.storeName}</td>
                    <td className="text-sm">{row.tillName}</td>
                    <td className="text-sm">{row.cashierName ?? '—'}</td>
                    <td className="text-sm">{row.customerName ?? '—'}</td>
                    <td className="tabular-nums text-sm">
                      {formatMoney(row.invoiceTotalPence, business.currency)}
                    </td>
                    <td className="max-w-[10rem] truncate text-xs text-muted" title={row.reference ?? undefined}>
                      {row.reference || row.provider || '—'}
                    </td>
                    <td>
                      <Link href={`/receipts/${row.invoiceId}`} className="text-xs font-medium text-accent underline-offset-2 hover:underline">
                        Receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/reports/receipts"
        searchParams={{
          period: scope.periodKey,
          from: scope.fromInputValue,
          to: scope.toInputValue,
          storeId: scope.storeId,
          method: method ?? undefined,
          origin: origin ?? undefined,
          pageSize: String(pageSize),
        }}
      />

      <p className="text-xs text-muted">
        Deep link for this view:{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">
          {moneyReceivedHref(scope, method ?? undefined, origin ?? undefined)}
        </code>
      </p>
    </div>
  );
}
