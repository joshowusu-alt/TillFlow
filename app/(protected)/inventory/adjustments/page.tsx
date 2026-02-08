import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { formatDateTime } from '@/lib/format';
import StockAdjustmentClient from '../StockAdjustmentClient';

export default async function StockAdjustmentsPage() {
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

  const adjustments = await prisma.stockAdjustment.findMany({
    where: { storeId: store.id },
    include: { product: { include: { productUnits: { include: { unit: true } } } }, unit: true, user: true },
    orderBy: { createdAt: 'desc' },
    take: 30
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Adjustments" subtitle="Record shrinkage, found stock, and corrections." />

      <div className="card p-6">
        <StockAdjustmentClient
          storeId={store.id}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            onHandBase:
              product.inventoryBalances.find((balance) => balance.storeId === store.id)?.qtyOnHandBase ?? 0,
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

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Recent adjustments</h2>
        <table className="table mt-4 w-full border-separate border-spacing-y-2">
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
            {adjustments.map((adjustment) => {
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
              return (
                <tr key={adjustment.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm">{formatDateTime(adjustment.createdAt)}</td>
                  <td className="px-3 py-3 text-sm font-semibold">{adjustment.product.name}</td>
                  <td className="px-3 py-3 text-sm">{formatted}</td>
                  <td className="px-3 py-3 text-sm">
                    <span className="pill bg-black/5 text-black/60">{adjustment.direction}</span>
                  </td>
                  <td className="px-3 py-3 text-sm">{adjustment.reason ?? '-'}</td>
                  <td className="px-3 py-3 text-sm">{adjustment.user.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
