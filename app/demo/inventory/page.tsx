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
            Opening + purchases − sales = ending stock · all values in {snapshot.currency}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total SKUs',       value: totalSKUs,                       style: 'font-bold text-ink' },
          { label: 'Inventory Value',  value: fmt(totalEndingValue),            style: 'font-bold text-accent' },
          { label: 'Low Stock',        value: lowStock.length,                  style: `font-bold ${lowStock.length > 0 ? 'text-amber-600' : 'text-success'}` },
          { label: 'Out of Stock',     value: outOfStock,                       style: `font-bold ${outOfStock > 0 ? 'text-rose-600' : 'text-success'}` },
        ].map(c => (
          <div key={c.label} className="card p-4 text-center">
            <div className="text-xs text-muted">{c.label}</div>
            <div className={`mt-1 text-xl ${c.style}`}>{c.value}</div>
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
          <div className="overflow-x-auto">
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

      {/* Full movement table */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Stock Movement — Full Table</h2>
          <p className="text-xs text-muted">Opening + Purchased − Sold = Ending</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">SKU</th>
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 text-right font-semibold">Opening</th>
                <th className="px-4 py-2.5 text-right font-semibold">Purchased</th>
                <th className="px-4 py-2.5 text-right font-semibold">Sold</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ending</th>
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
                  <td className="px-4 py-2 font-medium text-ink max-w-[180px] truncate">{r.product.name}</td>
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
