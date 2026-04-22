import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import StatCard from '@/components/StatCard';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/format';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { getBusinessStores, resolveStoreSelection } from '@/lib/services/stores';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  SALE: 'Sale',
  SALE_RETURN: 'Sale return',
  PURCHASE: 'Purchase',
  PURCHASE_RETURN: 'Purchase return',
  ADJUSTMENT_INCREASE: 'Adjustment (+)',
  ADJUSTMENT_DECREASE: 'Adjustment (−)',
  ADJUSTMENT: 'Adjustment',
  STOCKTAKE: 'Stocktake',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  OPENING: 'Opening stock',
};

const TYPE_BADGE: Record<string, string> = {
  SALE: 'bg-rose-100 text-rose-700',
  SALE_RETURN: 'bg-amber-100 text-amber-700',
  PURCHASE: 'bg-emerald-100 text-emerald-700',
  PURCHASE_RETURN: 'bg-orange-100 text-orange-700',
  ADJUSTMENT_INCREASE: 'bg-sky-100 text-sky-700',
  ADJUSTMENT_DECREASE: 'bg-red-100 text-red-700',
  ADJUSTMENT: 'bg-slate-100 text-slate-700',
  STOCKTAKE: 'bg-purple-100 text-purple-700',
  TRANSFER_OUT: 'bg-pink-100 text-pink-700',
  TRANSFER_IN: 'bg-teal-100 text-teal-700',
  OPENING: 'bg-indigo-100 text-indigo-700',
};

const MOVEMENT_TYPES = [
  'SALE', 'SALE_RETURN', 'PURCHASE', 'PURCHASE_RETURN',
  'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'ADJUSTMENT',
  'STOCKTAKE', 'TRANSFER_OUT', 'TRANSFER_IN', 'OPENING',
];

function typeLabel(type: string) {
  return MOVEMENT_TYPE_LABELS[type] ?? type;
}

function typeBadge(type: string) {
  return TYPE_BADGE[type] ?? 'bg-gray-100 text-gray-700';
}

export default async function StockMovementsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const params = {
    from: typeof searchParams?.from === 'string' ? searchParams.from : undefined,
    to: typeof searchParams?.to === 'string' ? searchParams.to : undefined,
    storeId: typeof searchParams?.storeId === 'string' ? searchParams.storeId : undefined,
    type: typeof searchParams?.type === 'string' ? searchParams.type : undefined,
    q: typeof searchParams?.q === 'string' ? searchParams.q : undefined,
    page: typeof searchParams?.page === 'string' ? searchParams.page : undefined,
  };

  const { start: from, end: to, fromInputValue: fromIso, toInputValue: toIso } =
    resolveReportDateRange(params, weekAgo, today);
  const { stores } = await getBusinessStores(business.id, params.storeId);
  const selectedStoreId = resolveStoreSelection(stores, params.storeId, 'ALL') ?? 'ALL';

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const typeFilter = params.type && MOVEMENT_TYPES.includes(params.type) ? params.type : undefined;
  const q = params.q?.trim() ?? '';

  const storeIds = stores.map((s) => s.id);
  const storeFilter = selectedStoreId === 'ALL' ? { in: storeIds } : selectedStoreId;

  const where = {
    storeId: storeFilter,
    createdAt: { gte: from, lte: to },
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(q ? { product: { name: { contains: q } } } : {}),
  };

  const [totalCount, movements] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        qtyBase: true,
        beforeQtyBase: true,
        afterQtyBase: true,
        createdAt: true,
        product: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Stock Movements"
        subtitle="Full ledger of every stock change — sales, purchases, adjustments, transfers, and opening stock."
      />

      <details className="details-mobile">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25" />
            </svg>
            Filters
            {(q || typeFilter || fromIso || toIso) && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">Active</span>
            )}
          </span>
          <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="mt-2">
          <ReportFilterCard columnsClassName="sm:grid-cols-5">
            <div>
              <label className="label">Branch</label>
              <select className="input" name="storeId" defaultValue={selectedStoreId}>
                <option value="ALL">All branches</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
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
            <div>
              <label className="label">Movement type</label>
              <select className="input" name="type" defaultValue={typeFilter ?? ''}>
                <option value="">All types</option>
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{typeLabel(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Product</label>
              <input className="input" type="text" name="q" defaultValue={q} placeholder="Search by name…" />
            </div>
          </ReportFilterCard>
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Total movements" value={totalCount.toLocaleString()} />
        <StatCard label="Page" value={`${page} of ${totalPages}`} />
      </div>

      <ReportTableCard title={`Movements${typeFilter ? ` — ${typeLabel(typeFilter)}` : ''}`}>
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-black/40">
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Product</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2 text-right">Qty change</th>
            <th className="px-4 py-2 text-right">Before</th>
            <th className="px-4 py-2 text-right">After</th>
            <th className="px-4 py-2">User</th>
          </tr>
        </thead>
        <tbody>
          {movements.length === 0 ? (
            <ReportTableEmptyRow colSpan={7} message="No stock movements in this period." />
          ) : (
            movements.map((m) => (
              <tr key={m.id} className="border-t border-black/5 hover:bg-black/[0.015] transition-colors">
                <td className="px-4 py-3 text-xs text-black/50 tabular-nums whitespace-nowrap">
                  {formatDateTime(m.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm font-medium">{m.product.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge(m.type)}`}>
                    {typeLabel(m.type)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-right">
                  {m.qtyBase > 0 ? (
                    <span className="font-semibold text-emerald-700">+{m.qtyBase}</span>
                  ) : (
                    <span className="font-semibold text-rose-600">{m.qtyBase}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-right text-black/50">
                  {m.beforeQtyBase ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-right text-black/50">
                  {m.afterQtyBase ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-black/40">{m.user?.name ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/reports/stock-movements"
          searchParams={{
            from: fromIso,
            to: toIso,
            storeId: selectedStoreId,
            type: typeFilter,
            q: q || undefined,
          }}
        />
      )}
    </div>
  );
}
