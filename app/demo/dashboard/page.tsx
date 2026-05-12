import {
  buildDemoLedger,
  getDashboardKPIs,
  getSalesByDay,
  getTopProducts,
  getCategoryPerformance,
  getPaymentSplit,
} from '@/lib/demo-fixtures';
import { formatMoney } from '@/lib/format';
import StatCard from '@/components/StatCard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function fmt(pence: number) {
  return formatMoney(pence, 'GHS');
}

// Simple inline bar chart (pure CSS, no client JS needed)
function MiniBar({ pct, colour }: { pct: number; colour: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-black/5 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: colour }} />
    </div>
  );
}

export default function DemoDashboardPage() {
  const snapshot = buildDemoLedger();
  const kpis     = getDashboardKPIs(snapshot);
  const byDay    = getSalesByDay(snapshot);
  const topProds = getTopProducts(snapshot, 8);
  const catPerf  = getCategoryPerformance(snapshot);
  const payMix   = getPaymentSplit(snapshot);

  const maxDayRevenue = Math.max(...byDay.map(d => d.revenuePence), 1);

  const { period, totals } = snapshot;
  const periodLabel = `${period.start.toLocaleDateString('en-GH', { day:'numeric', month:'short' })} – ${period.end.toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' })}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{snapshot.businessName}</h1>
          <p className="mt-0.5 text-sm text-muted">{periodLabel} · 14-day operating history</p>
        </div>
        <a
          href="/register"
          className="btn-primary text-sm"
        >
          Start your real business →
        </a>
      </div>

      {/* Period KPI cards */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">14-Day Performance</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Revenue"
            value={fmt(kpis.periodRevenuePence)}
            tone="accent"
            helper={`${kpis.periodTxCount} transactions · avg ${fmt(Math.round(kpis.periodRevenuePence / kpis.periodTxCount))}/sale`}
          />
          <StatCard
            label="Gross Profit"
            value={fmt(kpis.periodGrossProfitPence)}
            tone="success"
            helper={`${kpis.periodGrossMarginPct}% gross margin`}
          />
          <StatCard
            label="Net Profit"
            value={fmt(kpis.periodNetProfitPence)}
            tone={kpis.periodNetProfitPence >= 0 ? 'success' : 'danger'}
            helper={`After ${fmt(totals.totalExpensesPence)} in expenses`}
          />
          <StatCard
            label="Avg Daily Sales"
            value={fmt(kpis.avgDailySalesPence)}
            tone="default"
            helper="Over the 14-day period"
          />
        </div>
      </div>

      {/* Today + balance cards */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Current Balances</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Cash on Hand"   value={fmt(kpis.cashPositionPence)}  tone="accent"   helper="Closing cash position" />
          <StatCard label="MoMo Collected" value={fmt(kpis.momoPositionPence)}  tone="success"  helper="Mobile money received" />
          <StatCard label="Debtor Balance" value={fmt(kpis.arBalancePence)}     tone={kpis.arBalancePence > 0 ? 'warn' : 'default'} helper="Outstanding customer credit" />
          <StatCard label="Supplier Payable" value={fmt(kpis.apBalancePence)}   tone={kpis.apBalancePence > 0 ? 'warn' : 'default'} helper="Owed to suppliers" />
        </div>
      </div>

      {/* Alerts row */}
      {kpis.lowStockCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <span className="text-amber-600">⚠</span>
          <span className="font-medium text-amber-800">
            {kpis.lowStockCount} product{kpis.lowStockCount !== 1 ? 's' : ''} at or below reorder point.
          </span>
          <Link href="/demo/inventory" className="ml-auto text-xs font-semibold text-amber-700 underline hover:no-underline">
            View inventory →
          </Link>
        </div>
      )}

      {/* Two-column: sales trend + payment split */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales by day */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">Sales by Day</h2>
          <div className="space-y-2">
            {byDay.map(d => {
              const pct = Math.round((d.revenuePence / maxDayRevenue) * 100);
              const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-GH', { weekday:'short', day:'numeric', month:'short' });
              return (
                <div key={d.date} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-xs">
                  <span className="text-muted">{label}</span>
                  <MiniBar pct={pct} colour="#1E40AF" />
                  <span className="text-right font-medium tabular-nums text-ink w-20">{fmt(d.revenuePence)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment mix + income summary */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Payment Method Mix</h2>
            <div className="space-y-3">
              {[
                { label: 'Cash',   pct: payMix.cashPct,   pence: payMix.cashPence,   colour: '#059669' },
                { label: 'MoMo',   pct: payMix.momoPct,   pence: payMix.momoPence,   colour: '#f59e0b' },
                { label: 'Credit', pct: payMix.creditPct, pence: payMix.creditPence, colour: '#3b82f6' },
              ].map(row => (
                <div key={row.label} className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">{row.label}</span>
                    <span className="text-muted">{fmt(row.pence)} · {row.pct}%</span>
                  </div>
                  <MiniBar pct={row.pct} colour={row.colour} />
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Income Summary</h2>
            <div className="space-y-1.5 text-sm">
              {[
                { label: 'Revenue',        value: fmt(totals.totalRevenuePence),    style: '' },
                { label: '− Cost of goods', value: `(${fmt(totals.totalCOGSPence)})`, style: 'text-muted' },
                { label: 'Gross profit',   value: fmt(totals.grossProfitPence),     style: 'font-semibold text-success' },
                { label: '− Expenses',     value: `(${fmt(totals.totalExpensesPence)})`, style: 'text-muted' },
                { label: 'Net profit',     value: fmt(totals.netProfitPence),       style: 'font-bold text-ink border-t border-black/10 pt-1.5 mt-1.5' },
              ].map(r => (
                <div key={r.label} className={`flex justify-between ${r.style}`}>
                  <span>{r.label}</span>
                  <span className="tabular-nums">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top products + category performance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Top Products by Revenue</h2>
            <Link href="/demo/inventory" className="text-xs text-accent hover:underline">All inventory →</Link>
          </div>
          <div className="space-y-2.5">
            {topProds.map((r, i) => (
              <div key={r.product.id} className="flex items-center gap-3 text-xs">
                <span className="w-5 text-right font-bold text-muted/60">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-ink">{r.product.name}</div>
                  <div className="text-muted">{r.soldQty} units sold</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{fmt(r.revenuePence)}</div>
                  <div className="text-success tabular-nums">
                    {r.revenuePence > 0 ? `${Math.round(r.gpPence / r.revenuePence * 100)}% GP` : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Category Performance</h2>
            <Link href="/demo/reports" className="text-xs text-accent hover:underline">Full report →</Link>
          </div>
          <div className="space-y-2.5">
            {catPerf.slice(0, 8).map(r => (
              <div key={r.category.id} className="flex items-center gap-3 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: r.category.colour }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink">{r.category.name}</div>
                  <div className="text-muted">{r.unitsSold} units · {r.gpPct}% margin</div>
                </div>
                <span className="font-semibold tabular-nums">{fmt(r.revenuePence)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA footer */}
      <div className="rounded-2xl bg-gradient-to-br from-accent to-blue-700 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">This could be your business data.</h3>
            <p className="mt-1 text-sm text-white/80">
              Get your own TillFlow with multi-branch support, WhatsApp alerts, offline mode, and real-time reports.
            </p>
          </div>
          <a
            href="/register"
            className="inline-flex min-h-11 items-center rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-accent hover:bg-blue-50 transition-colors shrink-0"
          >
            Start your real business →
          </a>
        </div>
      </div>
    </div>
  );
}
