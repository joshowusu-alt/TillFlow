import { buildDemoLedger, getSalesByDay } from '@/lib/demo-fixtures';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const fmt = (p: number) => formatMoney(p, 'GHS');

const PMC: Record<string, string> = {
  CASH:   'bg-emerald-100 text-emerald-800',
  MOMO:   'bg-amber-100 text-amber-800',
  CREDIT: 'bg-blue-100 text-blue-800',
  CARD:   'bg-slate-100 text-slate-700',
};

export default function DemoSalesPage() {
  const snapshot = buildDemoLedger();
  const byDay    = getSalesByDay(snapshot);
  const { totals, salesInvoices } = snapshot;

  const productMap = new Map(snapshot.products.map(p => [p.id, p]));
  const customerMap = new Map(snapshot.customers.map(c => [c.id, c]));

  const avgBasket = salesInvoices.length
    ? Math.round(totals.totalRevenuePence / salesInvoices.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Sales History</h1>
        <p className="mt-0.5 text-sm text-muted">
          {snapshot.period.start.toLocaleDateString('en-GH', { day:'numeric', month:'short' })} –{' '}
          {snapshot.period.end.toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' })}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Revenue',    value: fmt(totals.totalRevenuePence),   cls: 'text-accent font-bold' },
          { label: 'Transactions',     value: salesInvoices.length,             cls: 'text-ink font-bold' },
          { label: 'Avg Basket',       value: fmt(avgBasket),                   cls: 'text-ink font-bold' },
          { label: 'Credit Sales',     value: fmt(totals.creditSalesPence),     cls: 'text-blue-700 font-bold' },
        ].map(c => (
          <div key={c.label} className="card p-4 text-center">
            <div className="text-xs text-muted">{c.label}</div>
            <div className={`mt-1 text-lg ${c.cls}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Daily summary */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Daily Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 text-right font-semibold">Transactions</th>
                <th className="px-4 py-2.5 text-right font-semibold">Revenue</th>
                <th className="px-4 py-2.5 text-right font-semibold">COGS</th>
                <th className="px-4 py-2.5 text-right font-semibold">Gross Profit</th>
                <th className="px-4 py-2.5 text-right font-semibold">GP%</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(d => {
                const gpPct = d.revenuePence > 0 ? Math.round((d.gpPence / d.revenuePence) * 100) : 0;
                const label = new Date(d.date + 'T12:00:00').toLocaleDateString('en-GH', { weekday:'short', day:'numeric', month:'short' });
                return (
                  <tr key={d.date} className="border-b border-black/5 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-ink">{label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.count}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmt(d.revenuePence)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">{fmt(d.cogsPence)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-success">{fmt(d.gpPence)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{gpPct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/10 bg-slate-50">
                <td className="px-4 py-3 text-xs font-semibold">Total</td>
                <td className="px-4 py-3 text-right text-xs font-bold tabular-nums">{salesInvoices.length}</td>
                <td className="px-4 py-3 text-right text-xs font-bold tabular-nums text-accent">{fmt(totals.totalRevenuePence)}</td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-muted">{fmt(totals.totalCOGSPence)}</td>
                <td className="px-4 py-3 text-right text-xs font-bold tabular-nums text-success">{fmt(totals.grossProfitPence)}</td>
                <td className="px-4 py-3 text-right text-xs tabular-nums">{Math.round(totals.grossMarginBps / 100)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Transaction log (last 60) */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Transaction Log</h2>
          <p className="text-xs text-muted">Latest {Math.min(60, salesInvoices.length)} of {salesInvoices.length}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Invoice</th>
                <th className="px-4 py-2.5 font-semibold">Date / Time</th>
                <th className="px-4 py-2.5 font-semibold">Items</th>
                <th className="px-4 py-2.5 font-semibold">Payment</th>
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...salesInvoices]
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .slice(0, 60)
                .map(inv => {
                  const cust = inv.customerId ? customerMap.get(inv.customerId) : null;
                  const itemSummary = inv.lines
                    .slice(0, 2)
                    .map(l => productMap.get(l.productId)?.name ?? l.productId)
                    .join(', ')
                    + (inv.lines.length > 2 ? ` +${inv.lines.length - 2}` : '');
                  return (
                    <tr key={inv.id} className="border-b border-black/5 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-muted/80">{inv.id}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {inv.date.toLocaleDateString('en-GH', { day:'numeric', month:'short' })}{' '}
                        <span className="text-muted">{inv.date.toLocaleTimeString('en-GH', { hour:'2-digit', minute:'2-digit' })}</span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-muted">{itemSummary}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PMC[inv.paymentMethod] ?? ''}`}>
                          {inv.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted">{cust ? cust.name : '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(inv.subtotalPence)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
