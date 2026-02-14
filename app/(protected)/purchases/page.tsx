import PageHeader from '@/components/PageHeader';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import PurchaseFormClient from './PurchaseFormClient';

export default async function PurchasesPage() {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  const store = await prisma.store.findFirst();
  if (!business || !store) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  const products = await prisma.product.findMany({
    where: { businessId: business.id, active: true },
    include: { productUnits: { include: { unit: true } } }
  });
  const suppliers = await prisma.supplier.findMany({ where: { businessId: business.id } });
  const units = await prisma.unit.findMany();

  const purchases = await prisma.purchaseInvoice.findMany({
    where: { businessId: business.id },
    include: {
      supplier: true,
      purchaseReturn: true,
      lines: { include: { product: { include: { productUnits: { include: { unit: true } } } } } }
    },
    orderBy: { createdAt: 'desc' },
    take: 30
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Purchases" subtitle="Receive stock and track payables." />
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold">Receive stock</h2>
          <Link className="btn-secondary text-xs" href="/suppliers">
            Add supplier
          </Link>
        </div>
        <PurchaseFormClient
          storeId={store.id}
          currency={business.currency}
          vatEnabled={business.vatEnabled}
          units={units.map((unit) => ({ id: unit.id, name: unit.name }))}
          suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            barcode: product.barcode,
            defaultCostBasePence: product.defaultCostBasePence,
            sellingPriceBasePence: product.sellingPriceBasePence,
            vatRateBps: product.vatRateBps,
            units: product.productUnits.map((pu) => ({
              id: pu.unitId,
              name: pu.unit.name,
              conversionToBase: pu.conversionToBase,
              isBaseUnit: pu.isBaseUnit
            }))
          }))}
        />
      </div>

      <div className="card p-6 overflow-x-auto">
        <h2 className="text-lg font-display font-semibold">Recent purchases</h2>
        <table className="table mt-4 w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Supplier</th>
              <th>Date</th>
              <th>Lines</th>
              <th>Status</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => {
              const lineCount = purchase.lines.length;
              const line = purchase.lines[0];
              const baseUnit = line?.product.productUnits.find((unit) => unit.isBaseUnit);
              const packaging = getPrimaryPackagingUnit(
                line?.product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit })) ?? []
              );
              const qtyLabel = line
                ? formatMixedUnit({
                    qtyBase: line.qtyBase,
                    baseUnit: baseUnit?.unit.name ?? 'unit',
                    baseUnitPlural: baseUnit?.unit.pluralName,
                    packagingUnit: packaging?.unit.name,
                    packagingUnitPlural: packaging?.unit.pluralName,
                    packagingConversion: packaging?.conversionToBase
                  })
                : '-';
              const lineLabel = lineCount > 1 ? `${lineCount} lines` : qtyLabel;
              return (
                <tr key={purchase.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm">{purchase.id.slice(0, 8)}</td>
                  <td className="px-3 py-3 text-sm">{purchase.supplier?.name ?? 'Default Supplier'}</td>
                  <td className="px-3 py-3 text-sm">{formatDateTime(purchase.createdAt)}</td>
                  <td className="px-3 py-3 text-sm">{lineLabel}</td>
                  <td className="px-3 py-3">
                    <span className={`pill-${purchase.paymentStatus.toLowerCase().replace('_', '-')}`}>{purchase.paymentStatus.replace('_', ' ')}</span>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold">
                    {formatMoney(purchase.totalPence, business.currency)}
                  </td>
                  <td className="px-3 py-3">
                    {purchase.purchaseReturn || ['RETURNED', 'VOID'].includes(purchase.paymentStatus) ? (
                      <span className="text-xs text-black/40">Returned</span>
                    ) : (
                      <Link className="btn-ghost text-xs" href={`/purchases/return/${purchase.id}`}>
                        Return
                      </Link>
                    )}
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
