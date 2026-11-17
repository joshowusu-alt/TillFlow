import { deletedSaleLabel, saleDeletionPreview } from '@/lib/food/sale-deletion';
import DeleteFoodSaleButton from '@/components/DeleteFoodSaleButton';
import { summarizeAmountSales } from '@/lib/food/amount-sales';
import { isFoodBusiness } from '@/lib/food/business';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import Pagination from '@/components/Pagination';
import InlinePaymentForm from '@/components/InlinePaymentForm';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { rowsForListPage } from '@/lib/pagination';
import { getBusinessStores } from '@/lib/services/stores';
import { formatBusinessLocalDateKey, resolveBusinessTimeZone } from '@/lib/notifications/utils';
import { localDateInstant } from '@/lib/reports/reporting-clock';
import { MomoPendingQualification } from '@/components/MomoPendingQualification';

const paymentLabels: Record<string, string> = { CASH: 'Cash', MOBILE_MONEY: 'MoMo', CARD: 'Card', TRANSFER: 'Transfer' };
const statusLabels: Record<string, string> = { PAID: 'Paid', PART_PAID: 'Part paid', UNPAID: 'Unpaid' };

function quickDates(today: string) {
  const date = new Date(today + 'T00:00:00Z');
  const daysAgo = (days: number) => new Date(date.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const yesterday = daysAgo(1);
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: yesterday, to: yesterday },
    { label: 'This week', from: daysAgo((date.getUTCDay() + 6) % 7), to: today },
    { label: 'This month', from: today.slice(0, 7) + '-01', to: today },
    { label: 'All', from: '', to: '' },
  ];
}

