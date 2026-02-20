import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import Pagination from '@/components/Pagination';
import InlinePaymentForm from '@/components/InlinePaymentForm';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';

const PAGE_SIZE = 25;

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string; storeId?: string; from?: string; to?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const fromParam = searchParams?.from ?? '';
  const toParam = searchParams?.to ?? '';
  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const selectedStoreId =
    searchParams?.storeId && stores.some((store) => store.id === searchParams.storeId)
      ? searchParams.storeId
      : 'ALL';

  // Build date range filter
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (fromParam) {
    const d = new Date(fromParam);
    if (!isNaN(d.getTime())) dateFilter.gte = d;
  }
  if (toParam) {
    const d = new Date(toParam + 'T23:59:59.999');
    if (!isNaN(d.getTime())) dateFilter.lte = d;
  }

  const where = {
    businessId: business.id,
    ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
    ...(q ? { customer: { name: { contains: q, mode: 'insensitive' as const } } } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
  };

  const [totalCount, sales] = await Promise.all([
    prisma.salesInvoice.count({ where }),
    prisma.salesInvoice.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        paymentStatus: true,
        totalPence: true,
        store: { select: { name: true } },
        customer: { select: { name: true } },
        salesReturn: { select: { id: true } },
        payments: { select: { amountPence: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        subtitle="Latest sales invoices and receipts."
        actions={<RefreshIndicator fetchedAt={new Date().toISOString()} />}
      />

      <div className="flex flex-wrap items-end gap-3">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Branch / Store</label>
            <select className="input" name="storeId" defaultValue={selectedStoreId}>
              <option value="ALL">All branches</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input className="input" type="date" name="from" defaultValue={fromParam} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" type="date" name="to" defaultValue={toParam} />
          </div>
          <div>
            <label className="label">Customer</label>
            <input className="input" name="q" defaultValue={q} placeholder="Search by customer..." />
          </div>
          <button className="btn-secondary" type="submit">
            Apply
          </button>
        </form>
      </div>

      <div className="card p-6 overflow-x-auto">
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
            {sales.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center">
                  <div className="flex flex-col items-center animate-fade-in-up">
                    <div className="rounded-full bg-black/5 p-3 mb-2">
                      <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" />
                      </svg>
                    </div>
                    <div className="text-sm text-black/70">{q ? `No sales matching "${q}"` : 'No sales yet'}</div>
                    <div className="text-xs text-black/40 mt-1">
                      {q ? 'Try a different search term.' : 'Open the POS to make your first sale, or run Demo Day to preview.'}
                    </div>
                    {!q && (
                      <div className="mt-3 flex gap-2">
                        <a href="/pos" className="btn-primary text-xs px-3 py-1.5">Open POS</a>
                        <a href="/onboarding#demo" className="btn-ghost text-xs px-3 py-1.5 border border-black/10 rounded-lg">Run Demo Day</a>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {sales.map((sale) => (
              <tr key={sale.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-sm">{sale.id.slice(0, 8)}</td>
                <td className="px-3 py-3 text-sm">{formatDateTime(sale.createdAt)}</td>
                <td className="hidden sm:table-cell px-3 py-3 text-sm">{sale.store.name}</td>
                <td className="hidden sm:table-cell px-3 py-3 text-sm">{sale.customer?.name ?? 'Walk-in'}</td>
                <td className="px-3 py-3">
                  <span className={`pill-${sale.paymentStatus.toLowerCase().replace('_', '-')}`}>{sale.paymentStatus.replace('_', ' ')}</span>
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
                  {sale.salesReturn || ['RETURNED', 'VOID'].includes(sale.paymentStatus) ? (
                    <span className="text-xs text-black/40">Returned</span>
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
                      <Link className="btn-ghost text-xs" href={`/sales/return/${sale.id}`}>
                        Return
                      </Link>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          currentPage={page}
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
