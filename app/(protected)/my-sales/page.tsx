import Link from 'next/link';
import { redirect } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { DataCard, DataCardField, DataCardHeader } from '@/components/DataCard';
import {
  buildCashierMySalesWhere,
  CASHIER_MY_SALES_ROUTE,
  summarizePaymentMethods,
} from '@/lib/services/cashier-my-sales';

function formatPaymentLabel(method: string) {
  return method.replace(/_/g, ' ');
}

export default async function MySalesPage({
  searchParams,
}: {
  searchParams?: { page?: string; from?: string; to?: string };
}) {
  const { user, business } = await requireBusiness(['CASHIER', 'MANAGER', 'OWNER']);

  if (user.role !== 'CASHIER') {
    redirect('/sales');
  }

  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup to get started.</div>
      </div>
    );
  }

  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const todayIso = new Date().toISOString().slice(0, 10);
  const fromParam = searchParams?.from ?? '';
  const toParam = searchParams?.to ?? todayIso;

  const where = buildCashierMySalesWhere({
    businessId: business.id,
    cashierUserId: user.id,
    from: fromParam || undefined,
    to: toParam || undefined,
  });

  const [totalCount, sales] = await Promise.all([
    prisma.salesInvoice.count({ where }),
    prisma.salesInvoice.findMany({
      where,
      select: {
        id: true,
        transactionNumber: true,
        createdAt: true,
        paymentStatus: true,
        totalPence: true,
        store: { select: { name: true } },
        shift: { select: { till: { select: { name: true } } } },
        payments: { select: { method: true, amountPence: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="My Sales"
        subtitle="Sales you recorded on the till. Read-only — ask a manager for returns or changes."
        actions={<RefreshIndicator fetchedAt={new Date().toISOString()} />}
      />

      <details className="details-mobile" open>
        <summary className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25" />
            </svg>
            Date range
            {(fromParam || (toParam && toParam !== todayIso)) ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">Active</span>
            ) : null}
          </span>
          <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="mt-2 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">From</label>
              <input className="input" type="date" name="from" defaultValue={fromParam} />
            </div>
            <div>
              <label className="label">To</label>
              <input className="input" type="date" name="to" defaultValue={toParam} />
            </div>
            <button className="btn-secondary" type="submit">
              Apply
            </button>
            {(fromParam || toParam) ? (
              <a
                href={CASHIER_MY_SALES_ROUTE}
                className="self-center text-xs text-muted underline underline-offset-2 hover:text-primary"
              >
                Clear filter
              </a>
            ) : null}
          </form>
        </div>
      </details>

      <div className="card p-4 sm:p-5">
        <div className="space-y-3">
          {sales.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6 text-center">
              <div className="flex flex-col items-center animate-fade-in-up">
                <div className="mb-2 rounded-full bg-black/5 p-3">
                  <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z"
                    />
                  </svg>
                </div>
                <div className="text-sm text-black/70">
                  {fromParam || toParam ? 'No sales in this date range.' : 'No sales recorded yet.'}
                </div>
                <div className="mt-1 text-xs text-black/40">
                  Your sales will appear here after you complete a sale on POS.
                </div>
                <a href="/pos" className="btn-primary mt-3 px-3 py-1.5 text-xs">
                  Open POS
                </a>
              </div>
            </div>
          ) : (
            sales.map((sale) => {
              const receiptRef = sale.transactionNumber ?? `#${sale.id.slice(0, 8).toUpperCase()}`;
              const paymentSummary = summarizePaymentMethods(sale.payments)
                .map(({ method }) => formatPaymentLabel(method))
                .join(', ');

              return (
                <DataCard key={sale.id}>
                  <DataCardHeader
                    title={
                      <Link href={`/receipts/${sale.id}`} className="font-mono text-primary hover:underline">
                        {receiptRef}
                      </Link>
                    }
                    subtitle={sale.store.name}
                    aside={
                      <span className={`pill-${sale.paymentStatus.toLowerCase().replace('_', '-')}`}>
                        {sale.paymentStatus.replace('_', ' ')}
                      </span>
                    }
                  />
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <DataCardField
                      label="Date"
                      value={
                        <span className="text-black/65">
                          {sale.createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{' '}
                          {sale.createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      }
                    />
                    <DataCardField
                      label="Total"
                      value={<span className="font-semibold text-ink">{formatMoney(sale.totalPence, business.currency)}</span>}
                    />
                    <DataCardField
                      label="Payment"
                      value={<span className="text-black/65">{paymentSummary || '—'}</span>}
                    />
                    <DataCardField
                      label="Till"
                      value={<span className="text-black/65">{sale.shift?.till?.name ?? '—'}</span>}
                    />
                  </div>
                  <div className="mt-4">
                    <Link className="btn-ghost text-xs" href={`/receipts/${sale.id}`}>
                      View receipt
                    </Link>
                  </div>
                </DataCard>
              );
            })
          )}
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath={CASHIER_MY_SALES_ROUTE}
          searchParams={{
            from: fromParam || undefined,
            to: toParam || undefined,
          }}
        />
      </div>
    </div>
  );
}
