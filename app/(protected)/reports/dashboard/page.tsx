import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import RefreshIndicator from '@/components/RefreshIndicator';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { getIncomeStatement } from '@/lib/reports/financials';
import { requireBusiness } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string };
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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const start = parseDate(searchParams?.from, todayStart);
  const end = parseDate(searchParams?.to, todayEnd);
  end.setHours(23, 59, 59, 999);

  const selectedStoreId =
    searchParams?.storeId && stores.some((store) => store.id === searchParams.storeId)
      ? searchParams.storeId
      : 'ALL';
  const storeFilter = selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId };

  const [salesInRange, paymentsInRange, income, outstandingSales, outstandingPurchases, balances, bestSellers] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        businessId: business.id,
        ...storeFilter,
        createdAt: { gte: start, lte: end },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      select: { totalPence: true },
    }),
    prisma.salesPayment.findMany({
      where: {
        receivedAt: { gte: start, lte: end },
        salesInvoice: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
        },
      },
      select: { method: true, amountPence: true },
    }),
    getIncomeStatement(business.id, start, end),
    prisma.salesInvoice.findMany({
      where: {
        businessId: business.id,
        ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
    }),
    prisma.purchaseInvoice.findMany({
      where: {
        businessId: business.id,
        ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
    }),
    prisma.inventoryBalance.findMany({
      where: {
        ...(selectedStoreId === 'ALL'
          ? { store: { businessId: business.id } }
          : { storeId: selectedStoreId }),
      },
      select: {
        id: true,
        qtyOnHandBase: true,
        product: {
          select: {
            name: true,
            reorderPointBase: true,
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
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          createdAt: { gte: start, lte: end },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        productId: true,
        qtyBase: true,
        product: {
          select: {
            name: true,
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
    }),
  ]);

  const totalSales = salesInRange.reduce((sum, sale) => sum + sale.totalPence, 0);

  const paymentSplit = paymentsInRange.reduce(
    (acc, payment) => {
      acc[payment.method as keyof typeof acc] += payment.amountPence;
      return acc;
    },
    { CASH: 0, CARD: 0, TRANSFER: 0, MOBILE_MONEY: 0 }
  );

  const outstandingAR = outstandingSales.reduce((sum, invoice) => {
    const paid = invoice.payments.reduce((total, payment) => total + payment.amountPence, 0);
    return sum + Math.max(invoice.totalPence - paid, 0);
  }, 0);

  const outstandingAP = outstandingPurchases.reduce((sum, invoice) => {
    const paid = invoice.payments.reduce((total, payment) => total + payment.amountPence, 0);
    return sum + Math.max(invoice.totalPence - paid, 0);
  }, 0);

  const lowStock = balances
    .filter((balance) => balance.product.reorderPointBase > 0 && balance.qtyOnHandBase <= balance.product.reorderPointBase)
    .slice(0, 5);

  const bestMap = new Map<string, { name: string; qty: number; units: any[] }>();
  for (const line of bestSellers) {
    const entry = bestMap.get(line.productId) ?? {
      name: line.product.name,
      qty: 0,
      units: line.product.productUnits,
    };
    entry.qty += line.qtyBase;
    bestMap.set(line.productId, entry);
  }
  const bestItems = Array.from(bestMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const fromIso = start.toISOString().slice(0, 10);
  const toIso = end.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner Dashboard"
        subtitle="Consolidated and per-branch performance."
        actions={<RefreshIndicator fetchedAt={new Date().toISOString()} autoRefreshMs={120_000} />}
      />

      <form className="card grid gap-3 p-4 sm:grid-cols-4" method="GET">
        <div>
          <label className="label">Branch / Store</label>
          <select className="input" name="storeId" defaultValue={selectedStoreId}>
            <option value="ALL">All branches</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromIso} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toIso} />
        </div>
        <div className="flex items-end">
          <button className="btn-secondary w-full" type="submit">
            Apply
          </button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales In Range" value={formatMoney(totalSales, business.currency)} tone="accent" />
        <StatCard label="Gross Profit In Range" value={formatMoney(income.grossProfit, business.currency)} />
        <StatCard label="Outstanding AR" value={formatMoney(outstandingAR, business.currency)} />
        <StatCard label="Outstanding AP" value={formatMoney(outstandingAP, business.currency)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-lg font-display font-semibold">Payment Split</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Cash</span>
              <span className="font-semibold">{formatMoney(paymentSplit.CASH, business.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Card</span>
              <span className="font-semibold">{formatMoney(paymentSplit.CARD, business.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Transfer</span>
              <span className="font-semibold">{formatMoney(paymentSplit.TRANSFER, business.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>MoMo</span>
              <span className="font-semibold">{formatMoney(paymentSplit.MOBILE_MONEY, business.currency)}</span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-display font-semibold">Low Stock Alerts</h2>
          <div className="mt-4 space-y-3 text-sm">
            {lowStock.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="rounded-full bg-emerald-50 p-3">
                  <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="mt-2 text-sm text-black/70">All stock levels healthy</div>
                <div className="text-xs text-black/40">No items below reorder point</div>
              </div>
            ) : (
              lowStock.map((balance) => {
                const baseUnit = balance.product.productUnits.find((unit) => unit.isBaseUnit);
                const packaging = getPrimaryPackagingUnit(
                  balance.product.productUnits.map((pu) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
                );
                const mixed = formatMixedUnit({
                  qtyBase: balance.qtyOnHandBase,
                  baseUnit: baseUnit?.unit.name ?? 'unit',
                  baseUnitPlural: baseUnit?.unit.pluralName,
                  packagingUnit: packaging?.unit.name,
                  packagingUnitPlural: packaging?.unit.pluralName,
                  packagingConversion: packaging?.conversionToBase,
                });
                return (
                  <div key={balance.id} className="flex items-center justify-between rounded-xl border border-black/5 bg-white px-3 py-2">
                    <span>{balance.product.name}</span>
                    <span className="font-semibold text-rose">{mixed}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-display font-semibold">Best Sellers</h2>
        <div className="mt-4 space-y-3 text-sm">
          {bestItems.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="rounded-full bg-black/5 p-3">
                <svg className="h-6 w-6 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="mt-2 text-sm text-black/70">No sales in selected range yet</div>
            </div>
          ) : (
            bestItems.map((item) => {
              const baseUnit = item.units.find((unit: any) => unit.isBaseUnit);
              const packaging = getPrimaryPackagingUnit(
                item.units.map((pu: any) => ({ conversionToBase: pu.conversionToBase, unit: pu.unit }))
              );
              const mixed = formatMixedUnit({
                qtyBase: item.qty,
                baseUnit: baseUnit?.unit.name ?? 'unit',
                baseUnitPlural: baseUnit?.unit.pluralName,
                packagingUnit: packaging?.unit.name,
                packagingUnitPlural: packaging?.unit.pluralName,
                packagingConversion: packaging?.conversionToBase,
              });
              return (
                <div key={item.name} className="flex items-center justify-between rounded-xl border border-black/5 bg-white px-3 py-2">
                  <span>{item.name}</span>
                  <span className="font-semibold">{mixed}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
