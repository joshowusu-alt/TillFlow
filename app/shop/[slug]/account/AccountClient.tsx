'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ResponsiveModal from '@/components/ResponsiveModal';
import { formatMoney, formatGhanaPhoneForDisplay } from '@/lib/format';
import { resolveBrandStyles, type StorefrontBranding } from '@/lib/storefront-branding';

type ReorderLine = { productId: string; unitId: string; qtyInUnit: number };

type OrderView = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalPence: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  publicToken: string;
  lines: Array<{
    id: string;
    productId: string;
    unitId: string;
    productName: string;
    unitName: string;
    imageUrl: string | null;
    qtyInUnit: number;
    unitPricePence: number;
    lineTotalPence: number;
  }>;
  reorderableLines: ReorderLine[];
};

type AccountClientProps = {
  slug: string;
  storefrontName: string;
  branding: StorefrontBranding;
  currency: string;
  customer: {
    name: string | null;
    phone: string;
    email: string | null;
  };
  orders: OrderView[];
};

const STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Payment confirmed',
  PROCESSING: 'Being prepared',
  PREPARING: 'Being prepared',
  READY_FOR_PICKUP: 'Ready for pickup',
  COMPLETED: 'Collected',
  CANCELLED: 'Cancelled',
  PAYMENT_FAILED: 'Payment failed',
};

