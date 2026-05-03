import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeGhanaPhone } from '@/lib/storefront-phone';
import { normalizePaymentMode, type StorefrontPaymentMode } from '@/lib/storefront-payments';
import {
  renderOrderNotification,
  type StorefrontNotificationEvent,
  type SmsRenderContext,
} from '@/lib/services/sms-templates';
import { sendStorefrontSms } from '@/lib/services/storefront-sms';

export type { StorefrontNotificationEvent } from '@/lib/services/sms-templates';

type PrismaTx = Prisma.TransactionClient | PrismaClient;

export type EnqueueOrderNotificationInput = {
  orderId: string;
  eventType: StorefrontNotificationEvent;
  /**
   * Optional Prisma transaction client. Pass this when you want the outbox
   * insert to commit/rollback alongside the order transition that triggered
   * it — e.g. inside createOnlineCheckout's $transaction.
   */
  tx?: PrismaTx;
};

export type EnqueueOrderNotificationResult =
  | { ok: true; outboxId: string; deduped: boolean }
  | { ok: false; reason: 'ORDER_NOT_FOUND' | 'NOTIFICATIONS_DISABLED' | 'NO_RECIPIENT' };

const SMS_DEFAULT_DAILY_CAP = 100;
const SMS_DAILY_CAP_WARNING_RATIO = 0.8;

export const STOREFRONT_SMS_DAILY_CAP = SMS_DEFAULT_DAILY_CAP;
export const STOREFRONT_SMS_DAILY_CAP_WARNING_RATIO = SMS_DAILY_CAP_WARNING_RATIO;

function paymentRecipientFor(business: {
  storefrontPaymentMode: string | null;
  storefrontMomoNumber: string | null;
  storefrontMerchantShortcode: string | null;
}): string | null {
  switch (normalizePaymentMode(business.storefrontPaymentMode)) {
    case 'MOMO_NUMBER':
      return business.storefrontMomoNumber?.trim() || null;
    case 'MERCHANT_SHORTCODE':
      return business.storefrontMerchantShortcode?.trim() || null;
    case 'BANK_TRANSFER':
    default:
      return null;
  }
}

