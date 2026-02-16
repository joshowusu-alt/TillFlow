import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatMoney } from '@/lib/format';

export default async function MarginsPage({
  searchParams
}: {
  searchParams: { period?: string };
}) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div>Business not found</div>;

  const period = searchParams.period || '30';
  const days = parseInt(period, 10) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get all sales lines with product and cost data
  const salesLines = await prisma.salesInvoiceLine.findMany({
    where: {
      salesInvoice: {
        businessId: business.id,
        createdAt: { gte: startDate },
        paymentStatus: { not: 'VOID' }
      }
    },
    include: {
      product: true,
      salesInvoice: { select: { createdAt: true } }
    }
  });

  // Aggregate by product
  const productStats = new Map<
    string,
    {
      id: string;
      name: string;
      qtySold: number;
      revenue: number;
      cost: number;
      profit: number;
    }
  >();

  for (const line of salesLines) {
    const existing = productStats.get(line.productId) ?? {
      id: line.productId,
      name: line.product.name,
      qtySold: 0,
      revenue: 0,
      cost: 0,
      profit: 0
    };

    const lineRevenue = line.lineTotalPence;
    const lineCost = line.qtyBase * line.product.defaultCostBasePence;
    const lineProfit = lineRevenue - lineCost;

    existing.qtySold += line.qtyBase;
    existing.revenue += lineRevenue;
    existing.cost += lineCost;
    existing.profit += lineProfit;

    productStats.set(line.productId, existing);
  }

  // Convert to array and sort by profit
  const products = Array.from(productStats.values())
    .map((p) => ({
      ...p,
      marginPercent: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
    }))
    .sort((a, b) => b.profit - a.profit);

  // Calculate totals
  const totals = products.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      cost: acc.cost + p.cost,
      profit: acc.profit + p.profit
    }),
    { revenue: 0, cost: 0, profit: 0 }
  );

  const overallMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  // Top performers and underperformers
  const topPerformers = products.slice(0, 5);
  const lowMarginProducts = [...products]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => a.marginPercent - b.marginPercent)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-black/40">Reports</div>
          <h1 className="text-2xl font-display font-semibold">Profit Margins</h1>
        </div>
        <div className="flex gap-2">
          {['7', '30', '90', '365'].map((p) => (
            <a
              key={p}
              href={`/reports/margins?period=${p}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                period === p
                  ? 'bg-accent text-white'
                  : 'bg-white text-black/70 hover:bg-black/5'
              }`}
            >
              {p === '7' ? '7 days' : p === '30' ? '30 days' : p === '90' ? '90 days' : '1 year'}
            </a>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-black/40">Total Revenue</div>
          <div className="mt-1 text-2xl font-bold">{formatMoney(totals.revenue, business.currency)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-black/40">Total Cost</div>
          <div className="mt-1 text-2xl font-bold">{formatMoney(totals.cost, business.currency)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-black/40">Gross Profit</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {formatMoney(totals.profit, business.currency)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-black/40">Overall Margin</div>
          <div className="mt-1 text-2xl font-bold">{overallMargin.toFixed(1)}%</div>
        </div>
      </div>

      {/* Top and Low Margin */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-lg font-display font-semibold text-emerald-700">
            Top Profit Contributors
          </h2>
          <p className="text-sm text-black/50">Products generating the most profit</p>
          <div className="mt-4 space-y-3">
            {topPerformers.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-emerald-50 p-3">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-black/50">
                    {p.qtySold} sold · {formatMoney(p.revenue, business.currency)} revenue
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-700">
                    {formatMoney(p.profit, business.currency)}
                  </div>
                  <div className="text-xs text-emerald-600">{p.marginPercent.toFixed(1)}% margin</div>
                </div>
              </div>
            ))}
            {topPerformers.length === 0 && (
              <div className="text-center text-sm text-black/50 py-4">No sales data yet</div>
            )}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-lg font-display font-semibold text-amber-700">
            Low Margin Products
          </h2>
          <p className="text-sm text-black/50">Consider reviewing pricing or costs</p>
          <div className="mt-4 space-y-3">
            {lowMarginProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-black/50">
                    {p.qtySold} sold · {formatMoney(p.revenue, business.currency)} revenue
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${p.profit < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                    {formatMoney(p.profit, business.currency)}
                  </div>
                  <div className={`text-xs ${p.marginPercent < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                    {p.marginPercent.toFixed(1)}% margin
                  </div>
                </div>
              </div>
            ))}
            {lowMarginProducts.length === 0 && (
              <div className="text-center text-sm text-black/50 py-4">No sales data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Full Product Table */}
      <div className="mt-6 card p-4">
        <h2 className="text-lg font-display font-semibold">All Products</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Product</th>
                <th className="text-right">Qty Sold</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Profit</th>
                <th className="text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-right">{p.qtySold}</td>
                  <td className="text-right">{formatMoney(p.revenue, business.currency)}</td>
                  <td className="text-right">{formatMoney(p.cost, business.currency)}</td>
                  <td className={`text-right font-semibold ${p.profit < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatMoney(p.profit, business.currency)}
                  </td>
                  <td className="text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.marginPercent >= 30
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.marginPercent >= 15
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {p.marginPercent.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-black/50 py-8">
                    No sales data for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
