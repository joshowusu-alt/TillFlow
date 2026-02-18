import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { formatDateTime, formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export default async function CashDrawerReportPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const from = parseDate(searchParams?.from, weekAgo);
  const to = parseDate(searchParams?.to, today);
  to.setHours(23, 59, 59, 999);
  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const selectedStoreId =
    searchParams?.storeId && stores.some((store) => store.id === searchParams.storeId)
      ? searchParams.storeId
      : 'ALL';

  const shifts = await prisma.shift.findMany({
    where: {
      till: {
        store: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { id: selectedStoreId }),
        },
      },
      openedAt: { gte: from, lte: to },
    },
    orderBy: { openedAt: 'desc' },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      status: true,
      openingCashPence: true,
      expectedCashPence: true,
      actualCashPence: true,
      variance: true,
      till: {
        select: {
          name: true,
          store: { select: { name: true } },
        },
      },
      user: { select: { name: true } },
      closeManagerApprovedBy: { select: { name: true } },
    },
  });

  const totalExpected = shifts.reduce((sum, shift) => sum + shift.expectedCashPence, 0);
  const totalActual = shifts.reduce((sum, shift) => sum + (shift.actualCashPence ?? 0), 0);
  const totalVariance = shifts.reduce((sum, shift) => sum + (shift.variance ?? 0), 0);

  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Drawer Report"
        subtitle="Daily cash summary by branch/store, till and cashier."
      />

      <form className="card grid gap-3 p-4 sm:grid-cols-5" method="GET">
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
          <input className="input" type="date" name="from" defaultValue={fromIso} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toIso} />
        </div>
        <div className="flex items-end">
          <button className="btn-secondary w-full" type="submit">
            Apply
          </button>
        </div>
        <div className="flex items-end gap-2">
          <Link
            href={`/exports/eod-csv?from=${fromIso}&to=${toIso}&storeId=${selectedStoreId}`}
            className="btn-ghost w-full text-center text-xs"
          >
            Export CSV
          </Link>
          <Link
            href={`/exports/eod-pdf?from=${fromIso}&to=${toIso}&storeId=${selectedStoreId}`}
            className="btn-ghost w-full text-center text-xs"
          >
            Export PDF
          </Link>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-black/50">Expected Cash</div>
          <div className="text-2xl font-semibold">{formatMoney(totalExpected, business.currency)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Counted Cash</div>
          <div className="text-2xl font-semibold">{formatMoney(totalActual, business.currency)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Variance</div>
          <div
            className={`text-2xl font-semibold ${totalVariance === 0 ? '' : totalVariance > 0 ? 'text-blue-700' : 'text-rose'}`}
          >
            {formatMoney(totalVariance, business.currency)}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto p-4">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Date</th>
              <th>Branch</th>
              <th>Till</th>
              <th>Cashier</th>
              <th>Expected</th>
              <th>Counted</th>
              <th>Variance</th>
              <th>Approved By</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-xs">{formatDateTime(shift.openedAt)}</td>
                <td className="px-3 py-3 text-sm">{shift.till.store.name}</td>
                <td className="px-3 py-3 text-sm">{shift.till.name}</td>
                <td className="px-3 py-3 text-sm">{shift.user.name}</td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {formatMoney(shift.expectedCashPence, business.currency)}
                </td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {shift.actualCashPence !== null
                    ? formatMoney(shift.actualCashPence, business.currency)
                    : '-'}
                </td>
                <td className="px-3 py-3 text-sm">
                  {shift.variance !== null ? (
                    <span
                      className={
                        shift.variance === 0
                          ? 'text-emerald-700'
                          : shift.variance > 0
                            ? 'text-blue-700'
                            : 'text-rose'
                      }
                    >
                      {formatMoney(shift.variance, business.currency)}
                    </span>
                  ) : (
                    <span className="text-black/40">-</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  {shift.closeManagerApprovedBy?.name ?? (shift.status === 'OPEN' ? 'Open' : 'N/A')}
                </td>
              </tr>
            ))}
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-black/50">
                  No shifts found in this date range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