function buildRenderContext(args: {
  order: {
    orderNumber: string;
    customerName: string | null;
    customerPhone: string;
    totalPence: number;
    currency: string;
    paymentStatus: string;
  };
  business: {
    name: string;
    storefrontPaymentMode: string | null;
    storefrontMomoNumber: string | null;
    storefrontMomoNetwork: string | null;
    storefrontMerchantShortcode: string | null;
    phone: string | null;
  };
  store: {
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
}): SmsRenderContext {
  const paymentMode = normalizePaymentMode(args.business.storefrontPaymentMode);
  const recipientForMode = paymentRecipientFor(args.business);

  return {
    customerName: args.order.customerName,
    storefrontName: args.business.name,
    orderNumber: args.order.orderNumber,
    totalPence: args.order.totalPence,
    currency: args.order.currency,
    paymentMode: paymentMode as StorefrontPaymentMode,
    paymentStatus: args.order.paymentStatus,
    paymentRecipient: recipientForMode,
    paymentNetwork: args.business.storefrontMomoNetwork,
    storeName: args.store?.name ?? null,
    storeAddress: args.store?.address ?? null,
    storePhone: args.store?.phone ?? args.business.phone ?? null,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Enqueue a transactional SMS notification for an online order.
 *
 * Idempotency: the (onlineOrderId, eventType) unique constraint guarantees at
 * most one outbox row per event per order. A duplicate enqueue is reported as
 * a deduped success — callers can fire from multiple code paths without
 * worrying about double-sends.
 *
 * Caller flexibility: pass `tx` to enroll the insert in the same transaction
 * as the triggering order update; omit it to write outside any transaction.
 */
export async function enqueueOrderNotification(
  input: EnqueueOrderNotificationInput,
): Promise<EnqueueOrderNotificationResult> {
  const db: PrismaTx = input.tx ?? prisma;

  const order = await db.onlineOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      businessId: true,
      storeId: true,
      orderNumber: true,
      customerName: true,
      customerPhone: true,
      totalPence: true,
      currency: true,
      paymentStatus: true,
    },
  });
  if (!order) {
    return { ok: false, reason: 'ORDER_NOT_FOUND' };
  }

  const business = await db.business.findUnique({
    where: { id: order.businessId },
    select: {
      id: true,
      name: true,
      smsNotificationsEnabled: true,
      smsSenderId: true,
      storefrontPaymentMode: true,
      storefrontMomoNumber: true,
      storefrontMomoNetwork: true,
      storefrontMerchantShortcode: true,
      phone: true,
    },
  });
  if (!business || !business.smsNotificationsEnabled) {
    return { ok: false, reason: 'NOTIFICATIONS_DISABLED' };
  }

  const recipient = normalizeGhanaPhone(order.customerPhone);
  if (!recipient) {
    return { ok: false, reason: 'NO_RECIPIENT' };
  }

  const store = await db.store.findUnique({
    where: { id: order.storeId },
    select: { name: true, address: true, phone: true },
  });

  const ctx = buildRenderContext({
    order,
    business: {
      name: business.name,
      storefrontPaymentMode: business.storefrontPaymentMode,
      storefrontMomoNumber: business.storefrontMomoNumber,
      storefrontMomoNetwork: business.storefrontMomoNetwork,
      storefrontMerchantShortcode: business.storefrontMerchantShortcode,
      phone: business.phone,
    },
    store,
  });

  const body = renderOrderNotification(input.eventType, ctx);

  const payload = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    storefrontName: business.name,
    customerName: order.customerName,
    totalPence: order.totalPence,
    currency: order.currency,
    paymentMode: business.storefrontPaymentMode,
    paymentStatus: order.paymentStatus,
    eventType: input.eventType,
  };

  try {
    const created = await db.messageOutbox.create({
      data: {
        businessId: business.id,
        onlineOrderId: order.id,
        eventType: input.eventType,
        channel: 'SMS',
        recipient,
        body,
        status: 'PENDING',
        payloadJson: JSON.stringify(payload),
      },
      select: { id: true },
    });
    return { ok: true, outboxId: created.id, deduped: false };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await db.messageOutbox.findUnique({
        where: {
          onlineOrderId_eventType: { onlineOrderId: order.id, eventType: input.eventType },
        },
        select: { id: true },
      });
      if (existing) {
        return { ok: true, outboxId: existing.id, deduped: true };
      }
    }
    throw error;
  }
}

/**
 * Best-effort immediate send for a single outbox row.
 *
 * After enqueue we attempt to deliver the SMS right away so the customer
 * doesn't wait until the next scheduled cron run. Any failure is silently
 * swallowed — the outbox row stays PENDING and the daily cron will retry it.
 */
async function tryImmediateDispatch(outboxId: string): Promise<void> {
  try {
    const row = await prisma.messageOutbox.findUnique({
      where: { id: outboxId },
      select: {
        id: true,
        status: true,
        recipient: true,
        body: true,
        business: { select: { smsSenderId: true } },
      },
    });
    if (!row || row.status !== 'PENDING') return;

    const sendResult = await sendStorefrontSms({
      to: row.recipient,
      body: row.body,
      senderId: row.business.smsSenderId,
    });

    if (sendResult.ok) {
      await prisma.messageOutbox.update({
        where: { id: outboxId },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
      });
    } else {
      await prisma.messageOutbox.update({
        where: { id: outboxId },
        data: {
          attempts: { increment: 1 },
          lastError: sendResult.error.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + 60_000),
        },
      });
    }
  } catch {
    // Non-fatal — outbox row stays PENDING for the cron dispatcher
  }
}

/**
 * Soft-fail wrapper for use in transitions where an enqueue failure should
 * never abort the user-facing action. Logs to console and continues.
 *
 * After enqueueing, attempts an immediate in-process send so customers
 * receive SMS near-real-time rather than waiting for the next cron run.
 */
export async function enqueueOrderNotificationSafe(
  input: EnqueueOrderNotificationInput,
): Promise<void> {
  try {
    const result = await enqueueOrderNotification(input);
    if (!result.ok) {
      console.warn('[storefront-notifications] enqueue skipped', {
        orderId: input.orderId,
        eventType: input.eventType,
        reason: result.reason,
      });
      return;
    }
    if (!result.deduped) {
      await tryImmediateDispatch(result.outboxId);
    }
  } catch (error) {
    console.error('[storefront-notifications] enqueue failed', {
      orderId: input.orderId,
      eventType: input.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
