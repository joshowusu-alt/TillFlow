import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function weekStart(offsetWeeks = 0) {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function WeeklyDigestPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Setup required.</div>;

  // week=0 = this week, week=-1 = last week, etc.
  const weekOffset = Number(searchParams?.week ?? -1);
  const wStart = weekStart(weekOffset);
  const wEnd = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);
  wEnd.setHours(23, 59, 59, 999);

  const bId = business.id;
  const currency = business.currency;

  const [
    salesRows,
    paymentsRows,
    voids,
    returns,
    riskAlerts,
    discountOverrides,
    cashVarShifts,
    bestLines,
    adjustments,
    cashierSales,
  ] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { businessId: bId, createdAt: { gte: wStart, lte: wEnd }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: { totalPence: true, grossMarginPence: true },
    }),
    prisma.salesPayment.findMany({
      where: { receivedAt: { gte: wStart, lte: wEnd }, salesInvoice: { businessId: bId } },
      select: { method: true, amountPence: true },
    }),
    prisma.salesInvoice.count({
      where: { businessId: bId, createdAt: { gte: wStart, lte: wEnd }, paymentStatus: 'VOID' },
    }),
    prisma.salesReturn.count({
      where: { store: { businessId: bId }, createdAt: { gte: wStart, lte: wEnd } },
    }),
    prisma.riskAlert.findMany({
      where: { businessId: bId, occurredAt: { gte: wStart, lte: wEnd } },
      select: { alertType: true, severity: true, cashierUser: { select: { name: true } } },
    }),
    prisma.salesInvoice.count({
      where: {
        businessId: bId,
        createdAt: { gte: wStart, lte: wEnd },
        discountOverrideReason: { not: null },
      },
    }),
    prisma.shift.findMany({
      where: {
        till: { store: { businessId: bId } },
        closedAt: { gte: wStart, lte: wEnd },
        variance: { not: null },
      },
      select: { variance: true, user: { select: { id: true, name: true } } },
    }),
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId: bId,
          createdAt: { gte: wStart, lte: wEnd },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        productId: true,
        qtyBase: true,
        lineTotalPence: true,
        product: { select: { name: true, defaultCostBasePence: true } },
      },
    }),
    prisma.stockAdjustment.count({
      where: { store: { businessId: bId }, createdAt: { gte: wStart, lte: wEnd } },
    }),
    prisma.salesInvoice.findMany({
      where: {
        businessId: bId,
        createdAt: { gte: wStart, lte: wEnd },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      select: {
        totalPence: true,
        discountOverrideReason: true,
        cashierUser: { select: { id: true, name: true } },
      },
    }),
  ]);

  const totalSales = salesRows.reduce((s, x) => s + x.totalPence, 0);
  const totalGP = salesRows.reduce((s, x) => s + (x.grossMarginPence ?? 0), 0);
  const gpPct = totalSales > 0 ? Math.round((totalGP / totalSales) * 100) : 0;
  const txCount = salesRows.length;

  const paymentSplit = paymentsRows.reduce(
    (acc, p) => { acc[p.method] = (acc[p.method] ?? 0) + p.amountPence; return acc; },
    {} as Record<string, number>
  );

  // Top sellers by revenue
  const productMap = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
  for (const line of bestLines) {
    const e = productMap.get(line.productId) ?? {
      name: line.product.name,
      qty: 0,
      revenue: 0,
      cost: line.product.defaultCostBasePence ?? 0,
    };
    e.qty += line.qtyBase;
    e.revenue += line.lineTotalPence;
    productMap.set(line.productId, e);
  }
  const topSellers = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topMargin = Array.from(productMap.values())
    .map((p) => {
      const estCost = (p.cost / 100) * p.qty; // rough estimate
      const margin = p.revenue - estCost * 100; // pence
      const pct = p.revenue > 0 ? Math.round((margin / p.revenue) * 100) : 0;
      return { ...p, margin, marginPct: pct };
    })
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, 5);

  // Risk by cashier
  const cashierRiskMap = new Map<string, { name: string; voids: number; discounts: number; cashVar: number }>();
  for (const alert of riskAlerts) {
    if (!alert.cashierUser) continue;
    const e = cashierRiskMap.get(alert.cashierUser.name) ?? { name: alert.cashierUser.name, voids: 0, discounts: 0, cashVar: 0 };
    if (alert.alertType === 'VOID_SALE') e.voids++;
    if (alert.alertType === 'DISCOUNT_OVERRIDE') e.discounts++;
    cashierRiskMap.set(alert.cashierUser.name, e);
  }
  for (const shift of cashVarShifts) {
    const e = cashierRiskMap.get(shift.user.name) ?? { name: shift.user.name, voids: 0, discounts: 0, cashVar: 0 };
    e.cashVar += Math.abs(shift.variance ?? 0);
    cashierRiskMap.set(shift.user.name, e);
  }

  // Cashier performance
  const cashierPerfMap = new Map<string, { name: string; sales: number; tx: number; discounts: number }>();
  for (const inv of cashierSales) {
    const e = cashierPerfMap.get(inv.cashierUser.id) ?? { name: inv.cashierUser.name, sales: 0, tx: 0, discounts: 0 };
    e.sales += inv.totalPence;
    e.tx++;
    if (inv.discountOverrideReason) e.discounts++;
    cashierPerfMap.set(inv.cashierUser.id, e);
  }
  const cashierPerf = Array.from(cashierPerfMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 5);
  const riskCashiers = Array.from(cashierRiskMap.values()).filter((c) => c.voids + c.discounts + c.cashVar > 0);

  const dateLabel = `${wStart.toDateString()} – ${wEnd.toDateString()}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Digest"
        subtitle={dateLabel}
        actions={
          <div className="flex gap-2">
            <a href={`?week=${weekOffset - 1}`} className="btn-secondary text-sm">← Prev Week</a>
            {weekOffset < 0 && (
              <a href={`?week=${weekOffset + 1}`} className="btn-secondary text-sm">Next Week →</a>
            )}
            <a href="/reports/dashboard" className="btn-secondary text-sm">Dashboard</a>
          </div>
        }
      />

      {/* Weekly KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Weekly Sales" value={formatMoney(totalSales, currency)} tone="accent" />
        <StatCard label={`Gross Profit (${gpPct}%)`} value={formatMoney(totalGP, currency)} tone={gpPct >= 20 ? 'success' : 'warn'} />
        <StatCard label="Transactions" value={String(txCount)} />
        <StatCard
          label="Avg. Transaction"
          value={formatMoney(txCount > 0 ? Math.round(totalSales / txCount) : 0, currency)}
        />
      </div>

      {/* Risk + Controls summary */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Voids" value={String(voids)} tone={voids > 0 ? 'warn' : 'default'} />
        <StatCard label="Returns" value={String(returns)} tone={returns > 0 ? 'warn' : 'default'} />
        <StatCard label="Discount Overrides" value={String(discountOverrides)} tone={discountOverrides > 0 ? 'warn' : 'default'} />
        <StatCard label="Stock Adjustments" value={String(adjustments)} />
      </div>

      {/* Payment split */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-display font-semibold">Payment Split</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          {Object.entries(paymentSplit).map(([method, amount]) => (
            <div key={method} className="flex flex-col items-center rounded-xl border border-black/5 bg-white px-6 py-4 shadow-card">
              <span className="text-xs text-black/40 uppercase">{method.replace('_', ' ')}</span>
              <span className="mt-1 text-lg font-semibold">{formatMoney(amount, currency)}</span>
              <span className="text-xs text-black/40">
                {totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top sellers + Top margin */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-display font-semibold">Top Sellers (by revenue)</h2>
          <div className="space-y-2 text-sm">
            {topSellers.map((p) => (
              <div key={p.name} className="flex justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
                <span>{p.name}</span>
                <span className="font-semibold">{formatMoney(p.revenue, currency)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="mb-4 text-lg font-display font-semibold">Top Margin Items (est.)</h2>
          <div className="space-y-2 text-sm">
            {topMargin.map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
                <span>{p.name}</span>
                <div className="text-right">
                  <span className="font-semibold text-emerald-700">{p.marginPct}% margin</span>
                  <span className="ml-2 text-xs text-black/40">{formatMoney(p.revenue, currency)} rev</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cashier Performance + Risk Trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-display font-semibold">Cashier Performance</h2>
          <div className="space-y-2 text-sm">
            {cashierPerf.length === 0 ? (
              <div className="py-4 text-center text-black/40">No sales this week</div>
            ) : (
              cashierPerf.map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-black/40">{c.tx} tx</span>
                  </div>
                  <span className="font-semibold">{formatMoney(c.sales, currency)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="mb-4 text-lg font-display font-semibold">Risk Trends by Cashier</h2>
          <div className="space-y-2 text-sm">
            {riskCashiers.length === 0 ? (
              <div className="py-4 text-center text-black/40">No risk events this week</div>
            ) : (
              riskCashiers.map((c) => (
                <div key={c.name} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-1 flex gap-3 text-xs text-black/60">
                    {c.voids > 0 && <span>{c.voids} voids</span>}
                    {c.discounts > 0 && <span>{c.discounts} disc. overrides</span>}
                    {c.cashVar > 0 && <span>Var: {formatMoney(c.cashVar, currency)}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
