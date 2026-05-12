import { buildDemoLedger } from '@/lib/demo-fixtures';
import { getCurrencySymbol } from '@/lib/format';
import POSCategoryFilter from './_components/POSCategoryFilter';
import type { DemoInventoryBalance } from '@/lib/demo-fixtures';

export const dynamic = 'force-dynamic';

export default function DemoPosPage() {
  const snapshot = buildDemoLedger();
  const sym = getCurrencySymbol(snapshot.currency);

  // Serialise Map to plain object for client component
  const balances: Record<string, DemoInventoryBalance> = {};
  for (const [id, bal] of snapshot.inventoryBalances) {
    balances[id] = bal;
  }

  const totalSKUs  = snapshot.products.length;
  const lowStockN  = snapshot.products.filter(p => {
    const b = snapshot.inventoryBalances.get(p.id);
    return b ? b.endingQty <= p.reorderPoint : false;
  }).length;
  const totalInvValue = snapshot.totals.endingInventoryValuePence;
  const productMap = new Map(snapshot.products.map((product) => [product.id, product]));
  const customerMap = new Map(snapshot.customers.map((customer) => [customer.id, customer]));
  const latestSale = [...snapshot.salesInvoices].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  const latestSaleCustomer = latestSale?.customerId ? customerMap.get(latestSale.customerId) : null;
  const latestSaleCogs = latestSale?.lines.reduce((sum, line) => sum + line.qty * line.costPricePence, 0) ?? 0;
  const latestSaleMargin = latestSale ? latestSale.subtotalPence - latestSaleCogs : 0;
  const latestSaleLineCount = latestSale?.lines.reduce((sum, line) => sum + line.qty, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">POS View</h1>
          <p className="mt-0.5 text-sm text-muted">
            Seeded checkout history plus the 100-SKU catalogue used for those sales
            {lowStockN > 0 && <span className="ml-2 font-medium text-amber-600">· {lowStockN} low stock</span>}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
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

      {latestSale && (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="card overflow-hidden">
            <div className="border-b border-black/8 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Latest seeded checkout</h2>
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
              <table className="w-full text-xs">
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
                <span className="font-medium text-ink">{latestSaleCustomer?.name ?? 'Walk-in Customer'}</span>
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
              This screen is read-only. Inventory, sales, debtors, payables, and reports are derived from the seeded two-week demo dataset.
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
