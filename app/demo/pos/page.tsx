import { buildDemoLedger } from '@/lib/demo-fixtures';
import { getCurrencySymbol } from '@/lib/format';
import POSCategoryFilter from './_components/POSCategoryFilter';
import type { DemoInventoryBalance } from '@/lib/demo-fixtures';

export const dynamic = 'force-dynamic';

export default function DemoPosPage() {
  const snapshot = buildDemoLedger();
  const sym = getCurrencySymbol(snapshot.currency);

  const balances: Record<string, DemoInventoryBalance> = {};
  for (const [id, bal] of snapshot.inventoryBalances) {
    balances[id] = bal;
  }

  const totalSKUs      = snapshot.products.length;
  const lowStockN      = snapshot.products.filter(p => {
    const b = snapshot.inventoryBalances.get(p.id);
    return b ? b.endingQty <= p.reorderPoint : false;
  }).length;
  const totalInvValue  = snapshot.totals.endingInventoryValuePence;
  const productMap     = new Map(snapshot.products.map((p) => [p.id, p]));
  const customerMap    = new Map(snapshot.customers.map((c) => [c.id, c]));
  const latestSale     = [...snapshot.salesInvoices].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  const latestSaleCustomer  = latestSale?.customerId ? customerMap.get(latestSale.customerId) : null;
  const latestSaleCogs      = latestSale?.lines.reduce((sum, line) => sum + line.qty * line.costPricePence, 0) ?? 0;
  const latestSaleMargin    = latestSale ? latestSale.subtotalPence - latestSaleCogs : 0;
  const latestSaleLineCount = latestSale?.lines.reduce((sum, line) => sum + line.qty, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">POS View</h1>
          <p className="mt-0.5 text-sm text-muted">
            Try a sample sale and see how TillFlow tracks checkout, payment and stock
            {lowStockN > 0 && <span className="ml-2 font-medium text-amber-600">· {lowStockN} low stock</span>}
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 text-sm sm:w-auto sm:flex sm:gap-3">
          <div className="rounded-lg border bg-white px-3 py-2 text-center shadow-sm">
            <div className="text-xs text-muted">Total SKUs</div>
            <div className="font-bold text-ink">{totalSKUs}</div>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2 text-center shadow-sm">
            <div className="text-xs text-muted">Inventory Value</div>
            <div className="font-bold text-ink">{sym}{(totalInvValue / 100).toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2 text-center shadow-sm">
            <div className="text-xs text-muted">Low Stock</div>
            <div className={`font-bold ${lowStockN > 0 ? 'text-amber-600' : 'text-success'}`}>{lowStockN}</div>
          </div>
        </div>
      </div>

      {/* How a sale works */}
      <div className="rounded-2xl border border-accent/10 bg-accentSoft/50 p-5">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent/70">How a sale works in TillFlow</div>
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { step: '1', label: 'Search or scan', desc: 'Find a product by name or barcode' },
              { step: '2', label: 'Add to cart', desc: 'Add Milo 400g or any sample item' },
              { step: '3', label: 'Take payment', desc: 'Cash, MoMo or credit' },
              { step: '4', label: 'Sale complete', desc: 'Receipt ready. Stock and reports update.' },
            ].map((s) => (
              <div key={s.step} className="flex gap-3 sm:flex-col sm:gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white sm:h-8 sm:w-8">
                  {s.step}
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink">{s.label}</div>
                  <div className="text-xs leading-relaxed text-muted">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white bg-white/85 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">Try a sample sale</div>
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-ink">Milo 400g × 2</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-100 px-2 py-1.5 text-center text-emerald-800">Cash</span>
              <span className="rounded-full bg-amber-100 px-2 py-1.5 text-center text-amber-800">MoMo</span>
              <span className="rounded-full bg-blue-100 px-2 py-1.5 text-center text-blue-800">Credit</span>
            </div>
            <div className="mt-3 rounded-xl bg-accent px-3 py-2.5 text-center text-sm font-bold text-white">
              Complete sale
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">Stock reduces, receipt is ready, and the owner report updates.</p>
          </div>
        </div>
      </div>

      {latestSale && (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="card overflow-hidden">
            <div className="border-b border-black/8 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Most recent sale</h2>
                  <p className="text-xs text-muted">
                    {latestSale.id} · {latestSale.date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                    {latestSale.date.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold text-accent">
                  {latestSale.paymentMethod}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="divide-y divide-black/5 sm:hidden">
                {latestSale.lines.map((line) => {
                  const product = productMap.get(line.productId);
                  return (
                    <div key={line.productId} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-ink">{product?.name ?? line.productId}</div>
                          <div className="mt-0.5 text-xs text-muted">{product?.sku} · Qty {line.qty}</div>
                        </div>
                        <div className="whitespace-nowrap text-sm font-bold tabular-nums text-accent">
                          {sym}{((line.qty * line.unitPricePence) / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <table className="hidden w-full text-xs sm:table">
                <thead>
                  <tr className="border-b border-black/5 text-left text-muted">
                    <th className="px-5 py-2.5 font-semibold">Item</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Qty</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Unit Price</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {latestSale.lines.map((line) => {
                    const product = productMap.get(line.productId);
                    return (
                      <tr key={line.productId} className="border-b border-black/5 last:border-0">
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-ink">{product?.name ?? line.productId}</div>
                          <div className="text-muted">{product?.sku}</div>
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{line.qty}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{sym}{(line.unitPricePence / 100).toFixed(2)}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{sym}{((line.qty * line.unitPricePence) / 100).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted">Receipt summary</div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Customer</span>
                <span className="font-medium text-ink">{latestSaleCustomer?.name ?? 'Walk-in'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Items sold</span>
                <span className="font-medium tabular-nums">{latestSaleLineCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Gross margin</span>
                <span className="font-medium text-success tabular-nums">{sym}{(latestSaleMargin / 100).toFixed(2)}</span>
              </div>
              <div className="border-t border-black/10 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-ink">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-accent">{sym}{(latestSale.subtotalPence / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted">
              This is a sample checkout from the 14-day sample business data. Explore inventory, sales and reports to see how TillFlow tracks everything.
            </p>
          </div>
        </div>
      )}

      <POSCategoryFilter
        products={snapshot.products}
        categories={snapshot.categories}
        balances={balances}
        sym={sym}
      />
    </div>
  );
}
