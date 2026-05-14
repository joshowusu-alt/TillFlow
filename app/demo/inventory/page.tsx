import { buildDemoLedger, getStockMovements, getLowStockProducts } from '@/lib/demo-fixtures';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const fmt = (p: number) => formatMoney(p, 'GHS');

export default function DemoInventoryPage() {
  const snapshot  = buildDemoLedger();
  const movements = getStockMovements(snapshot);
  const lowStock  = getLowStockProducts(snapshot);

  const totalEndingValue = movements.reduce((s, r) => s + r.endingValuePence, 0);
  const totalSKUs  = movements.length;
  const outOfStock = movements.filter(r => r.endingQty <= 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inventory</h1>
          <p className="mt-0.5 text-sm text-muted">
            Opening + Bought − Sold = Left · all values in {snapshot.currency}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total SKUs',       value: totalSKUs,           style: 'font-bold text-ink' },
          { label: 'Inventory Value',  value: fmt(totalEndingValue), style: 'font-bold text-accent' },
          { label: 'Low Stock',        value: lowStock.length,      style: `font-bold ${lowStock.length > 0 ? 'text-amber-600' : 'text-success'}` },
          { label: 'Out of Stock',     value: outOfStock,           style: `font-bold ${outOfStock > 0 ? 'text-rose-600' : 'text-success'}` },
        ].map(c => (
          <div key={c.label} className="card p-4 text-center">
            <div className="text-xs text-muted">{c.label}</div>
            <div className={`mt-1 whitespace-nowrap tabular-nums ${c.style}`} style={{ fontSize: 'clamp(1.25rem, 6vw, 1.5rem)' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Low-stock alert */}
      {lowStock.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
            <h2 className="text-sm font-semibold text-amber-800">
              ⚠ {lowStock.length} products at or below reorder point
            </h2>
          </div>

          {/* Mobile card list */}
          <div className="divide-y divide-black/5 sm:hidden">
            {lowStock.map(r => (
              <div key={r.product.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{r.product.name}</div>
                  <div className="text-xs text-muted">{r.category.name} · Reorder at {r.product.reorderPoint}</div>
                </div>
                <div className="ml-3 shrink-0 text-right">
                  <div className="text-sm font-bold text-amber-600">{r.endingQty} left</div>
                  <div className="text-xs text-muted">
                    {r.endingQty <= 0 ? 'Out of stock' : 'Low stock'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black/5 text-left text-muted">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Reorder Pt</th>
                  <th className="px-4 py-2.5 text-right font-semibold">On Hand</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map(r => (
                  <tr key={r.product.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">{r.product.name}</td>
                    <td className="px-4 py-2.5 text-muted">{r.category.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.product.reorderPoint}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-600">{r.endingQty}</td>
                    <td className="px-4 py-2.5">
                      {r.endingQty <= 0
                        ? <span className="pill pill-unpaid">Out of stock</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Low stock</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full stock movement */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Stock Movement</h2>
          <p className="text-xs text-muted">Opening + Bought − Sold = Left</p>
        </div>

        {/* Mobile card list */}
        <div className="divide-y divide-black/5 sm:hidden">
          {movements.map(r => (
            <div
              key={r.product.id}
              className={`px-4 py-3.5 ${r.isLowStock ? 'bg-amber-50/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{r.product.name}</div>
                  <div className="font-mono text-xs text-muted/70">{r.product.sku}</div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                  style={{ background: r.category.colour }}
                >
                  {r.category.name}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                <span>Opening <span className="font-medium text-ink">{r.openingQty}</span></span>
                {r.purchasedQty > 0 && (
                  <>
                    <span className="text-black/20">·</span>
                    <span>Bought <span className="font-medium text-success">+{r.purchasedQty}</span></span>
                  </>
                )}
                {r.soldQty > 0 && (
                  <>
                    <span className="text-black/20">·</span>
                    <span>Sold <span className="font-medium text-rose-600">−{r.soldQty}</span></span>
                  </>
                )}
                <span className="text-black/20">·</span>
                <span>Left <span className={`font-semibold ${r.isLowStock ? 'text-amber-600' : 'text-ink'}`}>{r.endingQty}</span></span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-muted">Value</span>
                <span className="text-xs font-semibold tabular-nums text-accent">{fmt(r.endingValuePence)}</span>
              </div>
              {r.isLowStock && (
                <div className="mt-2 inline-flex rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {r.endingQty <= 0 ? 'Out of stock' : 'Low stock'}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between border-t-2 border-black/10 bg-slate-50 px-4 py-3">
            <span className="text-xs font-semibold text-ink">Total Inventory Value</span>
            <span className="text-xs font-bold tabular-nums text-accent">{fmt(totalEndingValue)}</span>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">SKU</th>
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 text-right font-semibold">Opening</th>
                <th className="px-4 py-2.5 text-right font-semibold">Bought</th>
                <th className="px-4 py-2.5 text-right font-semibold">Sold</th>
                <th className="px-4 py-2.5 text-right font-semibold">Left</th>
                <th className="px-4 py-2.5 text-right font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(r => (
                <tr
                  key={r.product.id}
                  className={`border-b border-black/5 last:border-0 ${r.isLowStock ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="px-4 py-2 font-mono text-muted/80">{r.product.sku}</td>
                  <td className="max-w-[180px] truncate px-4 py-2 font-medium text-ink">{r.product.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ background: r.category.colour }}
                    >
                      {r.category.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.openingQty}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-success">{r.purchasedQty > 0 ? `+${r.purchasedQty}` : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600">{r.soldQty > 0 ? `−${r.soldQty}` : '—'}</td>
                  <td className={`px-4 py-2 text-right font-semibold tabular-nums ${r.isLowStock ? 'text-amber-600' : ''}`}>
                    {r.endingQty}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(r.endingValuePence)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/10 bg-slate-50">
                <td colSpan={7} className="px-4 py-3 text-right text-xs font-semibold text-ink">Total Inventory Value</td>
                <td className="px-4 py-3 text-right text-xs font-bold tabular-nums text-accent">{fmt(totalEndingValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
