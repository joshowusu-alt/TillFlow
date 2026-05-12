import { buildDemoLedger, getDebtorBalances } from '@/lib/demo-fixtures';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const fmt = (p: number) => formatMoney(p, 'GHS');

export default function DemoCustomersPage() {
  const snapshot = buildDemoLedger();
  const debtors  = getDebtorBalances(snapshot);
  const { totals, salesInvoices, customerReceipts } = snapshot;

  const customerMap = new Map(snapshot.customers.map(c => [c.id, c]));

  // Per-customer credit invoices
  const creditInvoices = salesInvoices.filter(i => i.paymentMethod === 'CREDIT' && i.customerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Customers & Debtors</h1>
        <p className="mt-0.5 text-sm text-muted">
          Credit sales and outstanding balances
        </p>
      </div>

      {/* AR summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="card p-4 text-center">
          <div className="text-xs text-muted">Total Credit Sales</div>
          <div className="mt-1 text-xl font-bold text-blue-700">{fmt(totals.creditSalesPence)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-muted">Collected</div>
          <div className="mt-1 text-xl font-bold text-success">{fmt(totals.creditCollectedPence)}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-muted">Outstanding AR</div>
          <div className={`mt-1 text-xl font-bold ${totals.arBalancePence > 0 ? 'text-amber-600' : 'text-muted'}`}>
            {fmt(totals.arBalancePence)}
          </div>
        </div>
      </div>

      {/* Debtor balances */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Debtor Balances</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-muted">
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 text-right font-semibold">Invoiced</th>
                <th className="px-5 py-3 text-right font-semibold">Collected</th>
                <th className="px-5 py-3 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map(r => (
                <tr key={r.customer.id} className="border-b border-black/5 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{r.customer.name}</td>
                  <td className="px-5 py-3 text-muted text-xs">{r.customer.type}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmt(r.invoicedPence)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-success">{fmt(r.collectedPence)}</td>
                  <td className={`px-5 py-3 text-right font-semibold tabular-nums ${r.balancePence > 0 ? 'text-amber-600' : 'text-success'}`}>
                    {fmt(r.balancePence)}
                  </td>
                </tr>
              ))}
              {debtors.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">No outstanding debtor balances.</td></tr>
              )}
            </tbody>
            {debtors.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black/10 bg-slate-50">
                  <td colSpan={2} className="px-5 py-3 text-xs font-semibold">Total</td>
                  <td className="px-5 py-3 text-right text-xs tabular-nums">{fmt(totals.creditSalesPence)}</td>
                  <td className="px-5 py-3 text-right text-xs tabular-nums text-success">{fmt(totals.creditCollectedPence)}</td>
                  <td className="px-5 py-3 text-right text-sm font-bold tabular-nums text-amber-600">{fmt(totals.arBalancePence)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Credit receipts */}
      {customerReceipts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-black/8 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Credit Receipts (Payments Collected)</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-xs text-muted">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Note</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {customerReceipts.map(r => {
                const cust = customerMap.get(r.customerId);
                return (
                  <tr key={r.id} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap">
                      {r.date.toLocaleDateString('en-GH', { day:'numeric', month:'short', year:'numeric' })}
                    </td>
                    <td className="px-5 py-3 font-medium">{cust?.name ?? r.customerId}</td>
                    <td className="px-5 py-3 text-muted text-xs">{r.note}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-success">{fmt(r.amountPence)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Credit invoice log */}
      <div className="card overflow-hidden">
        <div className="border-b border-black/8 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Credit Invoice Log</h2>
          <p className="text-xs text-muted">{creditInvoices.length} credit transactions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-black/5 text-left text-muted">
                <th className="px-5 py-2.5 font-semibold">Invoice</th>
                <th className="px-5 py-2.5 font-semibold">Date</th>
                <th className="px-5 py-2.5 font-semibold">Customer</th>
                <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...creditInvoices]
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .map(inv => {
                  const cust = inv.customerId ? customerMap.get(inv.customerId) : null;
                  return (
                    <tr key={inv.id} className="border-b border-black/5 last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-2 font-mono text-muted/80">{inv.id}</td>
                      <td className="px-5 py-2">{inv.date.toLocaleDateString('en-GH', { day:'numeric', month:'short' })}</td>
                      <td className="px-5 py-2 font-medium">{cust?.name ?? '—'}</td>
                      <td className="px-5 py-2 text-right font-semibold tabular-nums text-blue-700">{fmt(inv.subtotalPence)}</td>
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
