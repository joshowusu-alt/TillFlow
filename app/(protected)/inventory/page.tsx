import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import Link from 'next/link';

export default async function InventoryPage() {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  const store = await prisma.store.findFirst();
  if (!business || !store) {
    return <div className="card p-6">Seed data missing.</div>;
  }

  const products = await prisma.product.findMany({
    where: { businessId: business.id, active: true },
    include: { productUnits: { include: { unit: true } }, inventoryBalances: true }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" subtitle="Real-time balances in mixed units." />
      <div className="flex justify-end">
        <Link className="btn-secondary text-xs" href="/inventory/adjustments">
          Record adjustment
        </Link>
      </div>
      <div className="card p-6">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Product</th>
              <th>On Hand</th>
              <th>Avg Cost (Base)</th>
              <th>Base Unit</th>
              <th>Packaging Unit</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
              const packaging = getPrimaryPackagingUnit(
                product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
              );
              const balance = product.inventoryBalances.find((item) => item.storeId === store.id);
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
              return (
                <tr key={product.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-semibold">{product.name}</td>
                  <td className="px-3 py-3">{formatted}</td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    £{(avgCostBase / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-sm text-black/60">{baseUnit?.unit.name ?? '-'}</td>
                  <td className="px-3 py-3 text-sm text-black/60">
                    {packaging ? `${packaging.unit.name} (${packaging.conversionToBase} base)` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
