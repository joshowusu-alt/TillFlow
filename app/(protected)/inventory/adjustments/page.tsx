import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { formatDateTime } from '@/lib/format';
import StockAdjustmentClient from '../StockAdjustmentClient';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function StockAdjustmentsPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const { business, store } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !store) {
    return <div className="card p-6">Seed data missing.</div>;
  }

  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

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
  const countIn = adjustmentRows.filter(({ adjustment }) => adjustment.direction === 'IN').length;
  const countOut = adjustmentRows.filter(({ adjustment }) => adjustment.direction !== 'IN').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Adjustments" subtitle="Record shrinkage, found stock, and corrections." />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Recorded</div>
          <div className="mt-1 text-2xl font-display font-semibold text-ink">{adjustmentCount}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-700/70">Added</div>
          <div className="mt-1 text-2xl font-display font-semibold text-emerald-700">{countIn}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-rose-700/70">Removed</div>
          <div className="mt-1 text-2xl font-display font-semibold text-rose-700">{countOut}</div>
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
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold">Recent adjustments</h2>
            <p className="text-sm text-black/55">Latest stock corrections, shrinkage, and found stock entries for this branch.</p>
          </div>
          <div className="text-xs text-black/45">{adjustmentCount} total records</div>
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          {adjustmentRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6 text-sm text-black/50">
              No stock adjustments recorded yet.
            </div>
          ) : (
            adjustmentRows.map(({ adjustment, formatted }) => (
              <div key={adjustment.id} className="rounded-2xl border border-black/5 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">{adjustment.product.name}</div>
                    <div className="mt-1 text-sm text-black/60">{formatDateTime(adjustment.createdAt)}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${adjustment.direction === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
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
              </div>
            ))
          )}
        </div>

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
            </tr>
          </thead>
          <tbody>
            {adjustmentRows.map(({ adjustment, formatted }) => {
              return (
                <tr key={adjustment.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm">{formatDateTime(adjustment.createdAt)}</td>
                  <td className="px-3 py-3 text-sm font-semibold">{adjustment.product.name}</td>
                  <td className="px-3 py-3 text-sm">{formatted}</td>
                  <td className="px-3 py-3 text-sm">
                    <span className="pill bg-black/5 text-black/60">{adjustment.direction}</span>
                  </td>
                  <td className="px-3 py-3 text-sm">{adjustment.reason ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{adjustment.user.name ?? 'Unknown'}</td>
                </tr>
              );
            })}
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
