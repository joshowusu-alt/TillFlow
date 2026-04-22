import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMoney, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function InventoryPage({ searchParams }: { searchParams?: { q?: string; page?: string } }) {
  const { business, store } = await requireBusinessStore(['MANAGER', 'OWNER']);
  if (!business || !store) {
    return <div className="card p-6">Seed data missing.</div>;
  }

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const where = {
    businessId: business.id,
    active: true,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const [totalCount, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        reorderPointBase: true,
        defaultCostBasePence: true,
        productUnits: {
          select: {
            isBaseUnit: true,
            conversionToBase: true,
            unit: { select: { name: true, pluralName: true } }
          }
        },
        inventoryBalances: {
          where: { storeId: store.id },
          select: { qtyOnHandBase: true, avgCostBasePence: true }
        }
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));
  const inventoryRows = products.map((product) => {
    const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(
      product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
    );
    const balance = product.inventoryBalances[0];
    const qtyOnHand = balance?.qtyOnHandBase ?? 0;
    const avgCostBase = balance?.avgCostBasePence ?? product.defaultCostBasePence;
    const hasCostDrift = balance?.avgCostBasePence != null && balance.avgCostBasePence !== product.defaultCostBasePence;
    const formatted = formatMixedUnit({
      qtyBase: qtyOnHand,
      baseUnit: baseUnit?.unit.name ?? 'unit',
      baseUnitPlural: baseUnit?.unit.pluralName,
      packagingUnit: packaging?.unit.name,
      packagingUnitPlural: packaging?.unit.pluralName,
      packagingConversion: packaging?.conversionToBase
    });
    const isLow = product.reorderPointBase > 0 && qtyOnHand <= product.reorderPointBase;
    const isOut = qtyOnHand <= 0;

    return {
      product,
      baseUnit,
      packaging,
      qtyOnHand,
      avgCostBase,
      hasCostDrift,
      formatted,
      isLow,
      isOut,
    };
  });
  const outOfStockCount = inventoryRows.filter((row) => row.isOut).length;
  const lowStockCount = inventoryRows.filter((row) => row.isLow && !row.isOut).length;
  const costDriftCount = inventoryRows.filter((row) => row.hasCostDrift).length;
  const healthyCount = Math.max(0, inventoryRows.length - outOfStockCount - lowStockCount);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Inventory"
        subtitle="Real-time balances in mixed units."
        actions={<RefreshIndicator fetchedAt={new Date().toISOString()} />}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Products</div>
          <div className="mt-1 text-2xl font-display font-semibold text-ink">{totalCount}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-700/70">Low stock</div>
          <div className="mt-1 text-2xl font-display font-semibold text-amber-800">{lowStockCount}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-rose-700/70">Out of stock</div>
          <div className="mt-1 text-2xl font-display font-semibold text-rose-700">{outOfStockCount}</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-sky-700/70">Cost drift</div>
          <div className="mt-1 text-2xl font-display font-semibold text-sky-800">{costDriftCount}</div>
        </div>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full max-w-xl">
          <Suspense><SearchFilter placeholder="Search products…" /></Suspense>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-shrink-0">
          <Link className="btn-secondary w-full text-center text-xs sm:w-auto" href="/inventory/stocktake">
            Stocktake
          </Link>
          <Link className="btn-secondary w-full text-center text-xs sm:w-auto" href="/inventory/adjustments">
            Record adjustment
          </Link>
        </div>
      </div>
      <div className="card p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-semibold">Current stock</h2>
            <p className="mt-1 text-sm text-black/55">
              {healthyCount} healthy, {lowStockCount} low, {outOfStockCount} out of stock, {costDriftCount} with cost drift.
            </p>
          </div>
        </div>

        {costDriftCount > 0 ? (
          <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p className="font-semibold">Some inventory balances still differ from the current product base cost.</p>
            <p className="mt-1 text-sky-800">
              Sales and margin reports will continue using the inventory average cost until those balances are repaired or replaced by new authoritative inbound stock.
              <Link href="/settings/data-repair" className="ml-1 font-medium underline">
                Open Data Repair
              </Link>
            </p>
          </div>
        ) : null}

        <div className="space-y-3 lg:hidden">
          {inventoryRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6 text-sm text-black/50">
              No products found.
            </div>
          ) : (
            inventoryRows.map(({ product, baseUnit, packaging, formatted, avgCostBase, hasCostDrift, isLow, isOut }) => (
              <div
                key={product.id}
                className={`rounded-2xl border px-4 py-4 shadow-sm ${isOut ? 'border-rose-200 bg-rose-50' : isLow ? 'border-amber-200 bg-amber-50' : 'border-black/5 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">{product.name}</div>
                    <div className="mt-1 text-sm text-black/60">On hand: <span className="font-semibold text-black/75">{formatted}</span></div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isOut ? 'bg-rose-100 text-rose-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {isOut ? 'Out of stock' : isLow ? 'Low stock' : 'OK'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Avg cost</div>
                    <div className="mt-1 font-semibold text-ink">{formatMoney(avgCostBase, business.currency)}</div>
                    {hasCostDrift ? (
                      <div className="mt-1 text-xs font-medium text-sky-700">
                        Default cost is {formatMoney(product.defaultCostBasePence, business.currency)}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Base unit</div>
                    <div className="mt-1 text-black/65">{baseUnit?.unit.name ?? '-'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Packaging</div>
                    <div className="mt-1 text-black/65">
                      {packaging ? `${packaging.unit.name} (${packaging.conversionToBase} base)` : 'No pack/carton unit set'}
                    </div>
                  </div>
                  {hasCostDrift ? (
                    <div className="col-span-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                      Inventory is still carrying an older average cost, so profitability may look wrong until repaired.
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="responsive-table-shell hidden lg:block">
          <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Product</th>
              <th>On Hand</th>
              <th>Avg Cost (Base)</th>
              <th>Default Cost</th>
              <th>Base Unit</th>
              <th>Packaging Unit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {inventoryRows.map(({ product, baseUnit, packaging, formatted, avgCostBase, hasCostDrift, isLow, isOut }) => {
              return (
                <tr key={product.id} className={`rounded-xl ${isOut ? 'bg-rose-50' : isLow ? 'bg-amber-50' : 'bg-white'}`}>
                  <td className="px-3 py-3 font-semibold">{product.name}</td>
                  <td className={`px-3 py-3 font-semibold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-700' : ''}`}>{formatted}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(avgCostBase, business.currency)}
                  </td>
                  <td className={`px-3 py-3 text-sm ${hasCostDrift ? 'font-semibold text-sky-700' : 'text-black/60'}`}>
                    {formatMoney(product.defaultCostBasePence, business.currency)}
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{baseUnit?.unit.name ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-black/60">
                    {packaging ? `${packaging.unit.name} (${packaging.conversionToBase} base)` : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {hasCostDrift ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">Cost drift</span>
                    ) : isOut ? (
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">Out of stock</span>
                    ) : isLow ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Low stock</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/inventory" searchParams={{ q: q || undefined }} />
      </div>
    </div>
  );
}
