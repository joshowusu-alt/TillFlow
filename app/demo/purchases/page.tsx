import { buildDemoLedger, getSupplierPayables } from '@/lib/demo-fixtures';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const fmt = (p: number) => formatMoney(p, 'GHS');

const STATUS_CLS: Record<string, string> = {
  PAID:      'pill pill-paid',
  PART_PAID: 'pill pill-part-paid',
  UNPAID:    'pill pill-unpaid',
};

export default function DemoPurchasesPage() {
  const snapshot  = buildDemoLedger();
  const payables  = getSupplierPayables(snapshot);
  const { totals, purchaseInvoices, products } = snapshot;

  const productMap = new Map(products.map(p => [p.id, p]));
  const supplierMap = new Map(snapshot.suppliers.map(s => [s.id, s]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Purchases</h1>
        <p className="mt-0.5 text-sm text-muted">
          {purchaseInvoices.length} purchase orders · {snapshot.period.start.toLocaleDateString('en-GH', { day:'numeric', month:'short' })} –{' '}
          {snapshot.period.end.toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' })}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="card p-4 text-center">
          <div className="text-xs text-muted">Total Purchases</div>
          <div className="mt-1 text-xl font-bold text-accent">{fmt(totals.totalPurchasesPence)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-muted">Paid</div>
          <div className="mt-1 text-xl font-bold text-success">{fmt(totals.purchasesPaidPence)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-muted">Outstanding AP</div>
          <div className={`mt-1 text-xl font-bold ${totals.purchasesOutstandingPence > 0 ? 'text-amber-600' : 'text-muted'}`}>
            {fmt(totals.purchasesOutstandingPence)}
          </div>
        </div>
      </div>

      {/* Supplier payables */}
      {payables.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3">
            <h2 className="text-sm font-semibold text-amber-800">Outstanding Supplier Payables</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-muted">
                  <th className="px-5 py-3 font-semibold">Supplier</th>
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                  <th className="px-5 py-3 text-right font-semibold">Paid</th>
                  <th className="px-5 py-3 text-right font-semibold">Outstanding</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {payables.map(r => (
                  <tr key={r.invoice.id} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-3 font-medium">{r.supplier.name}</td>
                    <td className="px-5 py-3 font-mono text-muted/80 text-xs">{r.invoice.ref}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmt(r.invoice.totalPence)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-success">{fmt(r.invoice.paidPence)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-amber-600">{fmt(r.outstandingPence)}</td>
                    <td className="px-5 py-3">
                      <span className={STATUS_CLS[r.invoice.status] ?? ''}>{r.invoice.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black/10 bg-slate-50">
                  <td colSpan={4} className="px-5 py-3 text-xs font-semibold text-right">Total Outstanding</td>
                  <td className="px-5 py-3 text-right text-sm font-bold tabular-nums text-amber-600">
                    {fmt(totals.purchasesOutstandingPence)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* All purchase orders */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">All Purchase Orders</h2>
        </div>
        <div className="space-y-0">
          {purchaseInvoices.map(po => {
            const sup = supplierMap.get(po.supplierId);
            return (
              <details key={po.id} className="group border-b border-black/5 last:border-0">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className={STATUS_CLS[po.status] ?? ''}>{po.status.replace('_', ' ')}</span>
                    <div>
                      <div className="font-medium text-sm text-ink">{sup?.name ?? po.supplierId}</div>
                      <div className="text-xs text-muted">
                        {po.date.toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' })} · {po.ref}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums text-sm">{fmt(po.totalPence)}</div>
                    {po.paidPence < po.totalPence && (
                      <div className="text-xs text-amber-600">Paid {fmt(po.paidPence)}</div>
                    )}
                  </div>
                </summary>
                <div className="border-t border-black/5 bg-slate-50/50 px-5 py-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-1 font-semibold">Product</th>
                        <th className="py-1 text-right font-semibold">Qty</th>
                        <th className="py-1 text-right font-semibold">Unit Cost</th>
                        <th className="py-1 text-right font-semibold">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map(l => {
                        const p = productMap.get(l.productId);
                        return (
                          <tr key={l.productId} className="border-t border-black/5">
                            <td className="py-1.5 font-medium">{p?.name ?? l.productId}</td>
                            <td className="py-1.5 text-right tabular-nums">{l.qty}</td>
                            <td className="py-1.5 text-right tabular-nums">{fmt(l.unitCostPence)}</td>
                            <td className="py-1.5 text-right font-semibold tabular-nums">{fmt(l.qty * l.unitCostPence)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
