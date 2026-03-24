import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { formatMoney } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import {
  getReconciliationSummary,
  getPaymentTransactions,
} from '@/app/actions/reconciliation';
import {
  ReconcileForm,
  TransactionDrillDown,
} from './ReconciliationClient';

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export default async function CardTransferReconciliationPage({
  searchParams,
}: {
  searchParams?: {
    error?: string;
    from?: string;
    to?: string;
    storeId?: string;
    detail?: string; // "2025-03-20|CARD" for drill-down
  };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const from = parseDate(searchParams?.from, weekAgo);
  const to = parseDate(searchParams?.to, today);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const selectedStoreId =
    searchParams?.storeId && stores.some((s) => s.id === searchParams.storeId)
      ? searchParams.storeId
      : undefined;
  const displayStoreId = selectedStoreId ?? 'ALL';

  // Fetch reconciliation summary
  const summaryResult = await getReconciliationSummary({
    from,
    to: toEnd,
    storeId: selectedStoreId,
  });
  const rows = summaryResult.success ? summaryResult.data : [];

  // Compute summary stats
  const cardSystemTotal = rows
    .filter((r) => r.method === 'CARD')
    .reduce((sum, r) => sum + r.systemTotalPence, 0);
  const transferSystemTotal = rows
    .filter((r) => r.method === 'TRANSFER')
    .reduce((sum, r) => sum + r.systemTotalPence, 0);
  const reconciledCount = rows.filter((r) => r.status === 'RECONCILED').length;
  const pendingCount = rows.filter((r) => r.status === 'PENDING').length;
  const discrepancyCount = rows.filter((r) => r.status === 'DISCREPANCY').length;

  // Drill-down: parse detail param (date|method)
  let drillDownTransactions: Awaited<ReturnType<typeof getPaymentTransactions>> | null = null;
  let drillDate = '';
  let drillMethod = '';
  if (searchParams?.detail) {
    const [d, m] = searchParams.detail.split('|');
    if (d && m) {
      drillDate = d;
      drillMethod = m;
      drillDownTransactions = await getPaymentTransactions({
        date: new Date(d),
        method: m,
        storeId: selectedStoreId,
      });
    }
  }

  // For reconcile forms, pick the first store if only one
  const resolvedStoreId = selectedStoreId ?? stores[0]?.id ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Card & Transfer Reconciliation"
        subtitle="Match card/transfer sales against bank & POS terminal statements."
      />

      {/* Filters */}
      <form className="card grid gap-3 p-4 sm:grid-cols-4" method="GET">
        <div>
          <label className="label">Branch</label>
          <select className="input" name="storeId" defaultValue={displayStoreId}>
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
          <input
            className="input"
            type="date"
            name="from"
            defaultValue={from.toISOString().slice(0, 10)}
          />
        </div>
        <div>
          <label className="label">To</label>
          <input
            className="input"
            type="date"
            name="to"
            defaultValue={to.toISOString().slice(0, 10)}
          />
        </div>
        <div className="flex items-end">
          <button className="btn-secondary w-full" type="submit">
            Apply
          </button>
        </div>
      </form>

      {/* Error */}
      {searchParams?.error ? (
        <div className="rounded-xl border border-rose/30 bg-rose/10 px-4 py-3 text-sm text-rose">
          {searchParams.error}
        </div>
      ) : null}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="card p-4">
          <div className="text-xs text-black/50">Card Total (system)</div>
          <div className="text-2xl font-semibold text-blue-700">
            {formatMoney(cardSystemTotal, business.currency)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Transfer Total (system)</div>
          <div className="text-2xl font-semibold text-purple-700">
            {formatMoney(transferSystemTotal, business.currency)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Reconciled</div>
          <div className="text-2xl font-semibold text-emerald-700">{reconciledCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Pending</div>
          <div className="text-2xl font-semibold text-amber-700">{pendingCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Discrepancy</div>
          <div className="text-2xl font-semibold text-rose">{discrepancyCount}</div>
        </div>
      </div>

      {/* How it works */}
      <details className="card">
        <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 text-sm font-semibold select-none hover:bg-black/[.02] transition rounded-xl">
          <svg className="h-5 w-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          How Card &amp; Transfer Reconciliation Works
          <svg className="ml-auto h-4 w-4 text-black/30 transition-transform [[open]>&]:rotate-90" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </summary>
        <div className="border-t border-black/5 px-5 py-4 text-sm text-black/70 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { step: '1', title: 'Sell', desc: 'Cashier records a card or bank transfer payment at the POS during checkout.' },
              { step: '2', title: 'Collect Statements', desc: 'At end of day, get your POS terminal printout or check your bank statement for the totals.' },
              { step: '3', title: 'Enter Actual Amount', desc: 'Click "Reconcile" and enter the actual total from your statement for each date and method.' },
              { step: '4', title: 'Review Variance', desc: 'The system calculates the difference. Zero variance = Reconciled. Any difference = Discrepancy to investigate.' },
            ].map((s) => (
              <div key={s.step} className="flex gap-3 rounded-lg bg-black/[.02] p-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                  {s.step}
                </div>
                <div>
                  <div className="font-semibold text-xs">{s.title}</div>
                  <div className="text-xs text-black/50 mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* Main reconciliation table */}
      <div className="card overflow-x-auto p-4">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Date</th>
              <th>Method</th>
              <th>System Total</th>
              <th>Actual Total</th>
              <th>Variance</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const methodTone =
                row.method === 'CARD'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700';
              const statusTone =
                row.status === 'RECONCILED'
                  ? 'bg-emerald-100 text-emerald-700'
                  : row.status === 'DISCREPANCY'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-amber-100 text-amber-800';
              const varianceColor =
                row.variancePence === null
                  ? 'text-black/40'
                  : row.variancePence === 0
                    ? 'text-emerald-700'
                    : row.variancePence > 0
                      ? 'text-accent'
                      : 'text-rose';
              const detailKey = `${row.date}|${row.method}`;
              const isDetailOpen = searchParams?.detail === detailKey;

              return (
                <tr key={detailKey} className="rounded-xl bg-white align-top">
                  <td className="px-3 py-3 text-sm">
                    <Link
                      className="text-emerald-700 hover:underline"
                      href={`/payments/reconciliation/card-transfer?from=${searchParams?.from ?? from.toISOString().slice(0, 10)}&to=${searchParams?.to ?? to.toISOString().slice(0, 10)}&storeId=${displayStoreId}&detail=${detailKey}`}
                    >
                      {row.date}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`pill ${methodTone}`}>
                      {row.method === 'CARD' ? 'Card' : 'Transfer'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(row.systemTotalPence, business.currency)}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {row.actualTotalPence !== null
                      ? formatMoney(row.actualTotalPence, business.currency)
                      : <span className="text-black/40">—</span>}
                  </td>
                  <td className={`px-3 py-3 text-sm font-semibold ${varianceColor}`}>
                    {row.variancePence !== null
                      ? formatMoney(row.variancePence, business.currency)
                      : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`pill ${statusTone}`}>{row.status}</span>
                  </td>
                  <td className="px-3 py-3">
                    <ReconcileForm
                      date={row.date}
                      method={row.method}
                      storeId={resolvedStoreId}
                      systemTotalPence={row.systemTotalPence}
                      currency={business.currency}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-black/50">
                  No card or transfer payments found for this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Drill-down panel */}
      {drillDownTransactions && drillDownTransactions.success ? (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {drillMethod === 'CARD' ? 'Card' : 'Transfer'} Transactions — {drillDate}
            </h3>
            <Link
              className="btn-ghost text-xs"
              href={`/payments/reconciliation/card-transfer?from=${searchParams?.from ?? from.toISOString().slice(0, 10)}&to=${searchParams?.to ?? to.toISOString().slice(0, 10)}&storeId=${displayStoreId}`}
            >
              Close
            </Link>
          </div>
          <TransactionDrillDown
            transactions={drillDownTransactions.data}
            currency={business.currency}
          />
        </div>
      ) : null}
    </div>
  );
}
