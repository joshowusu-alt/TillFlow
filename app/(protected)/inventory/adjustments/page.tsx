import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { formatDateTime } from '@/lib/format';
import StockAdjustmentClient from '../StockAdjustmentClient';
import ReverseStockAdjustmentForm from './ReverseStockAdjustmentForm';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

function isIncreaseDirection(direction: string) {
  return direction === 'INCREASE' || direction === 'IN';
}

function isReversal(reason?: string | null) {
  return Boolean(reason?.includes('Reversal of adjustment'));
}

function AdjustmentsEmptyState({ q }: { q?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-7 text-center">
      <div className="text-sm font-semibold text-ink">
        {q ? `No adjustments matching "${q}".` : 'No stock adjustments yet.'}
      </div>
      <div className="mt-1 text-sm text-black/55">
        {q
          ? 'Try a different search term.'
          : 'When stock needs correcting, record an adjustment so TillFlow keeps a clear audit trail.'}
      </div>
    </div>
  );
}

export default async function StockAdjustmentsPage({
  searchParams,
}: {
  searchParams?: { page?: string; reversed?: string; error?: string };
}) {
  const { user, business, store } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !store) {
    return <div className="card p-6">Seed data missing.</div>;
  }

  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);
  const canReverseAdjustments = user.role === 'OWNER';

  const [products, adjustmentCount, adjustments] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        productUnits: {
          select: {
            unitId: true,
            isBaseUnit: true,
            conversionToBase: true,
            unit: { select: { name: true, pluralName: true } }
          }
        },
        inventoryBalances: {
          where: { storeId: store.id },
          select: { qtyOnHandBase: true }
        }
      }
    }),
    prisma.stockAdjustment.count({
      where: { storeId: store.id },
    }),
    prisma.stockAdjustment.findMany({
      where: { storeId: store.id },
      select: {
        id: true,
        createdAt: true,
        qtyBase: true,
        direction: true,
        reason: true,
        product: {
          select: {
            name: true,
            productUnits: {
              select: {
                isBaseUnit: true,
                conversionToBase: true,
                unit: { select: { name: true, pluralName: true } }
              }
            }
          }
        },
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(adjustmentCount / PAGE_SIZE));
  const adjustmentRows = adjustments.map((adjustment) => {
    const baseUnit = adjustment.product.productUnits.find((unit) => unit.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(
      adjustment.product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
    );
    const formatted = formatMixedUnit({
      qtyBase: Math.abs(adjustment.qtyBase),
      baseUnit: baseUnit?.unit.name ?? 'unit',
      baseUnitPlural: baseUnit?.unit.pluralName,
      packagingUnit: packaging?.unit.name,
      packagingUnitPlural: packaging?.unit.pluralName,
      packagingConversion: packaging?.conversionToBase
    });

    return {
      adjustment,
      formatted,
    };
  });
  const countIn = adjustmentRows.filter(({ adjustment }) => isIncreaseDirection(adjustment.direction)).length;
  const countOut = adjustmentRows.filter(({ adjustment }) => !isIncreaseDirection(adjustment.direction)).length;
  const isPaginated = adjustmentRows.length < adjustmentCount;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Stock Adjustments" subtitle="Correct stock safely and keep a clear audit trail." />

      {searchParams?.reversed === '1' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Stock adjustment reversed with an audited opposite entry.
        </div>
      ) : null}
      {searchParams?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          Could not reverse adjustment: {searchParams.error.replace(/-/g, ' ')}.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Recorded</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-ink">{adjustmentCount}</div>
          <div className="mt-1 text-xs text-black/50">Total adjustments</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700/70">Added</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">{countIn}</div>
          <div className="mt-1 text-xs text-emerald-600/70">{isPaginated ? 'On this page' : 'Stock increases'}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700/70">Removed</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-rose-700">{countOut}</div>
          <div className="mt-1 text-xs text-rose-600/70">{isPaginated ? 'On this page' : 'Stock decreases'}</div>
        </div>
      </div>

      <div className="card p-4 sm:p-6">
        <StockAdjustmentClient
          storeId={store.id}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            onHandBase: product.inventoryBalances[0]?.qtyOnHandBase ?? 0,
            units: product.productUnits.map((pu) => ({
              id: pu.unitId,
              name: pu.unit.name,
              pluralName: pu.unit.pluralName,
              conversionToBase: pu.conversionToBase,
              isBaseUnit: pu.isBaseUnit
            }))
          }))}
        />
      </div>

      <div className="card p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold">Recent adjustments</h2>
            <p className="mt-1 text-sm text-black/55">Every adjustment is permanently recorded. Owners can reverse any entry, which adds an audited opposite entry.</p>
          </div>
          <div className="text-xs text-black/45 sm:flex-shrink-0">{adjustmentCount} total records</div>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 lg:hidden">
          {adjustmentRows.length === 0 ? (
            <AdjustmentsEmptyState />
          ) : (
            adjustmentRows.map(({ adjustment, formatted }) => (
              <div
                key={adjustment.id}
                className="rounded-2xl border border-black/5 bg-white px-4 py-4 shadow-sm transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">{adjustment.product.name}</div>
                    <div className="mt-1 text-sm text-black/60">{formatDateTime(adjustment.createdAt)}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isIncreaseDirection(adjustment.direction) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {adjustment.direction}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Quantity</div>
                    <div className="mt-1 text-black/70">{formatted}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">User</div>
                    <div className="mt-1 text-black/70">{adjustment.user.name ?? 'Unknown'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Reason</div>
                    <div className="mt-1 text-black/70">{adjustment.reason ?? 'No reason provided'}</div>
                  </div>
                </div>
                {canReverseAdjustments ? (
                  <div className="mt-4 border-t border-black/5 pt-3">
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-black/40">Owner action</div>
                    <ReverseStockAdjustmentForm
                      adjustmentId={adjustment.id}
                      disabled={isReversal(adjustment.reason)}
                    />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
        <div className="responsive-table-shell mt-4 hidden lg:block">
          <table className="table w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Direction</th>
                <th>Reason</th>
                <th>User</th>
                {canReverseAdjustments ? <th>Owner action</th> : null}
              </tr>
            </thead>
            <tbody>
              {adjustmentRows.length === 0 ? (
                <tr>
                  <td colSpan={canReverseAdjustments ? 7 : 6} className="px-3 py-12 text-center">
                    <AdjustmentsEmptyState />
                  </td>
                </tr>
              ) : (
                adjustmentRows.map(({ adjustment, formatted }) => (
                  <tr
                    key={adjustment.id}
                    className="rounded-xl bg-white transition-all duration-150 hover:-translate-y-px hover:bg-slate-50 hover:shadow-card motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    <td className="px-3 py-3 text-sm">{formatDateTime(adjustment.createdAt)}</td>
                    <td className="px-3 py-3 text-sm font-semibold">{adjustment.product.name}</td>
                    <td className="px-3 py-3 text-sm">{formatted}</td>
                    <td className="px-3 py-3 text-sm">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isIncreaseDirection(adjustment.direction) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {adjustment.direction}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm">{adjustment.reason ?? '-'}</td>
                    <td className="px-3 py-3 text-sm">{adjustment.user.name ?? 'Unknown'}</td>
                    {canReverseAdjustments ? (
                      <td className="px-3 py-3 text-sm">
                        <ReverseStockAdjustmentForm
                          adjustmentId={adjustment.id}
                          disabled={isReversal(adjustment.reason)}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/inventory/adjustments"
        />
      </div>
    </div>
  );
}
