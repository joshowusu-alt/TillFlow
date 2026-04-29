'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime, formatMoney, toTitleCase } from '@/lib/format';

type PublicOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  fulfillmentMethod: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerNotes: string | null;
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  currency: string;
  createdAt: string | Date;
  paidAt: string | Date | null;
  fulfilledAt: string | Date | null;
  paymentCollectionId: string | null;
  storefrontSlug: string;
  storefrontName: string;
  pickupInstructions: string | null;
  paymentCollection: {
    id: string;
    status: string;
    providerStatus: string | null;
    providerReference: string | null;
    providerTransactionId: string | null;
    failureReason: string | null;
    updatedAt: string | Date;
  } | null;
  lines: Array<{
    id: string;
    productName: string;
    unitName: string;
    imageUrl: string | null;
    qtyInUnit: number;
    unitPricePence: number;
    lineTotalPence: number;
  }>;
  business: {
    id: string;
    name: string;
    storefrontPickupInstructions: string | null;
    storefrontSlug: string | null;
  };
};

function statusTone(status: string) {
  if (status === 'PAID' || status === 'READY_FOR_PICKUP' || status === 'COMPLETED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
  if (status === 'PAYMENT_FAILED' || status === 'CANCELLED') {
    return 'border-rose-200 bg-rose-50 text-rose-900';
  }
  return 'border-amber-200 bg-amber-50 text-amber-900';
}

function isPaidStatus(status: string) {
  return status === 'PAID' || status === 'PROCESSING' || status === 'READY_FOR_PICKUP' || status === 'COMPLETED';
}

function buildWhatsAppShareUrl(order: PublicOrder, pickupLocation: string | null) {
  const lines = [
    `*${order.storefrontName}* — Order ${order.orderNumber}`,
    '',
    'Items:',
    ...order.lines.map((line) => `• ${order.lines.length > 0 ? toTitleCase(line.productName) : line.productName} × ${line.qtyInUnit} ${toTitleCase(line.unitName)} — ${formatMoney(line.lineTotalPence, order.currency)}`),
    '',
    `Total paid: ${formatMoney(order.totalPence, order.currency)}`,
    pickupLocation ? `Pickup: ${pickupLocation}` : 'Pickup at the store',
  ];
  const message = lines.filter(Boolean).join('\n');
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export default function OrderStatusClient({ order: initialOrder }: { order: PublicOrder }) {
  const [order, setOrder] = useState(initialOrder);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);

    try {
      const response = await fetch(`/api/storefront/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: order.storefrontSlug,
          token: new URLSearchParams(window.location.search).get('token'),
          refreshPayment: true,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setRefreshError(payload.error ?? 'Unable to refresh order status right now.');
        return;
      }

      setOrder(payload.order);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Unable to refresh order status right now.');
    } finally {
      setRefreshing(false);
    }
  }, [order.id, order.storefrontSlug]);

  useEffect(() => {
    if (order.paymentStatus !== 'PENDING') {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 8000);

    return () => window.clearInterval(timer);
  }, [order.paymentStatus, refreshStatus]);

  const paid = isPaidStatus(order.status);
  const pickupLocation = order.pickupInstructions ?? null;
  const whatsAppUrl = buildWhatsAppShareUrl(order, pickupLocation);
  const storefrontDisplayName = toTitleCase(order.storefrontName);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {paid ? (
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-50 via-white to-white p-6 shadow-sm ring-1 ring-emerald-200/60 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-emerald-100/60 blur-3xl" />

            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/25">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Order confirmed</div>
                    <h1 className="mt-1 text-2xl font-display font-bold text-ink sm:text-3xl">Thanks, {order.customerName.split(' ')[0]}!</h1>
                  </div>
                </div>

                <p className="mt-4 max-w-xl text-sm leading-6 text-black/65 sm:text-base">
                  Your order is being prepared.{' '}
                  {pickupLocation
                    ? `Come to ${storefrontDisplayName} to collect — ${pickupLocation}`
                    : `Come to ${storefrontDisplayName} to collect.`}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-200/70 bg-white/80 px-4 py-3 backdrop-blur-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">Order reference</div>
                    <div className="mt-1 font-mono text-sm font-bold text-ink">{order.orderNumber}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/70 bg-white/80 px-4 py-3 backdrop-blur-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">Total paid</div>
                    <div className="mt-1 text-sm font-bold text-ink">{formatMoney(order.totalPence, order.currency)}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/70 bg-white/80 px-4 py-3 backdrop-blur-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">Status</div>
                    <div className="mt-1 text-sm font-bold capitalize text-ink">{order.status.replace(/_/g, ' ').toLowerCase()}</div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#1faa54]"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.413c-.003 6.557-5.337 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634L2.84 19.95l3.814-1.005zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.521.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
                    </svg>
                    Share order details
                  </a>
                  <Link
                    href={`/shop/${order.storefrontSlug}`}
                    className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
                  >
                    Back to store
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Order status</div>
                <h1 className="mt-2 text-3xl font-display font-bold text-ink">{storefrontDisplayName}</h1>
                <p className="mt-2 text-sm text-black/60">
                  Order <span className="font-semibold text-ink">{order.orderNumber}</span> for {order.customerName}
                </p>
              </div>

              <Link href={`/shop/${order.storefrontSlug}`} className="btn-secondary justify-center">
                Back to store
              </Link>
            </div>

            <div className={`mt-6 rounded-2xl border px-5 py-4 text-sm ${statusTone(order.status)}`}>
              <div className="font-semibold">Current status: {order.status.split('_').join(' ')}</div>
              <div className="mt-1">
                Payment: {order.paymentStatus} · Fulfilment: {order.fulfillmentStatus}
              </div>
              {order.paymentCollection?.providerStatus ? (
                <div className="mt-1 text-xs opacity-80">Provider status: {order.paymentCollection.providerStatus}</div>
              ) : null}
              {order.paymentCollection?.failureReason ? (
                <div className="mt-2 text-xs">{order.paymentCollection.failureReason}</div>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-6 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_300px]">
            <section className="space-y-4">
              {order.lines.map((line) => (
                <div key={line.id} className="rounded-2xl bg-black/[0.03] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-ink">{toTitleCase(line.productName)}</div>
                      <div className="text-xs text-black/50">
                        {line.qtyInUnit} × {toTitleCase(line.unitName)}
                      </div>
                    </div>
                    <div className="font-semibold text-ink">{formatMoney(line.lineTotalPence, order.currency)}</div>
                  </div>
                </div>
              ))}
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl bg-black/[0.03] px-4 py-4 text-sm">
                <div className="font-semibold text-ink">Summary</div>
                <div className="mt-3 space-y-2 text-black/60">
                  <div className="flex items-center justify-between">
                    <span>Subtotal</span>
                    <span>{formatMoney(order.subtotalPence, order.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>VAT</span>
                    <span>{formatMoney(order.vatPence, order.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold text-ink">
                    <span>Total</span>
                    <span>{formatMoney(order.totalPence, order.currency)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-black/[0.03] px-4 py-4 text-sm text-black/60">
                <div className="font-semibold text-ink">Order details</div>
                <div className="mt-3 space-y-2">
                  <div>Placed: {formatDateTime(new Date(order.createdAt))}</div>
                  {order.paidAt ? <div>Paid: {formatDateTime(new Date(order.paidAt))}</div> : null}
                  {order.fulfilledAt ? <div>Completed: {formatDateTime(new Date(order.fulfilledAt))}</div> : null}
                  <div>Phone: {order.customerPhone}</div>
                  {order.customerEmail ? <div>Email: {order.customerEmail}</div> : null}
                  {order.customerNotes ? <div>Note: {order.customerNotes}</div> : null}
                </div>
              </div>

              {order.pickupInstructions ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                  <div className="font-semibold">Pickup instructions</div>
                  <div className="mt-1">{order.pickupInstructions}</div>
                </div>
              ) : null}

              {refreshError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {refreshError}
                </div>
              ) : null}

              <button
                type="button"
                className="btn-primary w-full justify-center"
                onClick={refreshStatus}
                disabled={refreshing}
              >
                {refreshing ? 'Refreshing…' : 'Refresh payment status'}
              </button>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
