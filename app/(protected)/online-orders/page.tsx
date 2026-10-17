import type { Prisma } from '@prisma/client';
import StorefrontUpgradeNotice from '@/components/StorefrontUpgradeNotice';
import { retryOnlineOrderSaleAction, recheckOnlineOrderPaymentAction, updateOnlineOrderStatusAction, batchMarkPreparingAction, markOrderRefundedAction } from '@/app/actions/online-storefront';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { formatDateTime, formatMoney, formatGhanaPhoneForDisplay, toTitleCase } from '@/lib/format';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const STATUS_TABS = [
  { key: 'all',              label: 'Outstanding' },
  { key: 'ALL_ORDERS',       label: 'All orders' },
  { key: 'REFUNDS',          label: 'Refunds needed' },
  { key: 'AWAITING_PAYMENT', label: 'Awaiting payment' },
  { key: 'PAID',             label: 'Payment confirmed' },
  { key: 'PROCESSING',       label: 'Preparing' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for pickup' },
  { key: 'COMPLETED',        label: 'Collected' },
  { key: 'CANCELLED',        label: 'Cancelled' },
] as const;

type StatusKey = typeof STATUS_TABS[number]['key'];

function formatMerchantOrderStatus(status: string): string {
  switch (status) {
    case 'AWAITING_PAYMENT':
      return 'Awaiting payment';
    case 'PAID':
      return 'Payment confirmed';
    case 'PROCESSING':
    case 'PREPARING':
      return 'Being prepared';
    case 'READY_FOR_PICKUP':
      return 'Ready for pickup';
    case 'COMPLETED':
      return 'Collected';
    case 'CANCELLED':
      return 'Cancelled';
    case 'PAYMENT_FAILED':
      return 'Payment failed';
    default:
      return toTitleCase(status.replace(/_/g, ' ').toLowerCase());
  }
}

function isValidStatus(val: unknown): val is Exclude<StatusKey, 'all'> {
  return typeof val === 'string' && STATUS_TABS.some((t) => t.key !== 'all' && t.key === val);
}

function orderAgeMinutes(createdAt: Date | string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
}

function slaBand(ageMin: number, status: string): 'ok' | 'warn' | 'urgent' {
  if (['COMPLETED', 'COLLECTED', 'CANCELLED'].includes(status)) return 'ok';
  if (ageMin >= 45) return 'urgent';
  if (ageMin >= 20) return 'warn';
  return 'ok';
}

function AgeBadge({ createdAt, status }: { createdAt: Date | string; status: string }) {
  const ageMin = orderAgeMinutes(createdAt);
  const band = slaBand(ageMin, status);
  const label = ageMin < 1 ? 'just now' : ageMin < 60 ? `${ageMin} min ago` : ageMin < 1440 ? `${Math.floor(ageMin / 60)} hr ${ageMin % 60} min ago` : `${Math.floor(ageMin / 1440)} days ago`;
  if (band === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
        {label}
      </span>
    );
  }
  if (band === 'warn') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        {label}
      </span>
    );
  }
  return <span className="text-xs text-slate-600">{label}</span>;
}

