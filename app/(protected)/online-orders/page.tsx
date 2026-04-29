import PageHeader from '@/components/PageHeader';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { updateOnlineOrderStatusAction } from '@/app/actions/online-storefront';
import { requireBusiness } from '@/lib/auth';
import { formatDateTime, formatMoney } from '@/lib/format';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function OnlineOrdersPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
    { onlineStorefront: (business as any).addonOnlineStorefront },
  );

  if (!features.onlineStorefront) {
    return (
      <AdvancedModeNotice
        title="Online orders need the storefront add-on"
        description="Online orders are included with Pro, or available on Growth as a GH₵200/mo add-on. Speak to TillFlow to enable it."
        featureName="Online Orders"
        minimumPlan="PRO"
      />
    );
  }

  const [orders, summary] = await Promise.all([
    prisma.onlineOrder.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        refundStatus: true,
        salesInvoiceId: true,
        customerName: true,
        customerPhone: true,
        totalPence: true,
        currency: true,
        createdAt: true,
        paidAt: true,
        publicToken: true,
        store: {
          select: {
            id: true,
            name: true,
          },
        },
        paymentCollection: {
          select: {
            providerStatus: true,
            providerReference: true,
            failureReason: true,
          },
        },
        lines: {
          select: {
            id: true,
            productName: true,
            qtyInUnit: true,
            unitName: true,
          },
        },
      },
    }),
    prisma.onlineOrder.groupBy({
      by: ['status'],
      where: { businessId: business.id },
      _count: { _all: true },
    }),
  ]);

  const awaiting = summary.find((row) => row.status === 'AWAITING_PAYMENT')?._count._all ?? 0;
  const paid = summary.find((row) => row.status === 'PAID')?._count._all ?? 0;
  const ready = summary.find((row) => row.status === 'READY_FOR_PICKUP')?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Orders"
        subtitle="Track mobile-money checkout, confirm pickup progress, and keep customer-facing orders moving."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-[0.2em] text-black/40">Awaiting payment</div>
          <div className="mt-2 text-3xl font-display font-bold text-ink">{awaiting}</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-[0.2em] text-black/40">Paid</div>
          <div className="mt-2 text-3xl font-display font-bold text-ink">{paid}</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase tracking-[0.2em] text-black/40">Ready for pickup</div>
          <div className="mt-2 text-3xl font-display font-bold text-ink">{ready}</div>
        </div>
      </div>

      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="card p-6 text-sm text-black/55">No online orders yet.</div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-display font-semibold text-ink">{order.orderNumber}</h2>
                    <span className="rounded-full bg-black/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55">
                      {order.status.split('_').join(' ')}
                    </span>
                    <span className="rounded-full bg-accentSoft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                      {order.paymentStatus}
                    </span>
                    {order.refundStatus === 'MANUAL_REFUND_NEEDED' ? (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                        Refund needed
                      </span>
                    ) : null}
                    {order.store ? (
                      <span className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] font-medium text-black/55">
                        Pickup: {order.store.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-black/60">
                    {order.customerName} · {order.customerPhone}
                  </div>
                  <div className="text-sm text-black/50">
                    {formatDateTime(order.createdAt)} · {formatMoney(order.totalPence, order.currency)}
                  </div>
                  <div className="text-xs text-black/50">
                    {order.lines.map((line) => `${line.qtyInUnit} x ${line.productName} (${line.unitName})`).join(', ')}
                  </div>
                  {order.paymentCollection?.providerStatus ? (
                    <div className="text-xs text-black/45">
                      Provider: {order.paymentCollection.providerStatus}
                      {order.paymentCollection.providerReference ? ` · Ref ${order.paymentCollection.providerReference}` : ''}
                    </div>
                  ) : null}
                  {order.paymentCollection?.failureReason ? (
                    <div className="text-xs text-rose-600">{order.paymentCollection.failureReason}</div>
                  ) : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {order.paymentStatus !== 'PAID' && order.status !== 'CANCELLED' ? (
                    <form action={updateOnlineOrderStatusAction}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="nextStatus" value="MARK_PAID" />
                      <button type="submit" className="btn-primary w-full justify-center">
                        Mark payment received
                      </button>
                    </form>
                  ) : null}
                  <form action={updateOnlineOrderStatusAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="nextStatus" value="PROCESSING" />
                    <button type="submit" className="btn-secondary w-full justify-center" disabled={order.paymentStatus !== 'PAID'}>
                      Mark processing
                    </button>
                  </form>
                  <form action={updateOnlineOrderStatusAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="nextStatus" value="READY_FOR_PICKUP" />
                    <button type="submit" className="btn-secondary w-full justify-center" disabled={order.paymentStatus !== 'PAID'}>
                      Ready for pickup
                    </button>
                  </form>
                  <form action={updateOnlineOrderStatusAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="nextStatus" value="COMPLETED" />
                    <button type="submit" className="btn-primary w-full justify-center" disabled={order.paymentStatus !== 'PAID'}>
                      Complete order
                    </button>
                  </form>
                  <form action={updateOnlineOrderStatusAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="nextStatus" value="CANCELLED" />
                    <button type="submit" className="btn-ghost w-full justify-center">
                      Cancel
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
