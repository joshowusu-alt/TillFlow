import { DEMO_ONLINE_ORDERS } from '@/lib/demo-fixtures';
import { formatMoney } from '@/lib/format';

function statusColour(status: string) {
  if (status === 'AWAITING_PAYMENT') return 'bg-amber-100 text-amber-900';
  if (status === 'COLLECTED') return 'bg-emerald-100 text-emerald-900';
  return 'bg-blue-100 text-blue-900';
}

export default function DemoOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Sample online orders</h1>
        <p className="mt-1 text-sm text-muted">
          How TillFlow shows MoMo checkout, payment confirmation and pickup — demo phones and references only.
        </p>
      </div>

      <div className="space-y-4">
        {DEMO_ONLINE_ORDERS.map((order) => (
          <article key={order.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">{order.id}</p>
                <p className="text-sm text-muted">
                  {order.customerName} · {order.phone}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColour(order.status)}`}>
                {order.statusLabel}
              </span>
            </div>
            <p className="mt-3 text-sm">{order.itemSummary}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span>
                <span className="text-muted">Total </span>
                <strong>{formatMoney(order.totalPence, 'GHS')}</strong>
              </span>
              {order.paymentRef ? (
                <span>
                  <span className="text-muted">MoMo ref </span>
                  <strong>{order.paymentRef}</strong>
                </span>
              ) : (
                <span className="text-amber-800 font-medium">Awaiting customer MoMo screenshot</span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{order.note}</p>
          </article>
        ))}
      </div>

      <p className="text-xs text-muted rounded-xl bg-slate-50 px-4 py-3">
        These orders are part of the sample business story only. They are not linked to any real customer.
      </p>
    </div>
  );
}
