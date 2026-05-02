import PageHeader from '@/components/PageHeader';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { recheckOnlineOrderPaymentAction, updateOnlineOrderStatusAction } from '@/app/actions/online-storefront';
import { requireBusiness } from '@/lib/auth';
import { formatDateTime, formatMoney, formatGhanaPhoneForDisplay, formatOnlineOrderStatus, toTitleCase } from '@/lib/format';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const STATUS_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'AWAITING_PAYMENT', label: 'Awaiting payment' },
  { key: 'PAID',             label: 'Payment confirmed' },
  { key: 'PROCESSING',       label: 'Preparing' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { key: 'COMPLETED',        label: 'Collected' },
  { key: 'CANCELLED',        label: 'Cancelled' },
] as const;

type StatusKey = typeof STATUS_TABS[number]['key'];

function isValidStatus(val: unknown): val is Exclude<StatusKey, 'all'> {
  return typeof val === 'string' && STATUS_TABS.some((t) => t.key !== 'all' && t.key === val);
}

function NextStepCTA({ order }: {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    paymentCollectionId: string | null;
  };
}) {
  const done = order.status === 'COMPLETED' || order.status === 'CANCELLED';
  if (done) return null;
  const recheckPaymentAction = recheckOnlineOrderPaymentAction.bind(null, order.id);

  const canCancel = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  let nextStatus: string;
  let nextLabel: string;
  let variant: 'primary' | 'secondary' = 'primary';

  if (order.paymentStatus !== 'PAID') {
    nextStatus = 'MARK_PAID';
    nextLabel = 'Confirm payment';
  } else if (order.status === 'PAID') {
    nextStatus = 'PROCESSING';
    nextLabel = 'Mark preparing';
    variant = 'secondary';
  } else if (order.status === 'PROCESSING') {
    nextStatus = 'READY_FOR_PICKUP';
    nextLabel = 'Mark ready for pickup';
    variant = 'secondary';
  } else if (order.status === 'READY_FOR_PICKUP') {
    nextStatus = 'COMPLETED';
    nextLabel = 'Mark collected';
  } else {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <form action={updateOnlineOrderStatusAction}>
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="nextStatus" value={nextStatus} />
        <button type="submit" className={variant === 'primary' ? 'btn-primary' : 'btn-secondary'}>
          {nextLabel}
        </button>
      </form>
      {canCancel ? (
        <form action={updateOnlineOrderStatusAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="nextStatus" value="CANCELLED" />
          <button type="submit" className="btn-ghost text-rose-600 hover:bg-rose-50">
            Cancel order
          </button>
        </form>
      ) : null}
      {order.status === 'AWAITING_PAYMENT' && order.paymentCollectionId ? (
        <form action={recheckPaymentAction}>
          <button type="submit" className="btn-ghost">
            Re-check payment
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function OnlineOrdersPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
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

  const activeTab: StatusKey = isValidStatus(searchParams?.status) ? searchParams!.status! : 'all';
  const statusFilter = activeTab !== 'all' ? { status: activeTab as string } : {};

  const [orders, summary] = await Promise.all([
    prisma.onlineOrder.findMany({
      where: { businessId: business.id, ...statusFilter },
      orderBy: { createdAt: 'desc' },
      take: 100,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentCollectionId: true,
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
          select: { id: true, name: true },
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

  const countFor = (s: string) => summary.find((r) => r.status === s)?._count._all ?? 0;
  const awaiting = countFor('AWAITING_PAYMENT');
  const paid = countFor('PAID');
  const processing = countFor('PROCESSING');
  const ready = countFor('READY_FOR_PICKUP');
  const totalActive = awaiting + paid + processing + ready;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Orders"
        subtitle="Confirm payments, prepare orders, and track pickup progress."
      />

      {/* Status summary cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-black/40">Awaiting payment</div>
          <div className={`mt-1.5 text-2xl font-display font-bold ${awaiting > 0 ? 'text-amber-600' : 'text-ink'}`}>{awaiting}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-black/40">Payment confirmed</div>
          <div className={`mt-1.5 text-2xl font-display font-bold ${paid > 0 ? 'text-blue-600' : 'text-ink'}`}>{paid}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-black/40">Preparing</div>
          <div className={`mt-1.5 text-2xl font-display font-bold ${processing > 0 ? 'text-indigo-600' : 'text-ink'}`}>{processing}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-black/40">Ready for pickup</div>
          <div className={`mt-1.5 text-2xl font-display font-bold ${ready > 0 ? 'text-emerald-600' : 'text-ink'}`}>{ready}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const tabCount =
            tab.key === 'all' ? totalActive :
            tab.key === 'AWAITING_PAYMENT' ? awaiting :
            tab.key === 'PAID' ? paid :
            tab.key === 'PROCESSING' ? processing :
            tab.key === 'READY_FOR_PICKUP' ? ready :
            tab.key === 'COMPLETED' ? countFor('COMPLETED') :
            tab.key === 'CANCELLED' ? countFor('CANCELLED') : 0;
          const isActive = activeTab === tab.key;
          return (
            <a
              key={tab.key}
              href={tab.key === 'all' ? '/online-orders' : `/online-orders?status=${tab.key}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'border-accent bg-accent text-white shadow-sm'
                  : 'border-slate-200 bg-white text-black/60 hover:border-accent/30 hover:text-accent'
              }`}
            >
              {tab.label}
              {tabCount > 0 && !isActive ? (
                <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                  {tabCount}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>

      {/* Orders list */}
      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="card p-6 text-sm text-black/55">
            {activeTab === 'all' ? 'No online orders yet.' : `No orders with status "${STATUS_TABS.find(t => t.key === activeTab)?.label}".`}
          </div>
        ) : (
          orders.map((order) => {
            const statusDone = order.status === 'COMPLETED' || order.status === 'CANCELLED';
            return (
              <div key={order.id} className={`card p-5 ${statusDone ? 'opacity-70' : ''}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-display font-semibold text-ink">{order.orderNumber}</h2>
                      <StatusBadge status={order.status} />
                      {order.refundStatus === 'MANUAL_REFUND_NEEDED' ? (
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                          Refund needed
                        </span>
                      ) : null}
                      {order.store ? (
                        <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-black/55">
                          {order.store.name}
                        </span>
                      ) : null}
                    </div>

                    <div className="font-medium text-sm text-ink">{order.customerName}</div>

                    {order.customerPhone ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-black/55">
                        <span className="font-mono">{formatGhanaPhoneForDisplay(order.customerPhone) || order.customerPhone}</span>
                        <a
                          href={`tel:${order.customerPhone}`}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
                        >
                          Call
                        </a>
                        <a
                          href={`https://wa.me/${order.customerPhone.replace(/[^\d]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          WhatsApp
                        </a>
                      </div>
                    ) : null}

                    <div className="text-xs text-black/50">
                      {formatDateTime(order.createdAt)} · <span className="font-semibold text-ink">{formatMoney(order.totalPence, order.currency)}</span>
                    </div>

                    <div className="text-xs text-black/45 leading-relaxed">
                      {order.lines.map((line) => `${line.qtyInUnit} × ${toTitleCase(line.productName)} (${toTitleCase(line.unitName)})`).join(' · ')}
                    </div>

                    {order.paymentCollection?.providerStatus ? (
                      <div className="text-xs text-black/40">
                        Provider: {order.paymentCollection.providerStatus}
                        {order.paymentCollection.providerReference ? ` · Ref ${order.paymentCollection.providerReference}` : ''}
                      </div>
                    ) : null}
                    {order.paymentCollection?.failureReason ? (
                      <div className="text-xs text-rose-600">{order.paymentCollection.failureReason}</div>
                    ) : null}
                  </div>

                  <div className="flex-shrink-0 lg:pl-4">
                    <NextStepCTA
                      order={{
                        id: order.id,
                        status: order.status,
                        paymentStatus: order.paymentStatus,
                        paymentCollectionId: order.paymentCollectionId,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = formatOnlineOrderStatus(status);
  const cls = {
    AWAITING_PAYMENT: 'bg-amber-100 text-amber-800',
    PAID:             'bg-blue-100 text-blue-800',
    PROCESSING:       'bg-indigo-100 text-indigo-800',
    READY_FOR_PICKUP: 'bg-emerald-100 text-emerald-800',
    COMPLETED:        'bg-slate-100 text-slate-600',
    CANCELLED:        'bg-rose-100 text-rose-700',
    PAYMENT_FAILED:   'bg-rose-100 text-rose-700',
  }[status] ?? 'bg-black/5 text-black/55';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${cls}`}>
      {label}
    </span>
  );
}
