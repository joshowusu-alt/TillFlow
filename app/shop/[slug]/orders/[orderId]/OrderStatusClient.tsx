'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateTime, formatMoney, toTitleCase, formatGhanaPhoneForDisplay } from '@/lib/format';
import {
  buildPaymentShareMessage,
  getPaymentInstructionDetails,
  normalizePaymentMode,
  type StorefrontPaymentConfig,
  type StorefrontPaymentMode,
} from '@/lib/storefront-payments';

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
  storefrontPhone: string | null;
  pickupInstructions: string | null;
  momoPayoutNumber: string | null;
  momoPayoutNetwork: string | null;
  paymentMode: string | null;
  merchantShortcode: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  storeMessage: string | null;
  pickupStoreName: string | null;
  pickupStoreAddress: string | null;
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

function friendlyStatus(status: string): string {
  const map: Record<string, string> = {
    AWAITING_PAYMENT: 'Awaiting payment',
    PAID: 'Payment confirmed',
    PREPARING: 'Being prepared',
    READY_FOR_PICKUP: 'Ready for pickup',
    COMPLETED: 'Collected',
    CANCELLED: 'Cancelled',
    PAYMENT_FAILED: 'Payment failed',
  };
  return map[status] ?? status.split('_').join(' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function friendlyPaymentStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Pending',
    PAID: 'Confirmed',
    FAILED: 'Failed',
    REFUNDED: 'Refunded',
  };
  return map[status] ?? status;
}

function friendlyFulfillmentStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Not started',
    PREPARING: 'In preparation',
    READY: 'Ready',
    COLLECTED: 'Collected',
    CANCELLED: 'Cancelled',
  };
  return map[status] ?? status;
}

