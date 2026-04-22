import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import RefreshIndicator from '@/components/RefreshIndicator';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { getIncomeStatement } from '@/lib/reports/financials';
import { requireBusiness } from '@/lib/auth';
import { computeOutstandingBalance } from '@/lib/accounting';
import { getBusinessStores } from '@/lib/services/stores';
import { classifyInventoryState, getReceivableAgeBucket } from '@/lib/reports/operational-metrics';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';

export const dynamic = 'force-dynamic';

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

  const { stores, selectedStoreId: rawStoreId } = await getBusinessStores(business.id, searchParams?.storeId);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { start, end, fromInputValue: fromIso, toInputValue: toIso } = resolveReportDateRange(searchParams, todayStart, todayEnd);

  const selectedStoreId = rawStoreId ?? 'ALL';
  const storeFilter = selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId };
  const isToday =
    start.toDateString() === todayStart.toDateString() &&
    end.toDateString() === todayEnd.toDateString();

  const [
    salesAgg,
    paymentsByMethod,
    income,
    outstandingSales,
    outstandingPurchases,
    balances,
    bestSellerGroups,
    todayAdj,
    todayVoids,
    todayReturns,
    todayCashVar,
    costedMarginAgg,
    uncostedMarginGroups,
  ] = await Promise.all([
    // Sales — aggregate at DB level
    prisma.salesInvoice.aggregate({
      where: {
        businessId: business.id,
        ...storeFilter,
        createdAt: { gte: start, lte: end },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      _sum: { totalPence: true },
    }),
    // Payments grouped by method — aggregate at DB level
    prisma.salesPayment.groupBy({
      by: ['method'],
      where: {
        receivedAt: { gte: start, lte: end },
        salesInvoice: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      _sum: { amountPence: true },
    }),
    getIncomeStatement(business.id, start, end),
    prisma.salesInvoice.findMany({
      where: {
        businessId: business.id,
        ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: {
        id: true,
        totalPence: true,
        dueDate: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
        payments: { select: { amountPence: true } },
      },
      orderBy: { createdAt: 'desc' },
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
            reorderQtyBase: true,
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
      take: 1000,
    }),
    prisma.salesInvoiceLine.groupBy({
      by: ['productId'],
      where: {
        salesInvoice: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          createdAt: { gte: start, lte: end },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      _sum: {
        qtyBase: true,
        lineTotalPence: true,
      },
      orderBy: {
        _sum: {
          lineTotalPence: 'desc',
        },
      },
      take: 20,
    }),
    // Phase 3B: stock adjustments in range
    prisma.stockAdjustment.findMany({
      where: {
        store: { businessId: business.id },
        ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
        createdAt: { gte: start, lte: end },
      },
      select: {
        direction: true,
        qtyBase: true,
        product: { select: { name: true } },
        user: { select: { name: true } },
      },
      take: 8,
      orderBy: { createdAt: 'desc' },
    }),
    // Voided sales in range
    prisma.salesInvoice.findMany({
      where: {
        businessId: business.id,
        ...storeFilter,
        createdAt: { gte: start, lte: end },
        paymentStatus: 'VOID',
      },
      select: { totalPence: true, cashierUser: { select: { name: true } } },
      take: 200,
    }),
    // Returns in range
    prisma.salesReturn.findMany({
      where: {
        store: { businessId: business.id },
        ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
        createdAt: { gte: start, lte: end },
        type: 'RETURN',
      },
      select: { refundAmountPence: true },
      take: 500,
    }),
    // Cash variances (shift closures with non-zero variance) in range
    prisma.shift.findMany({
      where: {
        till: {
          store: {
            businessId: business.id,
            ...(selectedStoreId === 'ALL' ? {} : { id: selectedStoreId }),
          },
        },
        closedAt: { gte: start, lte: end },
        variance: { not: null },
      },
      select: { variance: true, user: { select: { name: true } } },
      take: 100,
    }),
    // Sale lines for GP computation — single source of truth
    prisma.salesInvoiceLine.aggregate({
      where: {
        salesInvoice: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          createdAt: { gte: start, lte: end },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
        lineCostPence: { gt: 0 },
      },
      _sum: {
        lineSubtotalPence: true,
        lineCostPence: true,
      },
    }),
    prisma.salesInvoiceLine.groupBy({
      by: ['productId'],
      where: {
        salesInvoice: {
          businessId: business.id,
          ...(selectedStoreId === 'ALL' ? {} : { storeId: selectedStoreId }),
          createdAt: { gte: start, lte: end },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
        lineCostPence: 0,
      },
      _sum: {
        lineSubtotalPence: true,
        qtyBase: true,
      },
    }),
  ]);

  const currency = business.currency;
  const bestSellerProductIds = bestSellerGroups.map((group) => group.productId);
  const uncostedProductIds = uncostedMarginGroups.map((group) => group.productId);
  const [bestSellerProducts, uncostedProducts] = await Promise.all([
    bestSellerProductIds.length
      ? prisma.product.findMany({
        where: { id: { in: bestSellerProductIds } },
        select: {
          id: true,
          name: true,
          productUnits: {
            select: {
              isBaseUnit: true,
              conversionToBase: true,
              unit: { select: { name: true, pluralName: true } },
            },
          },
        },
      })
      : Promise.resolve([]),
    uncostedProductIds.length
      ? prisma.product.findMany({
        where: { id: { in: uncostedProductIds } },
        select: { id: true, defaultCostBasePence: true },
      })
      : Promise.resolve([]),
  ]);
  const bestSellerProductMap = new Map(bestSellerProducts.map((product) => [product.id, product]));
  const uncostedProductCostMap = new Map(uncostedProducts.map((product) => [product.id, product.defaultCostBasePence]));

  // Summarise sales — already aggregated by DB
  const totalSales = salesAgg._sum.totalPence ?? 0;
  // GP from sale lines — consistent with margins/analytics/KPIs
  const costedGrossMargin =
    (costedMarginAgg._sum.lineSubtotalPence ?? 0) - (costedMarginAgg._sum.lineCostPence ?? 0);
  const uncostedGrossMargin = uncostedMarginGroups.reduce((sum, group) => {
    const revenue = group._sum.lineSubtotalPence ?? 0;
    const qtyBase = group._sum.qtyBase ?? 0;
    const defaultCostBasePence = uncostedProductCostMap.get(group.productId) ?? 0;
    return sum + revenue - (defaultCostBasePence * qtyBase);
  }, 0);
  const totalGrossMargin = costedGrossMargin + uncostedGrossMargin;
  const gpPercent = totalSales > 0 ? Math.round((totalGrossMargin / totalSales) * 100) : 0;
  // Expenses and NP still from journals (accounting source of truth for expense tracking)
  const npPercent = totalSales > 0 ? Math.round(((totalGrossMargin - income.otherExpenses) / totalSales) * 100) : 0;

  // Payment split — already grouped by DB
  const paymentSplit = { CASH: 0, CARD: 0, TRANSFER: 0, MOBILE_MONEY: 0 };
  for (const p of paymentsByMethod) {
    const k = p.method as keyof typeof paymentSplit;
    if (k in paymentSplit) paymentSplit[k] = p._sum.amountPence ?? 0;
  }

  // AR / AP
  const outstandingAR = outstandingSales.reduce((s, inv) => s + computeOutstandingBalance(inv), 0);
  const outstandingAP = outstandingPurchases.reduce((s, inv) => s + computeOutstandingBalance(inv), 0);

  // Debtor ageing buckets
  const bucketKeys = ['0–30 d', '31–60 d', '61–90 d', '90+ d'] as const;
  const ageingBuckets: Record<string, number> = Object.fromEntries(bucketKeys.map((k) => [k, 0]));
  const debtorMap = new Map<string, { name: string; balance: number }>();
  for (const inv of outstandingSales) {
    const paid = inv.payments.reduce((t, p) => t + p.amountPence, 0);
    const balance = Math.max(inv.totalPence - paid, 0);
    if (balance <= 0) continue;
    const bucket = getReceivableAgeBucket(inv.dueDate, inv.createdAt);
    ageingBuckets[bucket] += balance;
    if (inv.customer) {
      const d = debtorMap.get(inv.customer.id) ?? { name: inv.customer.name, balance: 0 };
      d.balance += balance;
      debtorMap.set(inv.customer.id, d);
    }
  }
  const topDebtorList = Array.from(debtorMap.values()).sort((a, b) => b.balance - a.balance).slice(0, 5);

  // Low stock
  const lowStock = balances
    .filter((b) => classifyInventoryState(b.qtyOnHandBase, b.product.reorderPointBase) !== 'healthy')
    .slice(0, 8);

  // Best sellers by revenue
  const bestItems = bestSellerGroups
    .map((group) => {
      const product = bestSellerProductMap.get(group.productId);
      if (!product) return null;
      return {
        name: product.name,
        qty: group._sum.qtyBase ?? 0,
        revenue: group._sum.lineTotalPence ?? 0,
        units: product.productUnits,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 5);

  // Activity highlights
  const voidTotal = todayVoids.reduce((s, v) => s + v.totalPence, 0);
  const returnTotal = todayReturns.reduce((s, r) => s + r.refundAmountPence, 0);
  const cashVarTotal = todayCashVar.reduce((s, v) => s + Math.abs(v.variance ?? 0), 0);
  const hasActivity = todayAdj.length > 0 || todayVoids.length > 0 || todayReturns.length > 0 || cashVarTotal > 0;

  // Live status: last sale time today and open shift count
  const [lastSaleRecord, openShifts] = await Promise.all([
    prisma.salesInvoice.findFirst({
      where: {
        businessId: business.id,
        ...storeFilter,
        createdAt: { gte: todayStart },
        paymentStatus: { notIn: ['VOID', 'RETURNED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.shift.findMany({
      where: {
        till: {
          store: {
            businessId: business.id,
            ...(selectedStoreId === 'ALL' ? {} : { id: selectedStoreId }),
          },
        },
        closedAt: null,
      },
      select: { id: true, user: { select: { name: true } } },
      take: 20,
    }),
  ]);
  const lastSaleMinutesAgo = lastSaleRecord
    ? Math.floor((Date.now() - lastSaleRecord.createdAt.getTime()) / 60_000)
    : null;
  const activeCashierCount = openShifts.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isToday ? "Today's Dashboard" : 'Owner Dashboard'}
        subtitle={isToday ? 'Live snapshot — auto-refreshes every 2 minutes.' : `${fromIso} to ${toIso}`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <a href="/reports/weekly-digest" className="btn-secondary justify-center text-sm">Weekly Digest</a>
            <RefreshIndicator fetchedAt={new Date().toISOString()} autoRefreshMs={120_000} />
          </div>
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Gross profit uses the stored sale-line cost whenever it exists. Older sales that never captured a line cost fall back to the product&apos;s current base cost until you backfill or target-correct them.
      </div>

      {/* Filter */}
      <ReportFilterCard columnsClassName="sm:grid-cols-4" submitLabel="Apply" submitTone="secondary">
        <div>
          <label className="label">Branch</label>
          <select className="input" name="storeId" defaultValue={selectedStoreId}>
            <option value="ALL">All branches</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
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
      </ReportFilterCard>

      {/* Live status bar — today's pulse at a glance (only when viewing today) */}
      {isToday && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-xs shadow-sm">
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${lastSaleRecord ? 'bg-success animate-pulse' : 'bg-black/20'}`} />
            <span className="text-black/50">Last sale</span>
            <span className="font-semibold text-ink">
              {lastSaleMinutesAgo === null
                ? 'No sales today yet'
                : lastSaleMinutesAgo === 0
                ? 'Just now'
                : lastSaleMinutesAgo < 60
                ? `${lastSaleMinutesAgo}m ago`
                : `${Math.floor(lastSaleMinutesAgo / 60)}h ${lastSaleMinutesAgo % 60}m ago`}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-xs shadow-sm">
            <span className="text-black/50">Active cashiers</span>
            <span className="font-semibold text-ink">{activeCashierCount}</span>
            {activeCashierCount > 0 && (
              <span className="text-black/40">
                {openShifts.slice(0, 3).map((s) => s.user?.name ?? '—').join(', ')}
                {openShifts.length > 3 ? ` +${openShifts.length - 3} more` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Sales" value={formatMoney(totalSales, currency)} tone="accent" />
        <StatCard
          label={`Gross Profit (${gpPercent}%)`}
          value={formatMoney(totalGrossMargin, currency)}
          tone={gpPercent >= 20 ? 'success' : gpPercent >= 0 ? 'warn' : 'danger'}
        />
        <StatCard label="Expenses" value={formatMoney(income.otherExpenses, currency)} />
        <StatCard
          label={`Net Profit (${npPercent}%)`}
          value={formatMoney(totalGrossMargin - income.otherExpenses, currency)}
          tone={npPercent >= 10 ? 'success' : npPercent >= 0 ? 'warn' : 'danger'}
        />
        <StatCard label="Debtors (AR)" value={formatMoney(outstandingAR, currency)} />
        <StatCard label="Payables (AP)" value={formatMoney(outstandingAP, currency)} />
      </div>

      {/* Data-quality warning: extremely negative GP almost always means wrong cost prices */}
      {gpPercent < -50 && totalSales > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⚠ Gross margin looks unusual ({gpPercent}%)</p>
          <p className="mt-0.5 text-amber-700">
            A margin this negative usually means product cost prices are set much higher than selling prices —
            possibly entered in whole {currency} instead of pesewas/cents, or a cost per case was applied to
            individual units. Go to <a href="/products" className="underline font-medium">Products</a> and
            review <strong>cost price</strong> for your top-selling items.
          </p>
        </div>
      )}

      {/* Payment split + Activity highlights */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Payment Split</h2>
          <div className="space-y-3 text-sm">
            {(
              [
                { label: 'Cash', key: 'CASH', cls: 'bg-emerald-500', text: 'text-emerald-700' },
                { label: 'Mobile Money (MoMo)', key: 'MOBILE_MONEY', cls: 'bg-amber-500', text: 'text-amber-700' },
                { label: 'Card', key: 'CARD', cls: 'bg-blue-500', text: 'text-accent' },
                { label: 'Bank Transfer', key: 'TRANSFER', cls: 'bg-purple-500', text: 'text-purple-700' },
              ] as const
            ).map(({ label, key, cls, text }) => {
              const amount = paymentSplit[key as keyof typeof paymentSplit];
              const pct = totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-black/60">{label}</span>
                    <span className={`font-semibold ${text}`}>
                      {formatMoney(amount, currency)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
                    <div className={`h-1.5 rounded-full ${cls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Activity Highlights</h2>
          {!hasActivity ? (
            <div className="flex flex-col items-center py-6 text-center text-sm text-black/40">
              <span>No voids, returns, adjustments, or cash variances in this period.</span>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {todayVoids.length > 0 && (
                <div className="flex justify-between rounded-lg bg-rose-50 px-3 py-2">
                  <span className="text-rose-700">Voids ({todayVoids.length})</span>
                  <span className="font-semibold text-rose-700">{formatMoney(voidTotal, currency)}</span>
                </div>
              )}
              {todayReturns.length > 0 && (
                <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2">
                  <span className="text-amber-700">Returns ({todayReturns.length})</span>
                  <span className="font-semibold text-amber-700">{formatMoney(returnTotal, currency)}</span>
                </div>
              )}
              {todayAdj.map((adj: any, i: number) => (
                <div key={i} className="flex flex-col gap-1 rounded-lg bg-accentSoft px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-accent">
                    Stock adj · {adj.product.name} · {adj.direction} {adj.qtyBase}
                  </span>
                  <span className="text-accent/70">{adj.user.name}</span>
                </div>
              ))}
              {cashVarTotal > 0 && (
                <div className="flex justify-between rounded-lg bg-purple-50 px-3 py-2">
                  <span className="text-purple-700">
                    Cash Variance ({todayCashVar.length} shift{todayCashVar.length !== 1 ? 's' : ''})
                  </span>
                  <span className="font-semibold text-purple-700">{formatMoney(cashVarTotal, currency)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Debtor Ageing + Top Debtors */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Debtor Ageing</h2>
          <div className="space-y-2 text-sm">
            {bucketKeys.map((bucket) => (
              <div key={bucket} className="flex justify-between">
                <span className="text-black/60">{bucket}</span>
                <span
                  className={`font-semibold ${
                    bucket === '90+ d' && ageingBuckets[bucket] > 0
                      ? 'text-rose-600'
                      : bucket === '61–90 d' && ageingBuckets[bucket] > 0
                      ? 'text-amber-600'
                      : ''
                  }`}
                >
                  {formatMoney(ageingBuckets[bucket], currency)}
                </span>
              </div>
            ))}
            <div className="mt-3 border-t border-black/10 pt-2 flex justify-between font-semibold">
              <span>Total AR</span>
              <span>{formatMoney(outstandingAR, currency)}</span>
            </div>
          </div>
        </div>

        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Top Debtors</h2>
          <div className="space-y-2 text-sm">
            {topDebtorList.length === 0 ? (
              <div className="py-4 text-center text-black/40">No outstanding debts</div>
            ) : (
              topDebtorList.map((d) => (
                <div key={d.name} className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{d.name}</span>
                  <span className="font-semibold text-rose-600 sm:text-right">{formatMoney(d.balance, currency)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Low Stock + Best Sellers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-display font-semibold sm:text-lg">Low Stock Alerts</h2>
            <a href="/reports/reorder-suggestions" className="text-xs text-black/40 hover:text-black/70">
              Reorder →
            </a>
          </div>
          <div className="space-y-2 text-sm">
            {lowStock.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="rounded-full bg-emerald-50 p-3">
                  <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="mt-2 text-sm text-black/70">All stock levels healthy</div>
              </div>
            ) : (
              lowStock.map((balance) => {
                const baseUnit = balance.product.productUnits.find((u) => u.isBaseUnit);
                const packaging = getPrimaryPackagingUnit(
                  balance.product.productUnits.map((pu) => ({
                    conversionToBase: pu.conversionToBase,
                    unit: pu.unit,
                  }))
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
                  <div key={balance.id} className="flex flex-col gap-1 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-medium">{balance.product.name}</span>
                      {balance.product.reorderQtyBase > 0 && (
                        <span className="ml-2 text-xs text-black/40">reorder {balance.product.reorderQtyBase}</span>
                      )}
                    </div>
                    <span className="font-semibold text-rose-600 sm:text-right">{mixed}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Top Revenue Products</h2>
          <div className="space-y-2 text-sm">
            {bestItems.length === 0 ? (
              <div className="py-6 text-center animate-fade-in-up">
                <p className="text-black/40">No sales in selected range</p>
                <div className="mt-2 flex justify-center gap-2">
                  <a href="/pos" className="text-xs text-accent hover:underline">Open POS</a>
                  <span className="text-black/20">|</span>
                  <a href="/onboarding#demo" className="text-xs text-accent hover:underline">Run Demo Day</a>
                </div>
              </div>
            ) : (
              bestItems.map((item) => {
                const baseUnit = item.units.find((u: any) => u.isBaseUnit);
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
                  <div key={item.name} className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="font-medium">{item.name}</span>
                      <span className="ml-2 text-xs text-black/40">{mixed}</span>
                    </div>
                    <span className="font-semibold text-emerald-700 sm:text-right">{formatMoney(item.revenue, currency)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
