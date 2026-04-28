'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime, formatMoney } from '@/lib/format';

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Order status</div>
              <h1 className="mt-2 text-3xl font-display font-bold text-ink">{order.storefrontName}</h1>
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

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_300px]">
            <section className="space-y-4">
              {order.lines.map((line) => (
                <div key={line.id} className="rounded-2xl bg-black/[0.03] px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-ink">{line.productName}</div>
                      <div className="text-xs text-black/50">
                        {line.qtyInUnit} x {line.unitName}
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