function buildPaidShareUrl(order: PublicOrder, pickupLocation: string | null) {
  const lines = [
    `*${order.storefrontName}* — Order ${order.orderNumber}`,
    '',
    'Items:',
    ...order.lines.map((line) => `• ${toTitleCase(line.productName)} × ${line.qtyInUnit} ${toTitleCase(line.unitName)} — ${formatMoney(line.lineTotalPence, order.currency)}`),
    '',
    `Total paid: ${formatMoney(order.totalPence, order.currency)}`,
    pickupLocation ? `Pickup: ${pickupLocation}` : 'Pickup at the store',
  ];
  const message = lines.filter(Boolean).join('\n');
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function buildOrderPaymentConfig(order: PublicOrder): StorefrontPaymentConfig {
  return {
    mode: normalizePaymentMode(order.paymentMode),
    momoNumber: order.momoPayoutNumber,
    momoNetwork: order.momoPayoutNetwork,
    merchantShortcode: order.merchantShortcode,
    bankName: order.bankName,
    bankAccountName: order.bankAccountName,
    bankAccountNumber: order.bankAccountNumber,
    bankBranch: order.bankBranch,
    paymentNote: order.storeMessage,
  };
}

function buildPaymentShareUrl(order: PublicOrder, config: StorefrontPaymentConfig) {
  const message = buildPaymentShareMessage({
    storeName: order.storefrontName,
    reference: order.orderNumber,
    amountFormatted: formatMoney(order.totalPence, order.currency),
    config,
  });
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// ─── Status config ─────────────────────────────────────────────────────────────

interface StatusConfig {
  icon: string;
  bg: string;
  ring: string;
  iconBg: string;
  labelColor: string;
  label: string;
  title: string;
  message: string | null;
}

function getStatusConfig(status: string): StatusConfig {
  switch (status) {
    case 'AWAITING_PAYMENT':
      return { icon: 'clock', bg: 'bg-amber-50', ring: 'ring-amber-200/70', iconBg: 'bg-amber-500 shadow-amber-500/25', labelColor: 'text-amber-700', label: 'Order placed', title: 'Send payment to confirm', message: null };
    case 'PAID':
      return { icon: 'check', bg: 'bg-sky-50', ring: 'ring-sky-200/70', iconBg: 'bg-sky-500 shadow-sky-500/25', labelColor: 'text-sky-700', label: 'Payment confirmed', title: 'Payment received', message: 'Your payment has been confirmed. We\'re preparing your order.' };
    case 'PROCESSING':
    case 'PREPARING':
      return { icon: 'gear', bg: 'bg-indigo-50', ring: 'ring-indigo-200/70', iconBg: 'bg-indigo-500 shadow-indigo-500/25', labelColor: 'text-indigo-700', label: 'Being prepared', title: 'Your order is being prepared', message: 'We\'ll update this page as soon as your order is ready.' };
    case 'READY_FOR_PICKUP':
      return { icon: 'bag', bg: 'bg-emerald-50', ring: 'ring-emerald-200/70', iconBg: 'bg-emerald-500 shadow-emerald-500/25', labelColor: 'text-emerald-700', label: 'Ready for pickup', title: 'Your order is ready!', message: 'Come to the store to collect your order. Bring your order reference.' };
    case 'COMPLETED':
      return { icon: 'check', bg: 'bg-emerald-50', ring: 'ring-emerald-200/70', iconBg: 'bg-emerald-500 shadow-emerald-500/25', labelColor: 'text-emerald-700', label: 'Collected', title: 'Order collected', message: 'Your order has been collected. Thank you for shopping with us!' };
    case 'CANCELLED':
      return { icon: 'x', bg: 'bg-rose-50', ring: 'ring-rose-200/70', iconBg: 'bg-rose-500 shadow-rose-500/25', labelColor: 'text-rose-700', label: 'Cancelled', title: 'Order cancelled', message: 'This order was cancelled. Contact the store if you have questions.' };
    default:
      return { icon: 'clock', bg: 'bg-slate-50', ring: 'ring-slate-200/60', iconBg: 'bg-slate-500 shadow-slate-500/25', labelColor: 'text-slate-600', label: 'Order status', title: friendlyStatus(status), message: null };
  }
}

const TIMELINE_STEPS = ['Placed', 'Paid', 'Preparing', 'Ready', 'Collected'] as const;

function getActiveStep(status: string): number {
  if (status === 'COMPLETED') return 4;
  if (status === 'READY_FOR_PICKUP') return 3;
  if (status === 'PROCESSING' || status === 'PREPARING') return 2;
  if (status === 'PAID') return 1;
  return 0;
}

function StatusIcon({ type }: { type: string }) {
  if (type === 'check') return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
  if (type === 'clock') return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (type === 'gear') return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c-.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
  if (type === 'bag') return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
  if (type === 'x') return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
  return null;
}

function WAIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.413c-.003 6.557-5.337 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634L2.84 19.95l3.814-1.005zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.521.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
    </svg>
  );
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

    // Poll every 20s while awaiting manual payment confirmation. The merchant
    // marks payment received in TillFlow, which flips paymentStatus to PAID
    // — at which point this effect tears down.
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 20_000);

    return () => window.clearInterval(timer);
  }, [order.paymentStatus, refreshStatus]);

  const paid = isPaidStatus(order.status);
  const awaitingPayment = !paid && order.status !== 'CANCELLED';
  const isCancelled = order.status === 'CANCELLED';
  const pickupLocation = order.pickupStoreAddress ?? order.pickupInstructions ?? null;
  const paymentConfig = buildOrderPaymentConfig(order);
  const paymentDetails = getPaymentInstructionDetails(paymentConfig);
  const paidWhatsAppUrl = buildPaidShareUrl(order, pickupLocation);
  const paymentWhatsAppUrl = buildPaymentShareUrl(order, paymentConfig);
  const storefrontDisplayName = toTitleCase(order.storefrontName);
  const customerPhoneDisplay = formatGhanaPhoneForDisplay(order.customerPhone);
  const storefrontPhoneDisplay = formatGhanaPhoneForDisplay(order.storefrontPhone);
  const statusConfig = getStatusConfig(order.status);
  const activeStep = isCancelled ? -1 : getActiveStep(order.status);
  const heroMessage: string | null = statusConfig.message ?? (
    awaitingPayment && !paymentDetails.manual
      ? `Send exactly ${formatMoney(order.totalPence, order.currency)} using reference ${order.orderNumber} to confirm your order.`
      : awaitingPayment && paymentDetails.manual
      ? `${storefrontDisplayName} will contact you on ${customerPhoneDisplay || order.customerPhone} to share payment details.`
      : null
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">

        {/* Store nav + order number */}
        <div className="mb-5 flex items-center justify-between">
          <Link
            href={`/shop/${order.storefrontSlug}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-black/55 transition hover:text-ink"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            {storefrontDisplayName}
          </Link>
          <div className="font-mono text-xs font-semibold text-black/35">{order.orderNumber}</div>
        </div>

        {/* Status hero */}
        <div className={`relative overflow-hidden rounded-3xl p-6 shadow-sm ring-1 ${statusConfig.ring} ${statusConfig.bg}`}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/30 blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${statusConfig.iconBg}`}>
              <StatusIcon type={statusConfig.icon} />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${statusConfig.labelColor}`}>
                {statusConfig.label}
              </div>
              <h1 className="mt-0.5 text-xl font-display font-bold text-ink sm:text-2xl">
                {statusConfig.title}
              </h1>
              {heroMessage && (
                <p className="mt-2 text-sm leading-6 text-black/65">{heroMessage}</p>
              )}
            </div>
          </div>
        </div>

        {/* Order progress timeline — not for cancelled */}
        {!isCancelled && (
          <div className="mt-4 overflow-hidden rounded-2xl bg-white px-4 py-5 shadow-sm ring-1 ring-black/5">
            <div className="flex items-start">
              {TIMELINE_STEPS.map((step, idx) => {
                const isDone = idx < activeStep;
                const isActive = idx === activeStep;
                const isLast = idx === TIMELINE_STEPS.length - 1;
                return (
                  <div key={step} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors ${
                        isDone ? 'border-emerald-500 bg-emerald-500 text-white'
                          : isActive ? 'border-accent bg-accent text-white'
                          : 'border-black/15 bg-white text-black/30'
                      }`}>
                        {isDone ? (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : idx + 1}
                      </div>
                      {!isLast && (
                        <div className={`h-0.5 flex-1 ${idx < activeStep ? 'bg-emerald-400' : 'bg-black/10'}`} />
                      )}
                    </div>
                    <div className={`mt-2 text-center text-[9px] font-semibold leading-tight ${
                      isActive ? 'text-accent' : isDone ? 'text-emerald-600' : 'text-black/30'
                    }`} style={{ maxWidth: 44 }}>
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reference + amount — always visible */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-black/40">Reference</div>
            <div className="mt-1 font-mono text-lg font-bold text-ink">{order.orderNumber}</div>
            <div className="mt-0.5 text-[10px] text-black/40">Quote when collecting</div>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-black/5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-black/40">
              {paid ? 'Total paid' : 'Amount due'}
            </div>
            <div className="mt-1 text-lg font-bold text-ink">{formatMoney(order.totalPence, order.currency)}</div>
            <div className="mt-0.5 text-[10px] text-black/40">
              {order.lines.length} item{order.lines.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Payment instructions — awaiting only */}
        {awaitingPayment && !paymentDetails.manual && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
            <div className="border-b border-amber-200/60 bg-amber-50/70 px-5 py-3">
              <div className="font-semibold text-amber-900">How to pay</div>
            </div>
            <div className="px-5 py-4 text-sm text-black/65">
              {paymentConfig.mode === 'MERCHANT_SHORTCODE' ? (
                <ol className="list-decimal space-y-2 pl-4">
                  <li>Open your MoMo app or dial the USSD code.</li>
                  <li>Choose <span className="font-semibold text-ink">Pay merchant</span>.</li>
                  <li>Enter merchant number <span className="font-mono font-bold text-ink">{order.merchantShortcode}</span>{order.momoPayoutNetwork ? ` (${order.momoPayoutNetwork})` : ''}.</li>
                  <li>Enter amount: <span className="font-bold text-ink">{formatMoney(order.totalPence, order.currency)}</span>.</li>
                  <li>Use <span className="font-mono font-bold text-ink">{order.orderNumber}</span> as the reference note.</li>
                  <li>Come back here — your order updates once confirmed.</li>
                </ol>
              ) : paymentConfig.mode === 'BANK_TRANSFER' ? (
                <ol className="list-decimal space-y-2 pl-4">
                  <li>Open your banking app or visit your branch.</li>
                  <li>Transfer <span className="font-bold text-ink">{formatMoney(order.totalPence, order.currency)}</span>{order.bankAccountNumber ? <> to account <span className="font-mono font-bold text-ink">{order.bankAccountNumber}</span></> : null}{order.bankName ? ` (${order.bankName})` : ''}.</li>
                  <li>Use <span className="font-mono font-bold text-ink">{order.orderNumber}</span> as the narration / reference.</li>
                  <li>Come back here to confirm when done.</li>
                </ol>
              ) : (
                <ol className="list-decimal space-y-2 pl-4">
                  <li>Open your MoMo app or dial the USSD code.</li>
                  <li>Send <span className="font-bold text-ink">{formatMoney(order.totalPence, order.currency)}</span> to <span className="font-mono font-bold text-ink">{order.momoPayoutNumber}</span>{order.momoPayoutNetwork ? ` on ${order.momoPayoutNetwork}` : ''}.</li>
                  <li>Use <span className="font-mono font-bold text-ink">{order.orderNumber}</span> as the payment note.</li>
                  <li>Come back here — your order updates once confirmed.</li>
                </ol>
              )}

              {paymentDetails.ready && (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-black/8 bg-black/[0.025] px-3 py-2.5">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-black/40">{paymentDetails.modeLabel}</div>
                    <div className="mt-0.5 font-mono text-base font-bold text-ink">{paymentDetails.recipient}</div>
                    {paymentDetails.recipientCaption && (
                      <div className="mt-0.5 text-[10px] text-black/50">{paymentDetails.recipientCaption}</div>
                    )}
                  </div>
                </div>
              )}

              {paymentConfig.mode === 'BANK_TRANSFER' && order.bankName && (
                <div className="mt-3 space-y-0.5 rounded-xl bg-black/[0.03] px-3 py-2.5 text-xs text-black/65">
                  {order.bankName && <div><span className="font-semibold text-ink">Bank:</span> {order.bankName}</div>}
                  {order.bankAccountName && <div><span className="font-semibold text-ink">Account name:</span> {order.bankAccountName}</div>}
                  {order.bankBranch && <div><span className="font-semibold text-ink">Branch:</span> {order.bankBranch}</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual payment — store will contact */}
        {awaitingPayment && paymentDetails.manual && (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
            <div className="font-semibold">What happens next</div>
            <p className="mt-1 leading-6">
              {storefrontDisplayName} will contact you on{' '}
              <span className="font-semibold">{customerPhoneDisplay || order.customerPhone}</span> to share payment details.{' '}
              Keep your reference <span className="font-mono font-bold">{order.orderNumber}</span> handy.
            </p>
          </div>
        )}

        {/* Pickup instructions — ready / completed */}
        {(order.status === 'READY_FOR_PICKUP' || order.status === 'COMPLETED') && pickupLocation && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm">
            <div className="font-semibold text-emerald-900">Pickup instructions</div>
            <div className="mt-1 leading-6 text-emerald-800">{pickupLocation}</div>
          </div>
        )}

        {/* Store message */}
        {order.storeMessage && (
          <div className="mt-4 rounded-2xl border border-black/5 bg-white px-5 py-3 text-sm text-black/65">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-black/40">From {storefrontDisplayName}</div>
            <div className="leading-6">{order.storeMessage}</div>
          </div>
        )}

        {/* Refresh error */}
        {refreshError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {refreshError}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {awaitingPayment ? (
            <>
              <a
                href={paymentWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1faa54]"
              >
                <WAIcon />
                Share payment details
              </a>
              <button
                type="button"
                onClick={() => void refreshStatus()}
                disabled={refreshing}
                className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent disabled:opacity-50"
              >
                {refreshing ? 'Checking…' : 'I paid — check status'}
              </button>
            </>
          ) : paid ? (
            <>
              <a
                href={paidWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1faa54]"
              >
                <WAIcon />
                Share order details
              </a>
              <Link
                href={`/shop/${order.storefrontSlug}`}
                className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
              >
                Back to store
              </Link>
            </>
          ) : (
            <Link
              href={`/shop/${order.storefrontSlug}`}
              className="inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm font-semibold text-ink transition hover:border-accent/30 hover:text-accent"
            >
              Back to store
            </Link>
          )}
        </div>

        {/* Store phone contact */}
        {order.storefrontPhone && awaitingPayment && (
          <div className="mt-3 text-center text-xs text-black/45">
            Questions?{' '}
            <a href={`tel:${order.storefrontPhone}`} className="font-semibold text-accent hover:underline">
              Call {storefrontDisplayName}
            </a>
            {storefrontPhoneDisplay && <span> ({storefrontPhoneDisplay})</span>}
          </div>
        )}

        {/* Order items */}
        <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="border-b border-black/5 px-5 py-4">
            <h2 className="font-semibold text-ink">Your order</h2>
          </div>
          <div className="divide-y divide-black/5">
            {order.lines.map((line) => (
              <div key={line.id} className="flex items-center gap-4 px-5 py-3.5">
                {line.imageUrl ? (
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    <img src={line.imageUrl} alt={toTitleCase(line.productName)} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{toTitleCase(line.productName)}</div>
                  <div className="text-xs text-black/45">{line.qtyInUnit} × {toTitleCase(line.unitName)}</div>
                </div>
                <div className="shrink-0 font-semibold text-ink">{formatMoney(line.lineTotalPence, order.currency)}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-black/5 bg-black/[0.02] px-5 py-4 text-sm">
            <div className="flex justify-between text-black/55">
              <span>Subtotal</span>
              <span>{formatMoney(order.subtotalPence, order.currency)}</span>
            </div>
            {order.vatPence > 0 && (
              <div className="flex justify-between text-black/55">
                <span>VAT</span>
                <span>{formatMoney(order.vatPence, order.currency)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-black/5 pt-2 font-bold text-ink">
              <span>Total</span>
              <span>{formatMoney(order.totalPence, order.currency)}</span>
            </div>
          </div>
        </div>

        {/* Order details */}
        <div className="mt-4 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5 text-sm text-black/55">
          <div className="mb-3 font-semibold text-ink">Order details</div>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-4">
              <span>Placed</span>
              <span className="text-right text-ink">{formatDateTime(new Date(order.createdAt))}</span>
            </div>
            {order.paidAt ? (
              <div className="flex justify-between gap-4">
                <span>Payment confirmed</span>
                <span className="text-right text-ink">{formatDateTime(new Date(order.paidAt))}</span>
              </div>
            ) : null}
            {order.fulfilledAt ? (
              <div className="flex justify-between gap-4">
                <span>Collected</span>
                <span className="text-right text-ink">{formatDateTime(new Date(order.fulfilledAt))}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <span>Name</span>
              <span className="text-right text-ink">{order.customerName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Phone</span>
              <span className="text-right text-ink">{customerPhoneDisplay || order.customerPhone}</span>
            </div>
            {order.customerEmail ? (
              <div className="flex justify-between gap-4">
                <span>Email</span>
                <span className="text-right text-ink">{order.customerEmail}</span>
              </div>
            ) : null}
            {order.customerNotes ? (
              <div className="flex justify-between gap-4">
                <span>Note</span>
                <span className="text-right text-ink">{order.customerNotes}</span>
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
}
