import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import Pagination from '@/components/Pagination';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import PurchaseFormClient from './PurchaseFormClient';
import DeletePurchaseButton from './DeletePurchaseButton';

const PAGE_SIZE = 25;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams?: { error?: string; page?: string; storeId?: string; created?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return (
      <div className="card p-6 text-center">
        <div className="text-lg font-semibold">Setup Required</div>
        <div className="mt-2 text-sm text-black/60">Complete your business setup in Settings to get started.</div>
        <a href="/settings" className="btn-primary mt-4 inline-block">Go to Settings</a>
      </div>
    );
  }

  const stores = await prisma.store.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const selectedStoreId =
    (searchParams?.storeId && stores.some((store) => store.id === searchParams.storeId)
      ? searchParams.storeId
      : stores[0]?.id) ?? '';
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1);

  const [products, suppliers, units, purchaseCount, purchases] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      select: {
        id: true,
        name: true,
        barcode: true,
        defaultCostBasePence: true,
        sellingPriceBasePence: true,
        vatRateBps: true,
        productUnits: {
          select: {
            unitId: true,
            conversionToBase: true,
            isBaseUnit: true,
            unit: { select: { id: true, name: true, pluralName: true } },
          },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
    }),
    prisma.unit.findMany({ select: { id: true, name: true } }),
    prisma.purchaseInvoice.count({
      where: { businessId: business.id, ...(selectedStoreId ? { storeId: selectedStoreId } : {}) },
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId: business.id, ...(selectedStoreId ? { storeId: selectedStoreId } : {}) },
      select: {
        id: true,
        createdAt: true,
        paymentStatus: true,
        totalPence: true,
        supplier: { select: { name: true } },
        purchaseReturn: { select: { id: true } },
        _count: { select: { lines: true } },
        lines: {
          take: 1,
          select: {
            qtyBase: true,
            product: {
              select: {
                productUnits: {
                  select: {
                    isBaseUnit: true,
                    conversionToBase: true,
                    unit: { select: { name: true, pluralName: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(purchaseCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader title="Purchases" subtitle="Receive stock and track payables by branch." />
      <FormError error={searchParams?.error} />

      {searchParams?.created === '1' && (
        <div className="flex items-center gap-3 rounded-2xl border border-success/20 bg-success/5 px-5 py-3.5">
          <svg className="h-5 w-5 flex-shrink-0 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <div className="flex-1">
            <span className="text-sm font-semibold text-success">Stock updated!</span>
            <span className="ml-1.5 text-sm text-ink/70">All inventory quantities have been adjusted.</span>
          </div>
          <Link href="/inventory" className="flex-shrink-0 text-xs font-semibold text-accent hover:underline">
            View inventory &rarr;
          </Link>
        </div>
      )}

      <form method="GET" className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Branch / Store</label>
          <select className="input" name="storeId" defaultValue={selectedStoreId}>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary" type="submit">
          Apply
        </button>
      </form>

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold">Receive stock</h2>
          <Link className="btn-secondary text-xs" href="/suppliers">
            Add supplier
          </Link>
        </div>
        <PurchaseFormClient
          key={searchParams?.created ?? 'default'}
          storeId={selectedStoreId}
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
              isBaseUnit: pu.isBaseUnit,
            })),
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
              const lineCount = purchase._count.lines;
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
                    packagingConversion: packaging?.conversionToBase,
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
                      <div className="flex gap-2">
                        <Link className="btn-ghost text-xs" href={`/purchases/return/${purchase.id}`}>
                          Return
                        </Link>
                        <DeletePurchaseButton purchaseId={purchase.id} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/purchases"
          searchParams={{ storeId: selectedStoreId || undefined }}
        />
      </div>
    </div>
  );
}