function NextStepCTA({ order, canManage = true }: {
  canManage?: boolean;
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    paymentCollectionId: string | null;
  };
}) {
  const done = order.status === 'COMPLETED' || order.status === 'CANCELLED';
  if (done) return null;
  if (!canManage && order.paymentStatus !== 'PAID') return <p className="text-xs text-amber-800">A manager must verify payment before preparation.</p>;
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
    <div className="flex flex-wrap gap-2 lg:justify-end">
      <form action={updateOnlineOrderStatusAction} className="w-full sm:w-auto">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="nextStatus" value={nextStatus} />
        <button type="submit" className={`${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} w-full justify-center sm:w-auto`}>
          {nextLabel}
        </button>
      </form>
      {canCancel && canManage ? (
        <form action={updateOnlineOrderStatusAction} className="w-full sm:w-auto">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="nextStatus" value="CANCELLED" />
          <button type="submit" className="btn-ghost w-full justify-center text-rose-600 hover:bg-rose-50 sm:w-auto">
            Cancel order
          </button>
        </form>
      ) : null}
      {canManage && order.status === 'AWAITING_PAYMENT' && order.paymentCollectionId ? (
        <form action={recheckPaymentAction} className="w-full sm:w-auto">
          <button type="submit" className="btn-ghost w-full justify-center sm:w-auto">
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
  searchParams?: { status?: string; order?: string; q?: string; page?: string };
}) {
  const { user, business, store } = await requireBusinessAndOptionalStore(['CASHIER', 'MANAGER', 'OWNER']);
  const canManage = user.role !== 'CASHIER';
  if (!canManage && !store) return <p>Select a branch in the header to view online orders.</p>;
  const branchFilter = store ? { storeId: store.id } : {};
  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
    { onlineStorefront: (business as any).addonOnlineStorefront },
  );

  if (!features.onlineStorefront) {
    return <StorefrontUpgradeNotice plan={features.plan} featureName="Online Orders" />;
  }

  const activeTab: StatusKey = isValidStatus(searchParams?.status) ? searchParams!.status! : 'all';
  const attentionFilter: Prisma.OnlineOrderWhereInput = { OR: [
    { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_FAILED', 'PAID', 'PROCESSING', 'READY_FOR_PICKUP'] } },
    { status: 'CANCELLED', refundStatus: 'MANUAL_REFUND_NEEDED' },
  ] };
  const query = (searchParams?.q ?? '').trim().slice(0, 100);
  const pageSize = 20;
  const requestedPage = /^\d{1,7}$/.test(searchParams?.page ?? '') ? Math.max(1, Number(searchParams?.page)) : 1;
  const statusFilter: Prisma.OnlineOrderWhereInput = activeTab === 'all' ? attentionFilter
    : activeTab === 'ALL_ORDERS' ? {}
    : activeTab === 'REFUNDS'
    ? { status: 'CANCELLED', refundStatus: 'MANUAL_REFUND_NEEDED' }
    : activeTab === 'AWAITING_PAYMENT'
    ? { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_FAILED'] } }
    : activeTab !== 'all' ? { status: activeTab as string } : {};

  const phoneDigits = query.replace(/[^\d]/g, '');
  const phoneSearch = phoneDigits.startsWith('0') ? `233${phoneDigits.slice(1)}` : phoneDigits;
  // The live storefront uses PostgreSQL; cast preserves the SQLite CI client contract.
  const textMatch = (value: string) => ({ contains: value, mode: 'insensitive' } as any);
  const where: Prisma.OnlineOrderWhereInput = {
    businessId: business.id, ...branchFilter, ...statusFilter,
    ...(searchParams?.order ? { id: searchParams.order } : {}),
    ...(query ? { AND: [{ OR: [
      { orderNumber: textMatch(query) }, { customerName: textMatch(query) },
      { customerPhone: { contains: phoneDigits.length >= 3 ? phoneSearch : query } },
    ] }] } : {}),
  };
  const [matchingCount, summary, refundNeeded] = await Promise.all([
    prisma.onlineOrder.count({ where }),
    prisma.onlineOrder.groupBy({ by: ['status'], where: { businessId: business.id, ...branchFilter }, _count: { _all: true } }),
    prisma.onlineOrder.count({ where: { businessId: business.id, ...branchFilter, status: 'CANCELLED', refundStatus: 'MANUAL_REFUND_NEEDED' } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const direction = ['ALL_ORDERS', 'COMPLETED', 'CANCELLED'].includes(activeTab) ? 'desc' : 'asc';
  const orders = await prisma.onlineOrder.findMany({
      where,
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: pageSize,
      skip: (page - 1) * pageSize,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paymentCollectionId: true,
          fulfillmentStatus: true,
          refundStatus: true,
          refundNote: true,
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
    });

  const countFor = (s: string) => summary.find((r) => r.status === s)?._count._all ?? 0;
  const awaiting = countFor('AWAITING_PAYMENT') + countFor('PAYMENT_FAILED');
  const paid = countFor('PAID');
  const processing = countFor('PROCESSING');
  const ready = countFor('READY_FOR_PICKUP');
  const totalActive = awaiting + paid + processing + ready + refundNeeded;
  const archived = countFor('COMPLETED') + countFor('CANCELLED') - refundNeeded;
  const listUrl = (status: StatusKey, targetPage = 1) => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (query) params.set('q', query);
    if (targetPage > 1) params.set('page', String(targetPage));
    return `/online-orders${params.size ? `?${params}` : ''}`;
  };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink">Online orders</h1>
          <p className="mt-1 text-sm text-slate-600">{canManage
            ? 'Verify payments, manage refunds and keep pickup orders moving.'
            : 'Prepare paid orders, mark them ready and confirm collection. Payment and refund issues go to a manager.'}</p>
        </div>
        <p className="text-sm text-slate-600"><strong className="text-ink">{totalActive}</strong> outstanding · {refundNeeded} refunds needed · {archived} archived</p>
      </header>

      {/* Filter tabs */}
      <nav aria-label="Filter orders by status" className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          Filter by status
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
          {STATUS_TABS.map((tab) => {
            const tabCount =
              tab.key === 'all' ? totalActive :
              tab.key === 'ALL_ORDERS' ? totalActive + archived :
              tab.key === 'REFUNDS' ? refundNeeded :
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
                href={listUrl(tab.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'border-accent bg-accent text-white shadow-sm'
                    : 'border-slate-200 bg-white text-black/60 hover:border-accent/30 hover:text-accent'
                }`}
              >
                {tab.label}
                {tabCount > 0 ? (
                  <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs font-bold leading-none">
                    {tabCount}
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>
      </nav>

      <form action="/online-orders" method="get" role="search" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={activeTab === 'all' ? 'ALL_ORDERS' : activeTab} />
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="online-order-search" className="mb-1 block text-sm font-semibold text-slate-700">Find an order</label>
          <input id="online-order-search" name="q" type="search" defaultValue={query} maxLength={100} placeholder="Order reference, customer name or phone" className="input w-full" />
        </div>
        <button type="submit" className="btn-primary min-h-11">Search</button>
        {query || searchParams?.order ? <a href={activeTab === 'all' ? '/online-orders' : `/online-orders?status=${activeTab}`} className="btn-secondary min-h-11">Clear search</a> : null}
        {activeTab === 'all' ? <p className="w-full text-xs text-slate-600">Search includes the full order history. Select a status to narrow results.</p> : null}
      </form>

      {/* Batch preparing banner — shown when any PAID orders need processing */}
      {canManage && (() => {
        const paidOrders = orders.filter((o) => o.status === 'PAID');
        if (paidOrders.length === 0 || paidOrders.length !== paid || query || searchParams?.order) return null;
        // Group by store
        const byStore = new Map<string, { storeId: string; storeName: string; count: number }>();
        for (const o of paidOrders) {
          if (!o.store) continue;
          if (!byStore.has(o.store.id)) {
            byStore.set(o.store.id, { storeId: o.store.id, storeName: o.store.name, count: 0 });
          }
          byStore.get(o.store.id)!.count++;
        }
        return (
          <div role="status" aria-live="polite" className="space-y-2">
            {Array.from(byStore.values()).map(({ storeId, storeName, count }) => (
              <div key={storeId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-sm font-medium text-blue-900">
                  <span className="font-bold">{count} {count === 1 ? 'order' : 'orders'}</span>{' '}
                  confirmed at <span className="font-semibold">{storeName}</span> — ready to start preparing
                </p>
                <form action={batchMarkPreparingAction}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <button
                    type="submit"
                    className="btn-primary text-xs py-1.5 px-3"
                    aria-label={`Mark all ${count} paid orders at ${storeName} as preparing`}
                  >
                    Mark all as preparing
                  </button>
                </form>
              </div>
            ))}
          </div>
        );
      })()}

      <section aria-label="Order results" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <p role="status">{matchingCount === 0 ? 'No matching orders' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, matchingCount)} of ${matchingCount} orders`}</p>
          <span>{direction === 'asc' ? 'Oldest outstanding first' : 'Newest first'}</span>
        </div>
        {orders.length === 0 ? <div className="card p-6 text-sm text-slate-600">{query ? 'No orders match this search. Check the reference, name or phone, or try All orders.' : 'No orders in this view. Select All orders to browse the full history.'}</div>
          : orders.map((order) => <OrderCard key={order.id} order={order} canManage={canManage} />)}
        <nav aria-label="Order pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          {page > 1 ? <a className="btn-secondary min-h-11" rel="prev" href={listUrl(activeTab, page - 1)}>Previous</a> : <span className="px-3 py-2 text-sm text-slate-400" aria-disabled="true">Previous</span>}
          <span className="text-sm font-medium text-slate-700">Page {page} of {pageCount}</span>
          {page < pageCount ? <a className="btn-secondary min-h-11" rel="next" href={listUrl(activeTab, page + 1)}>Next</a> : <span className="px-3 py-2 text-sm text-slate-400" aria-disabled="true">Next</span>}
        </nav>
      </section>
    </div>
  );
}

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentCollectionId: string | null;
  fulfillmentStatus: string;
  refundStatus: string | null;
  refundNote: string | null;
  salesInvoiceId: string | null;
  customerName: string;
  customerPhone: string | null;
  totalPence: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  publicToken: string | null;
  store: { id: string; name: string } | null;
  paymentCollection: {
    providerStatus: string | null;
    providerReference: string | null;
    failureReason: string | null;
  } | null;
  lines: Array<{ id: string; productName: string; qtyInUnit: number; unitName: string }>;
};

function OrderCard({ order, compact = false, canManage = true }: { order: OrderRow; compact?: boolean; canManage?: boolean }) {
  const statusDone = order.status === 'COMPLETED' || order.status === 'CANCELLED';
  const statusBorderClass = ({
    AWAITING_PAYMENT: 'border-l-4 border-l-amber-400',
    PAID: 'border-l-4 border-l-blue-400',
    PREPARING: 'border-l-4 border-l-indigo-400',
    PROCESSING: 'border-l-4 border-l-indigo-400',
    READY_FOR_PICKUP: 'border-l-4 border-l-emerald-400',
    COMPLETED: 'border-l-2 border-l-slate-300',
    CANCELLED: 'border-l-2 border-l-rose-300',
    PAYMENT_FAILED: 'border-l-2 border-l-rose-300',
  } as Record<string, string>)[order.status] ?? 'border-l-2 border-l-slate-200';

  return (
    <div id={`order-${order.id}`} className={`scroll-mt-48 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:shadow-md ${statusDone && order.refundStatus !== 'MANUAL_REFUND_NEEDED' ? 'bg-slate-50/50' : ''}`}>
      <div className={`flex flex-col gap-3 ${compact ? 'p-3.5 lg:py-3' : 'p-4 sm:p-5'} lg:flex-row lg:items-start ${statusBorderClass}`}>
        <div className="min-w-0 space-y-2 lg:flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`${compact ? 'text-sm' : 'text-base'} font-display font-bold text-ink`}>{order.orderNumber}</h2>
              <StatusBadge status={order.status} />
              <AgeBadge createdAt={order.createdAt} status={order.status} />
              {order.refundStatus === 'MANUAL_REFUND_NEEDED' ? (
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
                  ⚠ Refund needed
                </span>
              ) : null}
              {order.refundStatus === 'REFUNDED' ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Refunded
                </span>
              ) : null}
              {order.store ? (
                <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-xs font-medium text-black/55">
                  {order.store.name}
                </span>
              ) : null}
            </div>
            <div className={`${compact ? 'text-base' : 'text-xl'} font-display font-bold tabular-nums text-ink`}>{formatMoney(order.totalPence, order.currency)}</div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)]">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="truncate font-semibold text-sm text-ink">{order.customerName}</div>
                <div className="text-xs text-slate-600">{formatDateTime(order.createdAt)}</div>
              </div>

              {order.customerPhone ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-black/55">
                <span className="font-mono">{formatGhanaPhoneForDisplay(order.customerPhone) || order.customerPhone}</span>
                <a
                  href={`tel:${order.customerPhone}`}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
                >
                  Call
                </a>
                <a
                  href={`https://wa.me/${order.customerPhone.replace(/[^\d]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  WhatsApp
                </a>
              </div>
              ) : null}
            </div>

            <div className="min-w-0 space-y-1">
              <div className={`text-xs text-slate-600 leading-relaxed ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>
                {order.lines.map((line) => `${line.qtyInUnit} × ${toTitleCase(line.productName)} (${toTitleCase(line.unitName)})`).join(' · ')}
              </div>

              {order.paymentCollection?.providerStatus ? (
                <div className="text-xs text-slate-600">
                  Provider: {order.paymentCollection.providerStatus}
                  {order.paymentCollection.providerReference ? ` · Ref ${order.paymentCollection.providerReference}` : ''}
                </div>
              ) : null}
              {order.paymentCollection?.failureReason ? (
                <div className="text-xs text-rose-600">{order.paymentCollection.failureReason}</div>
              ) : null}
            </div>
          </div>

          {order.paymentStatus === 'PAID' && !order.salesInvoiceId && order.status !== 'CANCELLED' ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p>Payment confirmed. Sale posting needs attention before preparation.</p>
              {canManage ? <form action={retryOnlineOrderSaleAction} className="mt-2">
                <input type="hidden" name="orderId" value={order.id} />
                <button className="btn-secondary" type="submit">Retry sale posting</button>
              </form> : <p>Ask your manager to retry sale posting.</p>}
            </div>
          ) : null}
          {canManage && order.refundStatus === 'MANUAL_REFUND_NEEDED' ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
              <p className="text-xs text-rose-800 font-medium">
                Payment was received but this order was cancelled. The customer needs a manual refund.
              </p>
              <form action={markOrderRefundedAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="orderId" value={order.id} />
                <div className="flex-1 min-w-[140px]">
                  <label htmlFor={`refundNote-${order.id}`} className="text-xs font-semibold text-rose-700 uppercase tracking-wide block mb-1">
                    Refund note (optional)
                  </label>
                  <input
                    id={`refundNote-${order.id}`}
                    type="text"
                    name="refundNote"
                    placeholder="e.g. MoMo returned via 055…"
                    className="w-full rounded-md border border-rose-200 bg-white px-2 py-1.5 text-xs focus:border-rose-400 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  aria-label={`Mark order ${order.orderNumber} as refunded`}
                  className="min-h-11 rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition"
                >
                  Mark as refunded
                </button>
              </form>
            </div>
          ) : null}

          {!canManage && order.refundStatus === 'MANUAL_REFUND_NEEDED' ? <p className="text-sm font-medium text-rose-800">Manager action needed: refund this customer.</p> : null}
          {order.refundStatus === 'REFUNDED' && order.refundNote ? (
            <div className="text-xs text-emerald-700">
              Refund note: {order.refundNote}
            </div>
          ) : null}
        </div>

        <div className="flex-shrink-0 lg:w-[13rem]">
          <NextStepCTA
            canManage={canManage}
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
}

function StatusBadge({ status }: { status: string }) {
  const label = formatMerchantOrderStatus(status);
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
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${cls}`}>
      {label}
    </span>
  );
}
