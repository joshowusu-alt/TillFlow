import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { formatDateTime, formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';
import { resolveSoleOrSelectedStoreId, withStoreQuery } from '@/lib/reliability/selected-store';
import SelectedStorePicker from '@/components/SelectedStorePicker';
import {
  CASH_DRAWER_DRILLDOWN_ORDER,
  CASH_DRAWER_ENTRY_LABELS,
  isCashDrawerDrilldownType,
  listCashDrawerSupportingRows,
  type CashDrawerEntryType,
} from '@/lib/services/cash-drawer';
import { prisma } from '@/lib/prisma';

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function endOfDay(value: Date): Date {
  const end = new Date(value);
  end.setHours(23, 59, 59, 999);
  return end;
}

function hrefWith(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/shifts/drawer?${qs}` : '/shifts/drawer';
}

export default async function CashDrawerDrilldownPage({
  searchParams,
}: {
  searchParams?: {
    type?: string;
    from?: string;
    to?: string;
    tillId?: string;
    shiftId?: string;
    storeId?: string;
  };
}) {
  const { business } = await requireBusiness();
  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const selectedStoreId = resolveSoleOrSelectedStoreId(stores, searchParams?.storeId);
  const store = stores.find((row) => row.id === selectedStoreId) ?? null;
  if (!store) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="Cash drawer supporting rows"
          subtitle="Select a store before reviewing drawer rows. TillFlow will not default to the first store."
          secondaryCta={{ label: 'Back to shifts', href: '/shifts' }}
        />
        <div className="card p-5">
          <SelectedStorePicker stores={stores} selectedStoreId={selectedStoreId} action="/shifts/drawer" />
        </div>
      </div>
    );
  }
  const requestedType = searchParams?.type;
  const entryType: CashDrawerEntryType = isCashDrawerDrilldownType(requestedType)
    ? requestedType
    : 'CASH_SALE';
  const from = parseDate(searchParams?.from);
  const to = parseDate(searchParams?.to);
  const tillId = searchParams?.tillId || null;
  const shiftId = searchParams?.shiftId || null;

  const tills = await prisma.till.findMany({
    where: { storeId: store.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const rows = await listCashDrawerSupportingRows({
    businessId: business.id,
    storeId: store.id,
    tillId,
    shiftId,
    entryType,
    from,
    to: to ? endOfDay(to) : null,
  });

  const fromValue = searchParams?.from ?? '';
  const toValue = searchParams?.to ?? '';
  const scope = {
    from: fromValue,
    to: toValue,
    tillId: tillId ?? undefined,
    shiftId: shiftId ?? undefined,
    storeId: store.id,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Cash drawer supporting rows"
        subtitle="Each cash event writes one drawer row. Totals stay scoped by date, till, and shift."
        secondaryCta={{ label: 'Back to shifts', href: withStoreQuery('/shifts', store.id) }}
      />

      <div className="card p-4">
        <SelectedStorePicker stores={stores} selectedStoreId={store.id} action="/shifts/drawer" />
      </div>

      <form className="card grid gap-3 p-4 sm:grid-cols-5" method="GET">
        <input type="hidden" name="storeId" value={store.id} />
        <div>
          <label className="label">Type</label>
          <select className="input" name="type" defaultValue={entryType}>
            {CASH_DRAWER_DRILLDOWN_ORDER.map((type) => (
              <option key={type} value={type}>
                {CASH_DRAWER_ENTRY_LABELS[type] ?? type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromValue} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toValue} />
        </div>
        <div>
          <label className="label">Till</label>
          <select className="input" name="tillId" defaultValue={tillId ?? ''}>
            <option value="">All tills</option>
            {tills.map((till) => (
              <option key={till.id} value={till.id}>
                {till.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Shift</label>
          <input className="input" name="shiftId" defaultValue={shiftId ?? ''} placeholder="Optional shift id" />
        </div>
        <div className="sm:col-span-5">
          <button className="btn-secondary" type="submit">
            Apply
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {CASH_DRAWER_DRILLDOWN_ORDER.map((type) => (
          <Link
            key={type}
            href={hrefWith({ ...scope, type })}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              type === entryType ? 'bg-ink text-white' : 'bg-black/5 text-black/60'
            }`}
          >
            {CASH_DRAWER_ENTRY_LABELS[type] ?? type}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden p-4">
        <h2 className="text-base font-display font-semibold">
          {CASH_DRAWER_ENTRY_LABELS[entryType] ?? entryType}
        </h2>
        <p className="mt-1 text-sm text-black/55">{rows.length} supporting row{rows.length === 1 ? '' : 's'}</p>
        {rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-black/50">
            No drawer rows for this type in the current scope.
          </div>
        ) : (
          <div className="responsive-table-shell mt-4">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Till</th>
                  <th>Cashier</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">{row.tillName}</td>
                    <td className="px-3 py-2">{row.cashierName ?? '—'}</td>
                    <td className="px-3 py-2 font-semibold">{formatMoney(row.amountPence, business.currency)}</td>
                    <td className="px-3 py-2">{row.reason ?? row.reasonCode ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-black/50">
                      {row.referenceType && row.referenceId
                        ? `${row.referenceType} · ${row.referenceId.slice(-8)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
