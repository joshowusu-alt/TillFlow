import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import Pagination from '@/components/Pagination';
import InlinePaymentForm from '@/components/InlinePaymentForm';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney, formatDateTime, DEFAULT_PAGE_SIZE } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import PurchaseFormClient from './PurchaseFormClient';
import DeletePurchaseButton from './DeletePurchaseButton';
import { getBusinessStores } from '@/lib/services/stores';

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

  const { stores, selectedStoreId: rawStoreId } = await getBusinessStores(business.id, searchParams?.storeId);
  const selectedStoreId = (rawStoreId ?? stores[0]?.id) ?? '';
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
        purchaseReturn: { select: { id: true } },      payments: { select: { amountPence: true } },        _count: { select: { lines: true } },
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
      skip: (page - 1) * DEFAULT_PAGE_SIZE,
      take: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(purchaseCount / DEFAULT_PAGE_SIZE));
  const purchaseRows = purchases.map((purchase) => {
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
    const outstandingPence = purchase.totalPence - purchase.payments.reduce((sum, payment) => sum + payment.amountPence, 0);

    return {
      purchase,
      lineLabel,
      outstandingPence,
    };
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Purchases" subtitle="Record deliveries once — TillFlow updates stock, costs, and payables together." />
      <FormError error={searchParams?.error} />

      {searchParams?.created === '1' && (
        <div className="flex items-center gap-3 rounded-2xl border border-success/20 bg-success/5 px-5 py-3.5">
          <svg className="h-5 w-5 flex-shrink-0 text-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <div className="flex-1">
            <span className="text-sm font-semibold text-success">Purchase recorded.</span>
            <span className="ml-1.5 text-sm text-ink/70">Stock, supplier balance, and reports have been updated for this branch.</span>
          </div>
          <Link href="/inventory" className="flex-shrink-0 text-xs font-semibold text-accent hover:underline">
            View inventory &rarr;
          </Link>
        </div>
      )}

      {stores.length > 1 && (
        <form method="GET" className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label className="label">Branch</label>
            <select className="input w-full" name="storeId" defaultValue={selectedStoreId}>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-secondary w-full sm:w-auto" type="submit">
            Apply
          </button>
        </form>
      )}

      {/* Receive stock — collapsible on mobile, always open on desktop */}
      <details className="details-mobile" open>
        <summary className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Record delivery
          </span>
          <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="card mt-2 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-display font-semibold">Receive stock</h2>
              <p className="mt-1 text-sm text-black/55">A single purchase entry updates stock quantities, average cost, and your supplier payable simultaneously.</p>
            </div>
            <Link className="btn-secondary w-full text-center text-xs sm:w-auto" href="/suppliers">
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
                pluralName: pu.unit.pluralName ?? undefined,
                conversionToBase: pu.conversionToBase,
                isBaseUnit: pu.isBaseUnit,
              })),
            }))}
          />
        </div>
      </details>

      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold">Recent purchases</h2>
            <p className="text-sm text-black/55">Review the latest invoices, outstanding balances, and returns.</p>
          </div>
          <div className="text-xs text-black/45">{purchaseCount} total invoices</div>
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          {purchaseRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/10 px-4 py-6">
              <div className="text-sm font-semibold text-ink">No purchases recorded yet.</div>
              <div className="mt-1 text-sm text-black/55">
                Tap "Record delivery" above when stock arrives from a supplier. TillFlow will increase inventory and track what is still unpaid.
              </div>
            </div>
          ) : (
            purchaseRows.map(({ purchase, lineLabel, outstandingPence }) => (
              <div key={purchase.id} className="rounded-2xl border border-black/5 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">#{purchase.id.slice(0, 8)}</div>
                    {purchase.supplier?.name
                      ? <div className="mt-1 text-sm text-black/60">{purchase.supplier.name}</div>
                      : <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                          Supplier not set
                        </span>}

                  </div>
                  <span className={`pill-${purchase.paymentStatus.toLowerCase().replace('_', '-')}`}>{purchase.paymentStatus.replace('_', ' ')}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Date</div>
                    <div className="mt-1 text-black/70">{formatDateTime(purchase.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Lines</div>
                    <div className="mt-1 text-black/70">{lineLabel}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Total</div>
                    <div className="mt-1 font-semibold text-ink">{formatMoney(purchase.totalPence, business.currency)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Outstanding</div>
                    <div className="mt-1 text-black/70">{formatMoney(Math.max(0, outstandingPence), business.currency)}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="btn-ghost text-xs" href={`/purchases/${purchase.id}`}>
                    View
                  </Link>
                  {purchase.purchaseReturn || ['RETURNED', 'VOID'].includes(purchase.paymentStatus) ? (
                    <span className="text-xs text-black/40">Returned</span>
                  ) : (
                    <>
                      {['UNPAID', 'PART_PAID'].includes(purchase.paymentStatus) && (
                        <InlinePaymentForm
                          invoiceId={purchase.id}
                          outstandingPence={outstandingPence}
                          currency={business.currency}
                          type="supplier"
                          returnTo="/purchases"
                        />
                      )}
                      <Link className="btn-ghost text-xs" href={`/purchases/return/${purchase.id}`}>
                        Return
                      </Link>
                      <DeletePurchaseButton purchaseId={purchase.id} />
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="responsive-table-shell mt-4 hidden lg:block">
          <table className="table w-full border-separate border-spacing-y-1.5">
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
            {purchaseRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center">
                  <div className="text-sm font-semibold text-ink">No purchases recorded yet.</div>
                  <div className="mt-1 text-sm text-black/55">Receive your first supplier delivery above to update stock and payables together.</div>
                </td>
              </tr>
            )}
            {purchaseRows.map(({ purchase, lineLabel, outstandingPence }) => {
              return (
                <tr key={purchase.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 text-sm">{purchase.id.slice(0, 8)}</td>
                  <td className="px-3 py-3 text-sm">
                    {purchase.supplier?.name
                      ? purchase.supplier.name
                      : <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                          Supplier not set
                        </span>}
                  </td>
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
                      <div className="flex gap-2 flex-wrap">
                        <Link className="btn-ghost text-xs" href={`/purchases/${purchase.id}`}>
                          View
                        </Link>
                        {['UNPAID', 'PART_PAID'].includes(purchase.paymentStatus) && (
                          <InlinePaymentForm
                            invoiceId={purchase.id}
                            outstandingPence={outstandingPence}
                            currency={business.currency}
                            type="supplier"
                            returnTo="/purchases"
                          />
                        )}
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
        </div>
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