export default async function SalesPage(
  props: {
    searchParams?: Promise<{ q?: string; page?: string; storeId?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { business, user } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <Link href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</Link>
      </div>
    );
  }

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const todayIso = formatBusinessLocalDateKey(new Date(), business.timezone);
  const fromParam = searchParams?.from ?? todayIso;
  const toParam   = searchParams?.to   ?? todayIso;
  const { stores, selectedStoreId: rawStoreId } = await getBusinessStores(business.id, searchParams?.storeId);
  const selectedStoreId = rawStoreId ?? 'ALL';

  // Build date range filter
  const dateFilter: { gte?: Date; lt?: Date } = {};
  const rangeStart = localDateInstant(fromParam, 'start', business.timezone);
  const rangeEnd = localDateInstant(toParam, 'endExclusive', business.timezone);
  if (rangeStart) dateFilter.gte = rangeStart;
  if (rangeEnd) dateFilter.lt = rangeEnd;

  const where = {
    businessId: business.id,
    ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
    ...(q ? { customer: { name: { contains: q, mode: 'insensitive' as const } } } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
  };

  const loadSales = (listPage: number) => prisma.salesInvoice.findMany({
    where,
    select: {
      id: true,
      transactionNumber: true,
      createdAt: true,
      paymentStatus: true,
      tillId: true,
      shift: { select: { status: true, tillId: true, till: { select: { name: true, active: true } } } },
      totalPence: true,
      store: { select: { name: true } },
      customer: { select: { name: true } },
      salesReturn: { select: { id: true, reasonCode: true, managerApprovalMode: true } },
      payments: { select: { method: true, amountPence: true, status: true } },
      _count: { select: { lines: true } },
      lines: { where: { customAmountPence: { not: null } }, select: { customAmountPence: true, product: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (listPage - 1) * DEFAULT_PAGE_SIZE,
    take: DEFAULT_PAGE_SIZE,
  });
  const [totalCount, firstPage, amountSales] = await Promise.all([
    prisma.salesInvoice.count({ where }),
    loadSales(page),
    isFoodBusiness(business.businessCategory) ? summarizeAmountSales(where) : null,
  ]);
  const listed = await rowsForListPage(page, totalCount, DEFAULT_PAGE_SIZE, firstPage, loadSales);
  const sales = listed.rows;
  const currentPage = listed.page;
  const totalPages = listed.totalPages;

  const canDelete = user?.role === 'OWNER' && isFoodBusiness(business.businessCategory);
  const getClosedSaleLabel = (paymentStatus: string, returned: typeof sales[number]['salesReturn']) => {
    const deleted = deletedSaleLabel(returned);
    if (deleted) return deleted;
    if (paymentStatus === 'VOID') return 'Voided';
    if (paymentStatus === 'RETURNED') return 'Returned';
    return 'Closed';
  };

  function amountLabels(sale: typeof sales[number]) {
    return sale.lines.map((line, index) => <p key={index} className="text-xs text-muted">
      {line.product.name} · Amount {formatMoney(line.customAmountPence ?? 0, business.currency)}
    </p>);
  }

  const presets = quickDates(todayIso);
  const activePreset = presets.find(({ from, to }) => from === fromParam && to === toParam);
  const pageTotal = sales.reduce((total, sale) =>
    total + (sale.salesReturn || ['VOID', 'RETURNED'].includes(sale.paymentStatus) ? 0 : sale.totalPence), 0);
  const filters = (prefix: string) => (
        <div className="mt-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm">
          <form method="GET" className="grid grid-cols-2 items-end gap-3 lg:flex lg:flex-wrap">
            {stores.length > 1 && <div className="col-span-2">
              <label className="label" htmlFor={prefix + "-storeId"}>Branch</label>
              <select className="input" id={prefix + "-storeId"} name="storeId" defaultValue={selectedStoreId}>
                <option value="ALL">All branches</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>}
            <div className="min-w-0">
              <label className="label" htmlFor={prefix + "-from"}>From</label>
              <input className="input" type="date" id={prefix + "-from"} name="from" defaultValue={fromParam} />
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor={prefix + "-to"}>To</label>
              <input className="input" type="date" id={prefix + "-to"} name="to" defaultValue={toParam} />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor={prefix + "-q"}>Customer</label>
              <input className="input" id={prefix + "-q"} name="q" defaultValue={q} placeholder="Search by customer..." />
            </div>
            <button className="btn-secondary col-span-2" type="submit">
              Apply
            </button>
            {(!!searchParams?.from || !!searchParams?.to) && (
              <Link href="/sales?from=&to=" className="self-center text-xs text-muted underline underline-offset-2 hover:text-primary">
                Clear filter
              </Link>
            )}
          </form>
        </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Sales"
        compact
        subtitle="Latest invoices, receipts, and payment status."
        actions={<RefreshIndicator compact fetchedAt={new Date().toISOString()} />}
      />

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
        <p className="text-2xl font-bold tabular-nums text-ink">{formatMoney(pageTotal, business.currency)}</p>
        <p className="text-sm text-slate-600">
          {totalCount} {totalCount === 1 ? 'sale' : 'sales'} · {activePreset?.label ?? 'Selected dates'}
          {totalPages > 1 ? ' · Amount on this page' : ''}
        </p>
      </div>
      <nav aria-label="Sales date range" className="flex max-w-full flex-wrap gap-1.5 lg:hidden">
        {presets.map(({ label, from, to }) => {
          const query = new URLSearchParams({ from, to });
          if (q) query.set('q', q);
          if (selectedStoreId !== 'ALL') query.set('storeId', selectedStoreId);
          return <a key={label} href={`/sales?${query}`} aria-current={label === activePreset?.label ? 'true' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-2 text-xs font-semibold sm:px-3 sm:text-sm ${label === activePreset?.label ? 'border-accent bg-accent text-white' : 'border-slate-200 bg-white text-ink'}`}>{label}</a>;
        })}
      </nav>

      {amountSales && amountSales.count > 0 && <p className="hidden text-sm text-slate-600 lg:block">Sold by amount: {amountSales.count} {amountSales.count === 1 ? 'sale' : 'sales'}, {formatMoney(amountSales.totalPence, business.currency)} total</p>}

      <details className="details-mobile lg:hidden">
        <summary className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25" />
            </svg>
            Filters
            {(q || (searchParams?.from && searchParams.from !== todayIso) || (searchParams?.to && searchParams.to !== todayIso) || (searchParams?.storeId && searchParams.storeId !== 'ALL')) ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">Active</span>
            ) : null}
          </span>
          <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        {filters('mobile-sales')}
      </details>
      <div className="hidden lg:block">{filters('desktop-sales')}</div>

      <div className="card p-4 sm:p-5">
        <div className="space-y-3 lg:hidden">
          {sales.length === 0 && totalCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6 text-center">
              <div className="flex flex-col items-center animate-fade-in-up">
                <div className="rounded-full bg-black/5 p-3 mb-2">
                  <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
                  </svg>
                </div>
                <div className="text-sm text-black/70">
                  {q ? `No sales matching "${q}"` : (fromParam || toParam) ? 'No sales in this date range' : 'No sales yet'}
                </div>
                <div className="text-xs text-black/40 mt-1">
                  {q ? 'Try a different search term.' : (fromParam || toParam) ? 'Adjust the date range or view all sales.' : 'Open the POS to make your first sale.'}
                </div>
                {!q && (fromParam || toParam) ? (
                  <Link href="/sales?from=&to=" className="btn-secondary text-xs px-3 py-1.5 mt-3">View all sales</Link>
                ) : !q ? (
                  <div className="mt-3 flex gap-2">
                    <Link href="/pos" className="btn-primary text-xs px-3 py-1.5">Open POS</Link>
                  </div>
                ) : null}
              </div>
            </div>
          ) : sales.map((sale) => {
            const receiptRef = sale.transactionNumber ?? `#${sale.id.slice(0, 8).toUpperCase()}`;
            const closed = Boolean(sale.salesReturn) || ['RETURNED', 'VOID'].includes(sale.paymentStatus);
            const label = closed ? getClosedSaleLabel(sale.paymentStatus, sale.salesReturn) : statusLabels[sale.paymentStatus] ?? sale.paymentStatus;
            const methods = [...new Set(sale.payments.map(payment => paymentLabels[payment.method]).filter(Boolean))];
            return (
              <Link key={sale.id} href={`/receipts/${sale.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold text-primary">{receiptRef}</p>
                    <p className="text-xs text-slate-600">{sale.createdAt.toLocaleString('en-GB', { timeZone: resolveBusinessTimeZone(business.timezone), day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <p className="font-bold tabular-nums text-ink">{formatMoney(sale.totalPence, business.currency)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${closed ? 'bg-slate-100 text-slate-700' : `pill-${sale.paymentStatus.toLowerCase().replace('_', '-')}`}`}>{label}</span>
                  {methods.length > 0 && <span className="text-slate-600">{methods.join(' · ')}</span>}
                  <MomoPendingQualification invoiceStatus={sale.paymentStatus} payments={sale.payments} currency={business.currency} />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="responsive-table-shell hidden lg:block">
          <table className="table w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th className="hidden sm:table-cell">Branch</th>
                <th className="hidden sm:table-cell">Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th className="hidden sm:table-cell">Receipt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && totalCount === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center">
                    <div className="flex flex-col items-center animate-fade-in-up">
                      <div className="rounded-full bg-black/5 p-3 mb-2">
                        <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
                        </svg>
                      </div>
                      <div className="text-sm text-black/70">
                        {q ? `No sales matching "${q}"` : (fromParam || toParam) ? 'No sales in this date range' : 'No sales yet'}
                      </div>
                      <div className="text-xs text-black/40 mt-1">
                        {q ? 'Try a different search term.' : (fromParam || toParam) ? 'Adjust the date range or view all sales.' : 'Open the POS to make your first sale, or run Demo Day to preview.'}
                      </div>
                      {!q && (fromParam || toParam) ? (
                        <Link href="/sales?from=&to=" className="btn-secondary text-xs px-3 py-1.5 mt-3">View all sales</Link>
                      ) : !q ? (
                        <div className="mt-3 flex gap-2">
                          <Link href="/pos" className="btn-primary text-xs px-3 py-1.5">Open POS</Link>
                          <Link href="/onboarding#demo" className="btn-ghost text-xs px-3 py-1.5 border border-black/10 rounded-lg">Run Demo Day</Link>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )}
              {sales.map((sale) => {
                const isClosed = Boolean(sale.salesReturn) || ['RETURNED', 'VOID'].includes(sale.paymentStatus);
                const closedSaleLabel = getClosedSaleLabel(sale.paymentStatus, sale.salesReturn);

                return (
                  <tr key={sale.id} className="rounded-xl bg-white">
                    <td className="px-3 py-3">
                      <Link href={`/receipts/${sale.id}`} className="text-sm font-mono font-semibold text-primary hover:underline">
                        {sale.transactionNumber ?? `#${sale.id.slice(0, 8).toUpperCase()}`}
                      </Link>
                      {amountLabels(sale)}
                    </td>
                    <td className="px-3 py-3 text-sm tabular-nums whitespace-nowrap">
                      {sale.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      {' '}
                      <span className="text-muted">
                        {sale.createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-sm">{sale.store.name}</td>
                    <td className="hidden sm:table-cell px-3 py-3 text-sm">{sale.customer?.name ?? 'Walk-in'}</td>
                    <td className="px-3 py-3">
                      {!deletedSaleLabel(sale.salesReturn) && <span className={`pill-${sale.paymentStatus.toLowerCase().replace('_', '-')}`}>{sale.paymentStatus.replace('_', ' ')}</span>}
                      <MomoPendingQualification
                        invoiceStatus={sale.paymentStatus}
                        payments={sale.payments}
                        currency={business.currency}
                      />
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(sale.totalPence, business.currency)}
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3">
                      <Link className="btn-ghost text-xs" href={`/receipts/${sale.id}`}>
                        Print
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      {isClosed ? (
                        <span className="text-xs text-black/40">{closedSaleLabel}</span>
                      ) : (
                        <div className="flex gap-2 flex-wrap">
                          {['UNPAID', 'PART_PAID'].includes(sale.paymentStatus) && (
                            <InlinePaymentForm
                              invoiceId={sale.id}
                              outstandingPence={sale.totalPence - sale.payments.reduce((s, p) => s + p.amountPence, 0)}
                              currency={business.currency}
                              type="customer"
                              returnTo="/sales"
                            />
                          )}
                          <Link className="btn-ghost text-xs" href={`/sales/amend/${sale.id}`}>
                            Amend
                          </Link>
                          {canDelete && <DeleteFoodSaleButton invoiceId={sale.id} preview={saleDeletionPreview(sale, business.currency)} />}
                          <Link className="btn-ghost text-xs" href={`/sales/return/${sale.id}`}>
                            Return
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/sales"
          searchParams={{
            q: q || undefined,
            storeId: selectedStoreId === 'ALL' ? undefined : selectedStoreId,
            from: fromParam || undefined,
            to: toParam || undefined,
          }}
        />
      </div>
    </div>
  );
}
