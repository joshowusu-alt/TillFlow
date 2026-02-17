import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import SearchFilter from '@/components/SearchFilter';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusinessStore } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import Link from 'next/link';
import { Suspense } from 'react';

const PAGE_SIZE = 25;

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
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Real-time balances in mixed units."
        actions={<RefreshIndicator fetchedAt={new Date().toISOString()} />}
      />
      <div className="mb-4 max-w-xs">
        <Suspense><SearchFilter placeholder="Search products…" /></Suspense>
      </div>
      <div className="flex justify-end gap-2">
        <Link className="btn-secondary text-xs" href="/inventory/stocktake">
          Stocktake
        </Link>
        <Link className="btn-secondary text-xs" href="/inventory/adjustments">
          Record adjustment
        </Link>
      </div>
      <div className="card p-6 overflow-x-auto">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Product</th>
              <th>On Hand</th>
              <th>Avg Cost (Base)</th>
              <th>Base Unit</th>
              <th>Packaging Unit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
              const packaging = getPrimaryPackagingUnit(
                product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
              );
              const balance = product.inventoryBalances[0];
              const qtyOnHand = balance?.qtyOnHandBase ?? 0;
              const avgCostBase = balance?.avgCostBasePence ?? product.defaultCostBasePence;
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
              return (
                <tr key={product.id} className={`rounded-xl ${isOut ? 'bg-rose-50' : isLow ? 'bg-amber-50' : 'bg-white'}`}>
                  <td className="px-3 py-3 font-semibold">{product.name}</td>
                  <td className={`px-3 py-3 font-semibold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-700' : ''}`}>{formatted}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(avgCostBase, business.currency)}
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{baseUnit?.unit.name ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-black/60">
                    {packaging ? `${packaging.unit.name} (${packaging.conversionToBase} base)` : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {isOut ? (
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
        <Pagination currentPage={page} totalPages={totalPages} basePath="/inventory" searchParams={{ q: q || undefined }} />
      </div>
    </div>
  );
}
