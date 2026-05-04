import { formatGhanaPhoneForDisplay } from '@/lib/format';
import type { StorefrontPaymentMode } from '@/lib/storefront-payments';

export const STOREFRONT_NOTIFICATION_EVENTS = [
  'ORDER_RECEIVED',
  'PAYMENT_CONFIRMED',
  'READY_FOR_PICKUP',
  'CANCELLED',
] as const;

export type StorefrontNotificationEvent = (typeof STOREFRONT_NOTIFICATION_EVENTS)[number];

export type SmsRenderContext = {
  customerName: string | null;
  storefrontName: string;
  orderNumber: string;
  totalPence: number;
  currency: string;
  paymentMode: StorefrontPaymentMode | null;
  paymentStatus: string;
  /** Recipient address for the chosen payment mode (MoMo number, shortcode, etc.). */
  paymentRecipient: string | null;
  paymentNetwork: string | null;
  storeName: string | null;
  storeAddress: string | null;
  storePhone: string | null;
};

function shortAmount(totalPence: number, currency: string): string {
  const amount = (totalPence / 100).toFixed(2);
  return `${currency} ${amount}`;
}

function firstName(value: string | null | undefined): string {
  if (!value) return 'there';
  const trimmed = value.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0]!;
}

function paymentLineForOrderReceived(ctx: SmsRenderContext): string {
  const amount = shortAmount(ctx.totalPence, ctx.currency);
  switch (ctx.paymentMode) {
    case 'MOMO_NUMBER':
      if (ctx.paymentRecipient) {
        const network = ctx.paymentNetwork ? ` (${ctx.paymentNetwork})` : '';
        return `Send ${amount} to ${formatGhanaPhoneForDisplay(ctx.paymentRecipient)}${network} with ref ${ctx.orderNumber}.`;
      }
      return `We'll contact you about payment.`;
    case 'MERCHANT_SHORTCODE':
      if (ctx.paymentRecipient) {
        return `Pay ${amount} to merchant ${ctx.paymentRecipient} with ref ${ctx.orderNumber}.`;
      }
      return `We'll contact you about payment.`;
    case 'BANK_TRANSFER':
    case null:
    default:
      return `We'll contact you about payment.`;
  }
}

function renderOrderReceived(ctx: SmsRenderContext): string {
  const amount = shortAmount(ctx.totalPence, ctx.currency);
  return `Hi ${firstName(ctx.customerName)}, ${ctx.storefrontName} received your order ${ctx.orderNumber} for ${amount}. ${paymentLineForOrderReceived(ctx)}`;
}

function renderPaymentConfirmed(ctx: SmsRenderContext): string {
  return `Payment confirmed for order ${ctx.orderNumber} at ${ctx.storefrontName}. We're preparing it now.`;
}

function renderReadyForPickup(ctx: SmsRenderContext): string {
  const where = [ctx.storefrontName, ctx.storeAddress?.trim() || null]
    .filter((part): part is string => Boolean(part))
    .join(', ');
  return `Your order ${ctx.orderNumber} is ready for pickup at ${where}.`;
}

function renderCancelled(ctx: SmsRenderContext): string {
  const helpLine = ctx.storePhone
    ? ` Call ${formatGhanaPhoneForDisplay(ctx.storePhone)} if you need help.`
    : '';
  if (ctx.paymentStatus === 'PAID') {
    return `Your order ${ctx.orderNumber} at ${ctx.storefrontName} was cancelled. We'll assist with refund steps.${helpLine}`;
  }
  return `Your order ${ctx.orderNumber} at ${ctx.storefrontName} was cancelled.${helpLine}`;
}

/**
 * Render the SMS body for a given notification event.
 *
 * Targets ≤160 characters where practical so each message ships as a single
 * SMS segment (Hubtel bills per segment). The store name is the longest
 * variable input; a 35-char store name + MoMo payment line typically fits.
 */
export function renderOrderNotification(
  event: StorefrontNotificationEvent,
  ctx: SmsRenderContext,
): string {
  switch (event) {
    case 'ORDER_RECEIVED':
      return renderOrderReceived(ctx);
    case 'PAYMENT_CONFIRMED':
      return renderPaymentConfirmed(ctx);
    case 'READY_FOR_PICKUP':
      return renderReadyForPickup(ctx);
    case 'CANCELLED':
      return renderCancelled(ctx);
  }
}
