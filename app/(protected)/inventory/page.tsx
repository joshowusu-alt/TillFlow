import { inventoryAvailability } from '@/lib/food/inventory-presentation';
import { dishSettingsHref, isFoodBusiness } from '@/lib/food/business';
import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import SelectOperationalStoreNotice from '@/components/SelectOperationalStoreNotice';
import { formatMoney, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { rowsForListPage } from '@/lib/pagination';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import Link from 'next/link';
import { Suspense } from 'react';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

function InventoryEmptyState({ q, totalCount }: { q: string; totalCount: number }) {
  if (totalCount > 0) return null;
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-7 text-center">
      <div className="text-sm font-semibold text-ink">
        {q ? `No products matching "${q}".` : 'No stock items yet.'}
      </div>
      <div className="mt-1 text-sm text-black/55">
        {q
          ? 'Try a different search term.'
          : 'Add products and opening stock so TillFlow can help you monitor stock levels and movement.'}
      </div>
    </div>
  );
}

export default async function InventoryPage(props: { searchParams?: Promise<{ q?: string; page?: string }> }) {
  const searchParams = await props.searchParams;
  const { business, store, stores, user } = await requireBusinessAndOptionalStore(['MANAGER', 'OWNER']);
  if (!business) {
    return <div className="card p-6">Seed data missing.</div>;
  }
  if (!store) {
    return (
      <SelectOperationalStoreNotice
        stores={stores}
        canSwitch={user.role === 'OWNER' || user.role === 'MANAGER'}
        title="Select a branch to view stock"
      />
    );
  }

  const q = searchParams?.q?.trim() ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const where = {
    businessId: business.id,
    active: true,
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const loadInventory = (listPage: number) => prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          publisher: true,
          edition: true,
          reorderPointBase: true,
          foodDish: { select: { stockMode: true, soldOut: true, lowAt: true } },
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
            select: { qtyOnHandBase: true, avgCostBasePence: true, knownValuePence: true, unvaluedQtyBase: true }
          }
        },
        orderBy: { name: 'asc' },
        skip: (listPage - 1) * DEFAULT_PAGE_SIZE,
        take: DEFAULT_PAGE_SIZE,
      });
  const [totalCount, firstProducts] = await measureServerOperation(
    'page.inventory.load',
    () => Promise.all([
      prisma.product.count({ where }),
      loadInventory(page),
    ]),
    {
      businessId: business.id,
      storeId: store.id,
      route: '/inventory',
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      rowCount: DEFAULT_PAGE_SIZE,
      cacheState: 'uncached-page-load',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );
  const listedInventory = await rowsForListPage(page, totalCount, DEFAULT_PAGE_SIZE, firstProducts, loadInventory);
  const products = listedInventory.rows;
  const currentPage = listedInventory.page;
  const totalPages = listedInventory.totalPages;
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
    const availability = inventoryAvailability(business.businessCategory, product.foodDish, qtyOnHand, product.reorderPointBase);

    return {
      product,
      baseUnit,
      packaging,
      qtyOnHand,
      avgCostBase,
      stockValue: qtyOnHand === 0 ? 0 : balance?.knownValuePence != null && balance.unvaluedQtyBase === 0 ? balance.knownValuePence : null,
      hasCostDrift: !availability.dish && hasCostDrift,
      formatted: availability.quantity ?? formatted,
      ...availability,
    };
  });
  const food = isFoodBusiness(business.businessCategory);
  const outOfStockCount = inventoryRows.filter((row) => !row.dish && row.isOut).length;
  const soldOutDishes = inventoryRows.filter((row) => row.dish && row.isOut).length;
  const lowStockCount = inventoryRows.filter((row) => !row.dish && row.isLow && !row.isOut).length;
  const costDriftCount = inventoryRows.filter((row) => row.hasCostDrift).length;
  const healthyCount = Math.max(0, inventoryRows.filter((row) => !row.dish).length - outOfStockCount - lowStockCount);

  const stockOrder = (row: typeof inventoryRows[number]) => row.isOut ? 0 : row.isLow ? 1 : 2;
  const mobileRows = [...inventoryRows].sort((left, right) => stockOrder(left) - stockOrder(right));

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Inventory"
        compact
        subtitle={food ? "Check dish availability, ingredients, and items you resell." : "See what is in stock, what is running low, and what needs attention."}
        actions={<RefreshIndicator compact fetchedAt={new Date().toISOString()} />}
      />

      <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="w-full lg:col-start-1 lg:row-start-2 lg:max-w-xl">
        <Suspense><SearchFilter placeholder="Search products…" /></Suspense>
      </div>
      <div aria-label="Stock summary" className="grid grid-cols-2 gap-2 lg:col-span-2 lg:row-start-1 lg:gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/5 bg-white px-3 py-2 shadow-card lg:px-4 lg:py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Products</div>
          <div className="mt-1 text-xl font-bold tabular-nums lg:mt-2 lg:text-2xl text-ink">{totalCount}</div>
          <div className="mt-0.5 text-[11px] leading-tight text-black/50 lg:mt-1 lg:text-xs"><span className="lg:hidden">In catalogue</span><span className="hidden lg:inline">Active in catalogue</span></div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-card lg:px-4 lg:py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700/70">Low stock</div>
          <div className="mt-1 text-xl font-bold tabular-nums lg:mt-2 lg:text-2xl text-amber-800">{lowStockCount}</div>
          <div className="mt-0.5 text-[11px] leading-tight text-amber-800 lg:mt-1 lg:text-xs lg:text-amber-600/70">On this page</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 shadow-card lg:px-4 lg:py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700/70">Out of stock</div>
          <div className="mt-1 text-xl font-bold tabular-nums lg:mt-2 lg:text-2xl text-rose-700">{outOfStockCount}</div>
          <div className="mt-0.5 text-[11px] leading-tight text-rose-800 lg:mt-1 lg:text-xs lg:text-rose-600/70">On this page</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 shadow-card lg:px-4 lg:py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700/70"><span className="lg:hidden">Needs a look</span><span className="hidden lg:inline">Cost drift</span></div>
          <div className="mt-1 text-xl font-bold tabular-nums lg:mt-2 lg:text-2xl text-sky-800">{costDriftCount}</div>
          <div className="mt-0.5 text-[11px] leading-tight text-sky-800 lg:mt-1 lg:text-xs lg:text-sky-600/70"><span className="lg:hidden">On this page</span><span className="hidden lg:inline">Avg cost differs on this page</span></div>
        </div>
      </div>

      <div className="flex gap-2 lg:hidden">
        <Link className="btn-primary min-h-11 flex-1 text-center" href="/inventory/stocktake">Stocktake</Link>
        <details className="relative">
          <summary className="btn-secondary min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">More</summary>
          <div className="absolute right-0 z-10 mt-1 grid w-max max-w-[75vw] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <Link className="btn-ghost min-h-11 justify-start" href="/inventory/adjustments">Record adjustment</Link>
            <Link className="btn-ghost min-h-11 justify-start" href="/inventory/conversions">Convert stock</Link>
          </div>
        </details>
      </div>
      <div className="hidden gap-2 lg:col-start-2 lg:row-start-2 lg:flex">
          <Link className="btn-secondary w-full text-center text-xs sm:w-auto" href="/inventory/conversions">
            Convert stock
          </Link>
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
            <p className="mt-1 text-sm text-black/55 lg:hidden">
              {healthyCount} in stock · {lowStockCount} low · {outOfStockCount} out{food ? ` · ${soldOutDishes} dishes sold out` : null}
            </p>
            <p className="mt-1 hidden text-sm text-black/55 lg:block">
              {healthyCount} healthy · {lowStockCount} low · {outOfStockCount} out of stock · {costDriftCount} with cost drift{food ? ` · ${soldOutDishes} dishes sold out` : null}
            </p>
          </div>
        </div>

        {costDriftCount > 0 ? (
          <div className="mb-4 hidden rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 lg:block">
            <p className="font-semibold">Some average costs differ from the current product default.</p>
            <p className="mt-1 text-sky-800">
              This can be normal with weighted-average costing. The average cost is rounded for display; confirmed stock value keeps the exact amount. Missing costs remain incomplete until reviewed.
            </p>
          </div>
        ) : null}

        {costDriftCount > 0 && <details className="mb-4 rounded-xl border border-slate-200 px-3 text-sm text-slate-700 lg:hidden">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">Why do some costs differ?</summary>
          <p className="pb-3">The average cost comes from what you actually paid for stock, so it can differ from the product&apos;s default cost. Stock value uses the exact amounts.</p>
        </details>}

        {/* Mobile cards */}
        <div className="space-y-3 lg:hidden">
          {inventoryRows.length === 0 ? (
            <InventoryEmptyState q={q} totalCount={totalCount} />
          ) : (
            mobileRows.map(({ product, baseUnit, packaging, formatted, avgCostBase, stockValue, hasCostDrift, isLow, isOut, dish, status }) => (
              <div
                key={product.id}
                className={`rounded-2xl border px-4 py-4 shadow-sm transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${isOut ? 'border-rose-200 bg-rose-50' : isLow ? 'border-amber-200 bg-amber-50' : 'border-black/5 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">{dish ? <Link className="underline" href={dishSettingsHref(product.id)}>{product.name}</Link> : [product.name, product.publisher, product.edition].filter(Boolean).join(" · ")}</div>
                    {formatted && <p className="mt-1 text-xl font-bold text-ink">{formatted}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isOut ? 'bg-rose-100 text-rose-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {status}
                  </span>
                </div>
                {!dish && <>
                <p className="mt-2 text-sm text-slate-600">Stock value: {stockValue == null ? 'Cost review needed' : formatMoney(stockValue, business.currency)}</p>
                <details className="mt-2 border-t border-black/10">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-primary">Details</summary>
                  <div className="grid grid-cols-2 gap-3 pb-3 text-sm">
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
                  </div>
                </details>
                </>}
              </div>
            ))
          )}
        </div>

        {/* Desktop table */}
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
              {inventoryRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center">
                    <InventoryEmptyState q={q} totalCount={totalCount} />
                  </td>
                </tr>
              ) : (
                inventoryRows.map(({ product, baseUnit, packaging, formatted, avgCostBase, stockValue, hasCostDrift, isLow, isOut, dish, status }) => (
                  <tr
                    key={product.id}
                    className={`rounded-xl transition-all duration-150 motion-reduce:transform-none motion-reduce:transition-none ${
                      isOut
                        ? 'bg-rose-50 hover:-translate-y-px hover:shadow-sm'
                        : isLow
                        ? 'bg-amber-50 hover:-translate-y-px hover:shadow-sm'
                        : 'bg-white hover:-translate-y-px hover:bg-slate-50 hover:shadow-card'
                    }`}
                  >
                    <td className="px-3 py-3 font-semibold">{dish ? <Link className="underline" href={dishSettingsHref(product.id)}>{product.name}</Link> : [product.name, product.publisher, product.edition].filter(Boolean).join(" · ")}</td>
                    <td className={`px-3 py-3 font-semibold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-700' : ''}`}>{formatted}</td>
                    {dish ? <td colSpan={4} className="px-3 py-3 text-sm text-black/60">Prepared dish</td> : <>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(avgCostBase, business.currency)}
                      <div className="mt-1 text-xs font-normal text-black/60">Stock value: {stockValue == null ? 'Incomplete — cost review needed' : formatMoney(stockValue, business.currency)}</div>
                    </td>
                    <td className={`px-3 py-3 text-sm ${hasCostDrift ? 'font-semibold text-sky-700' : 'text-black/60'}`}>
                      {formatMoney(product.defaultCostBasePence, business.currency)}
                    </td>
                    <td className="px-3 py-3 text-sm text-black/60">{baseUnit?.unit.name ?? '-'}</td>
                    <td className="px-3 py-3 text-sm text-black/60">
                      {packaging ? `${packaging.unit.name} (${packaging.conversionToBase} base)` : '-'}
                    </td>
                    </>}
                    <td className="px-3 py-3 text-sm">
                      {hasCostDrift ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">Cost drift</span>
                      ) : isOut ? (
                        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">{status}</span>
                      ) : isLow ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">{status}</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{status}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination documentNavigation currentPage={currentPage} totalPages={totalPages} basePath="/inventory" searchParams={{ q: q || undefined }} />
      </div>
    </div>
  );
}
