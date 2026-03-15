import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import StatCard from '@/components/StatCard';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { formatMoney } from '@/lib/format';
import { requireBusiness } from '@/lib/auth';
import { getWeeklyDigestData } from '@/lib/reports/weekly-digest';

export const dynamic = 'force-dynamic';

function weekStart(offsetWeeks = 0) {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '—';
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export default async function WeeklyDigestPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) {
    return (
      <div className="card p-6">
        <EmptyState icon="chart" title="Setup required" subtitle="Complete your shop setup to unlock weekly reports." cta={{ label: 'Complete Setup', href: '/onboarding' }} />
      </div>
    );
  }

  const weekOffset = Number(searchParams?.week ?? -1);
  const wStart = weekStart(weekOffset);
  const wEnd = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);
  wEnd.setHours(23, 59, 59, 999);

  const currency = business.currency;
  const data = await getWeeklyDigestData(business.id, wStart, wEnd);
  const dateLabel = `${wStart.toDateString()} – ${wEnd.toDateString()}`;

  const salesChange = pctChange(data.totalSalesPence, data.prevTotalSalesPence);
  const gpChange = pctChange(data.grossProfitPence, data.prevGrossProfitPence);
  const txChange = pctChange(data.txCount, data.prevTxCount);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Digest"
        subtitle={dateLabel}
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <a href={`?week=${weekOffset - 1}`} className="btn-secondary min-w-[calc(50%-0.25rem)] flex-1 justify-center text-sm sm:min-w-0 sm:flex-none">Prev Week</a>
            {weekOffset < 0 && (
              <a href={`?week=${weekOffset + 1}`} className="btn-secondary min-w-[calc(50%-0.25rem)] flex-1 justify-center text-sm sm:min-w-0 sm:flex-none">Next Week</a>
            )}
            <DownloadLink
              href={`/api/reports/weekly-digest?week=${weekOffset}`}
              fallbackFilename={`weekly-digest-${wStart.toISOString().slice(0, 10)}.csv`}
              className="btn-secondary min-w-[calc(50%-0.25rem)] flex-1 justify-center text-sm sm:min-w-0 sm:flex-none"
            >
              Export CSV
            </DownloadLink>
            <a href="/reports/command-center" className="btn-secondary min-w-[calc(50%-0.25rem)] flex-1 justify-center text-sm sm:min-w-0 sm:flex-none">Command Center</a>
          </div>
        }
      />

      {/* Weekly KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Weekly Sales"
          value={formatMoney(data.totalSalesPence, currency)}
          tone="accent"
          helper={`${salesChange} vs prev week`}
        />
        <StatCard
          label={`Gross Profit (${data.gpPercent}%)`}
          value={formatMoney(data.grossProfitPence, currency)}
          tone={data.gpPercent >= 20 ? 'success' : data.gpPercent >= 0 ? 'warn' : 'danger'}
          helper={`${gpChange} vs prev week`}
        />
        <StatCard label="Transactions" value={String(data.txCount)} helper={`${txChange} vs prev week`} />
        <StatCard
          label="Avg. Transaction"
          value={formatMoney(data.txCount > 0 ? Math.round(data.totalSalesPence / data.txCount) : 0, currency)}
        />
      </div>

      {/* Data-quality warning for extremely negative GP */}
      {data.gpPercent < -50 && data.totalSalesPence > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⚠ Gross margin looks unusual ({data.gpPercent}%)</p>
          <p className="mt-0.5 text-amber-700">
            A margin this negative usually means product cost prices are set much higher than selling prices.
            Go to <a href="/products" className="underline font-medium">Products</a> and review the{' '}
            <strong>cost price</strong> for your top-selling items to correct this.
          </p>
        </div>
      )}

      {/* Week-over-Week Comparison */}
      <div className="card p-3.5 sm:p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Week-over-Week</h2>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-muted">Sales</span>
            <span className={`font-semibold ${data.totalSalesPence >= data.prevTotalSalesPence ? 'text-success' : 'text-rose'}`}>
              {salesChange}
            </span>
          </div>
          <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-muted">Gross Profit</span>
            <span className={`font-semibold ${data.grossProfitPence >= data.prevGrossProfitPence ? 'text-success' : 'text-rose'}`}>
              {gpChange}
            </span>
          </div>
          <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-muted">Transactions</span>
            <span className={`font-semibold ${data.txCount >= data.prevTxCount ? 'text-success' : 'text-rose'}`}>
              {txChange}
            </span>
          </div>
        </div>
      </div>

      {/* Risk + Controls summary */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Voids" value={String(data.voidCount)} tone={data.voidCount > 0 ? 'warn' : 'default'} />
        <StatCard label="Returns" value={String(data.returnCount)} tone={data.returnCount > 0 ? 'warn' : 'default'} />
        <StatCard label="Discount Overrides" value={String(data.discountOverrides)} tone={data.discountOverrides > 0 ? 'warn' : 'default'} />
        <StatCard label="Stock Adjustments" value={String(data.adjustmentCount)} />
      </div>

      {/* Payment split */}
      <div className="card p-4 sm:p-6">
        <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Payment Split</h2>
        {Object.keys(data.paymentSplit).length === 0 ? (
          <EmptyState icon="receipt" title="No payments this week" subtitle="Record sales to see payment breakdown." />
        ) : (
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(data.paymentSplit).map(([method, amount]) => (
              <div key={method} className="flex flex-col items-center rounded-xl border border-black/5 bg-white px-4 py-3.5 text-center shadow-card sm:px-6 sm:py-4">
                <span className="text-xs text-muted uppercase">{method.replace('_', ' ')}</span>
                <span className="mt-1 text-lg font-semibold">{formatMoney(amount, currency)}</span>
                <span className="text-xs text-muted">
                  {data.totalSalesPence > 0 ? Math.round((amount / data.totalSalesPence) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top sellers + Top margin */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Top Sellers (by revenue)</h2>
          {data.topSellers.length === 0 ? (
            <EmptyState icon="chart" title="No sales data" subtitle="Record sales to see top products." />
          ) : (
            <div className="space-y-2 text-sm">
              {data.topSellers.map((p) => (
                <div key={p.name} className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{p.name}</span>
                  <span className="font-semibold sm:text-right">{formatMoney(p.revenue, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Top Margin Items (est.)</h2>
          {data.topMargin.length === 0 ? (
            <EmptyState icon="chart" title="No margin data" subtitle="Record sales with cost prices to see margins." />
          ) : (
            <div className="space-y-2 text-sm">
              {data.topMargin.map((p) => (
                <div key={p.name} className="flex flex-col gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{p.name}</span>
                  <div className="flex flex-wrap items-center gap-2 sm:text-right sm:justify-end">
                    <Badge tone={p.marginPct >= 20 ? 'success' : p.marginPct >= 0 ? 'warn' : 'danger'}>
                      {p.marginPct}% margin
                    </Badge>
                    <span className="text-xs text-muted">{formatMoney(p.revenue, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cashier Performance + Risk Trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Cashier Performance</h2>
          {data.cashierPerf.length === 0 ? (
            <EmptyState icon="receipt" title="No sales this week" subtitle="Cashier performance will appear after recording sales." />
          ) : (
            <div className="space-y-2 text-sm">
              {data.cashierPerf.map((c) => (
                <div key={c.name} className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-muted">{c.tx} tx</span>
                  </div>
                  <span className="font-semibold sm:text-right">{formatMoney(c.sales, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-display font-semibold sm:text-lg">Risk Trends by Cashier</h2>
          {data.riskCashiers.length === 0 ? (
            <EmptyState icon="check" title="No risk events" subtitle="No voids, discount overrides, or cash variances this week." />
          ) : (
            <div className="space-y-2 text-sm">
              {data.riskCashiers.map((c) => (
                <div key={c.name} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-1 flex gap-3 text-xs text-muted">
                    {c.voids > 0 && <span>{c.voids} voids</span>}
                    {c.discounts > 0 && <span>{c.discounts} disc. overrides</span>}
                    {c.cashVar > 0 && <span>Var: {formatMoney(c.cashVar, currency)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
