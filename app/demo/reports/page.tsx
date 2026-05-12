import {
  buildDemoLedger,
  getIncomeStatement,
  getCashFlow,
  getTopProducts,
  getCategoryPerformance,
  getStockMovements,
  getLowStockProducts,
  getDebtorBalances,
  getSupplierPayables,
} from '@/lib/demo-fixtures';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const fmt = (p: number) => formatMoney(p, 'GHS');

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-black/8 px-5 py-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
    </div>
  );
}

export default function DemoReportsPage() {
  const snapshot  = buildDemoLedger();
  const income    = getIncomeStatement(snapshot);
  const cashFlow  = getCashFlow(snapshot);
  const topProds  = getTopProducts(snapshot, 10);
  const catPerf   = getCategoryPerformance(snapshot);
  const movements = getStockMovements(snapshot);
  const lowStock  = getLowStockProducts(snapshot);
  const debtors   = getDebtorBalances(snapshot);
  const payables  = getSupplierPayables(snapshot);

  const { period } = snapshot;
  const periodLabel = `${period.start.toLocaleDateString('en-GH', { day:'numeric', month:'short' })} – ${period.end.toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' })}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Reports</h1>
        <p className="mt-0.5 text-sm text-muted">{periodLabel} · All figures derived from demo supermarket data</p>
      </div>

      {/* Income Statement */}
      <div className="card overflow-hidden">
        <SectionHeader title="Income Statement" subtitle="14-day operating period" />
        <div className="p-5">
          <div className="max-w-sm space-y-2 text-sm">
            {[
              { label: 'Revenue',             value: fmt(income.revenuePence),     cls: '' },
              { label: 'Cost of goods sold',  value: `(${fmt(income.cogsPence)})`, cls: 'text-muted' },
              { label: 'Gross profit',        value: fmt(income.grossProfitPence), cls: 'font-semibold text-success' },
              { label: `Gross margin`,        value: `${income.grossMarginPct}%`,  cls: 'text-muted text-xs' },
              { label: 'Operating expenses',  value: `(${fmt(income.expensesPence)})`, cls: 'text-muted' },
              { label: 'Net profit',          value: fmt(income.netProfitPence),   cls: 'font-bold text-ink border-t border-black/10 pt-2 mt-1' },
              { label: 'Net margin',          value: `${income.netMarginPct}%`,    cls: 'text-muted text-xs' },
            ].map(r => (
              <div key={r.label} className={`flex justify-between ${r.cls}`}>
                <span>{r.label}</span>
                <span className="tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="card overflow-hidden">
        <SectionHeader title="Cash Position" subtitle="Cash + MoMo reconciliation" />
        <div className="p-5">
          <div className="max-w-sm space-y-2 text-sm">
            {[
              { label: 'Opening cash',          value: fmt(cashFlow.openingCashPence),     cls: '' },
              { label: '+ Cash sales',          value: fmt(cashFlow.cashSalesPence),       cls: 'text-success' },
              { label: '+ Credit collected',    value: fmt(cashFlow.creditCollectedPence), cls: 'text-success' },
              { label: '− Purchases paid',      value: `(${fmt(cashFlow.purchasesPaidPence)})`, cls: 'text-muted' },
              { label: '− Expenses paid',       value: `(${fmt(cashFlow.expensesPaidPence)})`, cls: 'text-muted' },
              { label: 'Closing cash',          value: fmt(cashFlow.endingCashPence),      cls: 'font-bold text-ink border-t border-black/10 pt-2 mt-1' },
              { label: 'MoMo collected',        value: fmt(cashFlow.momoSalesPence),       cls: 'text-amber-600' },
              { label: 'Total liquid (cash+momo)', value: fmt(cashFlow.totalLiquidPence),  cls: 'font-bold text-accent border-t border-black/10 pt-2 mt-1' },
            ].map(r => (
              <div key={r.label} className={`flex justify-between ${r.cls}`}>
                <span>{r.label}</span>
                <span className="tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="card overflow-hidden">
        <SectionHeader title="Top 10 Products by Revenue" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-5 py-2.5 font-semibold">#</th>
                <th className="px-5 py-2.5 font-semibold">Product</th>
                <th className="px-5 py-2.5 text-right font-semibold">Units Sold</th>
                <th className="px-5 py-2.5 text-right font-semibold">Revenue</th>
                <th className="px-5 py-2.5 text-right font-semibold">COGS</th>
                <th className="px-5 py-2.5 text-right font-semibold">Gross Profit</th>
                <th className="px-5 py-2.5 text-right font-semibold">GP%</th>
              </tr>
            </thead>
            <tbody>
              {topProds.map((r, i) => (
                <tr key={r.product.id} className="border-b border-black/5 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-bold text-muted/60">{i + 1}</td>
                  <td className="px-5 py-2.5 font-medium text-ink">{r.product.name}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.soldQty}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{fmt(r.revenuePence)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted">{fmt(r.cogsPence)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-success">{fmt(r.gpPence)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {r.revenuePence > 0 ? `${Math.round((r.gpPence / r.revenuePence) * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Performance */}
      <div className="card overflow-hidden">
        <SectionHeader title="Category Performance" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-5 py-2.5 font-semibold">Category</th>
                <th className="px-5 py-2.5 text-right font-semibold">Units Sold</th>
                <th className="px-5 py-2.5 text-right font-semibold">Revenue</th>
                <th className="px-5 py-2.5 text-right font-semibold">Gross Profit</th>
                <th className="px-5 py-2.5 text-right font-semibold">GP%</th>
              </tr>
            </thead>
            <tbody>
              {catPerf.map(r => (
                <tr key={r.category.id} className="border-b border-black/5 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.category.colour }} />
                      <span className="font-medium">{r.category.name}</span>
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.unitsSold}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{fmt(r.revenuePence)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-success">{fmt(r.gpPence)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.gpPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Stock / Reorder */}
      <div className="card overflow-hidden">
        <SectionHeader
          title={`Reorder List — ${lowStock.length} SKUs`}
          subtitle="Products at or below reorder point"
        />
        {lowStock.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">All products are above reorder levels.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black/5 text-left text-muted">
                  <th className="px-5 py-2.5 font-semibold">Product</th>
                  <th className="px-5 py-2.5 font-semibold">Category</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Reorder Pt</th>
                  <th className="px-5 py-2.5 text-right font-semibold">On Hand</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map(r => (
                  <tr key={r.product.id} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-2.5 font-medium">{r.product.name}</td>
                    <td className="px-5 py-2.5 text-muted">{r.category.name}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.product.reorderPoint}</td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-amber-600">{r.endingQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Debtor Balances */}
      <div className="card overflow-hidden">
        <SectionHeader title="Debtor Balances (Accounts Receivable)" />
        {debtors.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No outstanding debtor balances.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-5 py-2.5 font-semibold">Customer</th>
                <th className="px-5 py-2.5 text-right font-semibold">Invoiced</th>
                <th className="px-5 py-2.5 text-right font-semibold">Collected</th>
                <th className="px-5 py-2.5 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map(r => (
                <tr key={r.customer.id} className="border-b border-black/5 last:border-0">
                  <td className="px-5 py-2.5 font-medium">{r.customer.name}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{fmt(r.invoicedPence)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-success">{fmt(r.collectedPence)}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-amber-600">{fmt(r.balancePence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Supplier Payables */}
      <div className="card overflow-hidden">
        <SectionHeader title="Supplier Payables (Accounts Payable)" />
        {payables.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No outstanding supplier balances.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-5 py-2.5 font-semibold">Supplier</th>
                <th className="px-5 py-2.5 font-semibold">Invoice Ref</th>
                <th className="px-5 py-2.5 text-right font-semibold">Invoice Total</th>
                <th className="px-5 py-2.5 text-right font-semibold">Paid</th>
                <th className="px-5 py-2.5 text-right font-semibold">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {payables.map(r => (
                <tr key={r.invoice.id} className="border-b border-black/5 last:border-0">
                  <td className="px-5 py-2.5 font-medium">{r.supplier.name}</td>
                  <td className="px-5 py-2.5 font-mono text-muted/70">{r.invoice.ref}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{fmt(r.invoice.totalPence)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-success">{fmt(r.invoice.paidPence)}</td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-amber-600">{fmt(r.outstandingPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stock movement summary */}
      <div className="card overflow-hidden">
        <SectionHeader title="Stock Movement Summary" subtitle="All 100 SKUs · opening + purchased − sold = ending" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-5 py-2.5 font-semibold">Product</th>
                <th className="px-5 py-2.5 text-right font-semibold">Opening</th>
                <th className="px-5 py-2.5 text-right font-semibold">Purchased</th>
                <th className="px-5 py-2.5 text-right font-semibold">Sold</th>
                <th className="px-5 py-2.5 text-right font-semibold">Ending</th>
                <th className="px-5 py-2.5 text-right font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(r => (
                <tr
                  key={r.product.id}
                  className={`border-b border-black/5 last:border-0 ${r.isLowStock ? 'bg-amber-50/50' : 'hover:bg-slate-50'}`}
                >
                  <td className="max-w-[200px] truncate px-5 py-2 font-medium">{r.product.name}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{r.openingQty}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-success">{r.purchasedQty > 0 ? `+${r.purchasedQty}` : '—'}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-rose-600">{r.soldQty > 0 ? `−${r.soldQty}` : '—'}</td>
                  <td className={`px-5 py-2 text-right font-semibold tabular-nums ${r.isLowStock ? 'text-amber-600' : ''}`}>
                    {r.endingQty}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">{fmt(r.endingValuePence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