function statusTone(status: string): string {
  if (status === 'PAID' || status === 'READY_FOR_PICKUP' || status === 'COMPLETED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  }
  if (status === 'PAYMENT_FAILED' || status === 'CANCELLED') {
    return 'border-rose-200 bg-rose-50 text-rose-900';
  }
  return 'border-amber-200 bg-amber-50 text-amber-900';
}

function friendlyStatus(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function reorderLineKey(line: Pick<ReorderLine, 'productId' | 'unitId'>): string {
  return `${line.productId}:${line.unitId}`;
}

function getUnavailableOrderLines(order: OrderView): OrderView['lines'] {
  const reorderableKeys = new Set(order.reorderableLines.map(reorderLineKey));
  return order.lines.filter((line) => !reorderableKeys.has(reorderLineKey(line)));
}

export default function AccountClient({
  slug,
  storefrontName,
  branding,
  currency,
  customer,
  orders,
}: AccountClientProps) {
  const router = useRouter();
  const brand = resolveBrandStyles(branding);
  const [signingOut, setSigningOut] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [pendingReorder, setPendingReorder] = useState<OrderView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pendingUnavailableLines = pendingReorder ? getUnavailableOrderLines(pendingReorder) : [];

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch('/api/storefront/account/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
    } finally {
      router.replace(`/shop/${slug}`);
      router.refresh();
    }
  }

  function confirmReorder(order: OrderView) {
    setPendingReorder(null);
    setReorderingId(order.id);
    const availableCount = order.reorderableLines.length;
    const droppedCount = order.lines.length - availableCount;
    if (order.reorderableLines.length === 0) {
      showToast('None of those products are available right now.');
      setReorderingId(null);
      return;
    }
    try {
      const cartKey = `tillflow_cart_${slug}`;
      const lines = order.reorderableLines.map((line) => ({
        id: `${line.productId}-${line.unitId}-${crypto.randomUUID()}`,
        productId: line.productId,
        unitId: line.unitId,
        qtyInUnit: line.qtyInUnit,
      }));
      localStorage.setItem(cartKey, JSON.stringify(lines));
      if (droppedCount > 0) {
        showToast(`Cart filled. ${droppedCount} item${droppedCount === 1 ? '' : 's'} no longer available.`);
      } else {
        showToast('Cart filled. Heading to checkout…');
      }
      window.setTimeout(() => {
        router.push(`/shop/${slug}`);
      }, 600);
    } catch {
      showToast('Could not refill your cart. Try again.');
    } finally {
      setReorderingId(null);
    }
  }

  function handleReorder(order: OrderView) {
    if (order.reorderableLines.length === 0) {
      showToast('None of those products are available right now.');
      return;
    }
    if (order.reorderableLines.length === order.lines.length) {
      confirmReorder(order);
      return;
    }
    setPendingReorder(order);
  }

  return (
    <div className="min-h-screen bg-slate-50" style={brand.cssVars as React.CSSProperties}>
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={`/shop/${slug}`} className="text-sm font-semibold text-slate-700 hover:underline">
            ← Back to {storefrontName}
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-800 disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <main id="shop-main" className="mx-auto max-w-3xl px-4 py-6">
        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Your account</h1>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Name</div>
              <div className="mt-0.5 text-slate-800">{customer.name ?? 'Not set'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Phone</div>
              <div className="mt-0.5 text-slate-800">{formatGhanaPhoneForDisplay(customer.phone)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Email</div>
              <div className="mt-0.5 text-slate-800">{customer.email ?? 'Not set'}</div>
            </div>
          </div>
        </section>

        <section className="mt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Order history</h2>
            <span className="text-sm text-slate-500">
              {orders.length} {orders.length === 1 ? 'order' : 'orders'}
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
              <p className="text-sm text-slate-600">You haven&apos;t placed any orders yet.</p>
              <Link
                href={`/shop/${slug}`}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-[var(--brand-primary)] px-4 text-sm font-semibold text-[var(--brand-primary-foreground)]"
              >
                Start shopping
              </Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {orders.map((order) => (
                <li key={order.id} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wide text-slate-400">{formatDate(order.createdAt)}</div>
                      <div className="mt-0.5 font-semibold text-slate-900">Order {order.orderNumber}</div>
                      <div className="mt-0.5 text-sm text-slate-500">
                        {order.lines.length} {order.lines.length === 1 ? 'item' : 'items'} · {formatMoney(order.totalPence, order.currency || currency)}
                      </div>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(order.status)}`}
                    >
                      {friendlyStatus(order.status)}
                    </span>
                  </div>

                  <ul className="mt-3 divide-y divide-slate-100 text-sm">
                    {order.lines.slice(0, 4).map((line) => (
                      <li key={line.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0 truncate">
                          <span className="font-medium text-slate-800">{line.productName}</span>
                          <span className="text-slate-500"> · {line.qtyInUnit} {line.unitName}</span>
                        </div>
                        <div className="font-medium text-slate-700">
                          {formatMoney(line.lineTotalPence, order.currency || currency)}
                        </div>
                      </li>
                    ))}
                    {order.lines.length > 4 ? (
                      <li className="py-2 text-xs text-slate-500">
                        + {order.lines.length - 4} more items
                      </li>
                    ) : null}
                  </ul>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleReorder(order)}
                      disabled={reorderingId === order.id || order.reorderableLines.length === 0}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--brand-primary)] px-3.5 text-sm font-semibold text-[var(--brand-primary-foreground)] transition disabled:opacity-50"
                    >
                      {reorderingId === order.id ? 'Adding…' : 'Buy again'}
                    </button>
                    <Link
                      href={`/shop/${slug}/orders/${order.id}?token=${encodeURIComponent(order.publicToken)}`}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      View details
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <ResponsiveModal
        open={pendingReorder !== null}
        onClose={() => {
          if (!reorderingId) setPendingReorder(null);
        }}
        ariaLabel="Confirm reorder"
        maxWidthClassName="max-w-lg"
        footer={
          pendingReorder ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setPendingReorder(null)}
                disabled={reorderingId === pendingReorder.id}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                data-autofocus="true"
                onClick={() => confirmReorder(pendingReorder)}
                disabled={reorderingId === pendingReorder.id}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[var(--brand-primary)] px-4 text-sm font-semibold text-[var(--brand-primary-foreground)] transition hover:opacity-90 disabled:opacity-60"
              >
                {reorderingId === pendingReorder.id
                  ? 'Adding…'
                  : `Add available items (${pendingReorder.reorderableLines.length})`}
              </button>
            </div>
          ) : null
        }
      >
        {pendingReorder ? (
          <div className="px-5 py-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Review before adding
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Some items are no longer available</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              We can refill your cart with the items still available from order {pendingReorder.orderNumber}.
            </p>

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <div className="text-sm font-semibold text-emerald-950">
                Available now ({pendingReorder.reorderableLines.length})
              </div>
              <ul className="mt-3 space-y-2 text-sm text-emerald-950">
                {pendingReorder.lines
                  .filter((line) => pendingReorder.reorderableLines.some((candidate) => reorderLineKey(candidate) === reorderLineKey(line)))
                  .map((line) => (
                    <li key={line.id} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-0.5 text-emerald-600">✓</span>
                      <span>
                        <span className="font-medium">{line.productName}</span>
                        <span className="text-emerald-900/75"> · {line.qtyInUnit} {line.unitName}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
              <div className="text-sm font-semibold text-amber-950">
                No longer available ({pendingUnavailableLines.length})
              </div>
              <ul className="mt-3 space-y-2 text-sm text-amber-950">
                {pendingUnavailableLines.map((line) => (
                  <li key={line.id} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-0.5 text-amber-600">•</span>
                    <span>
                      <span className="font-medium">{line.productName}</span>
                      <span className="text-amber-900/75"> · {line.qtyInUnit} {line.unitName}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </ResponsiveModal>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
