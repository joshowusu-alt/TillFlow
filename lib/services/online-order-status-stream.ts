import { Prisma } from '@prisma/client';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';

export const ONLINE_ORDER_STATUS_CHANNEL = 'online_order_status_updates';

export type OnlineOrderStatusSnapshot = {
  orderId: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  paymentConfirmedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  cancelledAt: string | null;
  notifiedAt: string;
};

type OnlineOrderStatusSnapshotSource = {
  id: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paidAt: Date | string | null;
  fulfilledAt: Date | string | null;
  paymentConfirmedAt: Date | string | null;
  preparingAt: Date | string | null;
  readyAt: Date | string | null;
  collectedAt: Date | string | null;
  cancelledAt: Date | string | null;
};

function toNullableIso(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function isOrderStatusStreamEnabled(env: NodeJS.ProcessEnv = process.env) {
  return String(env.ORDER_STREAM_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

export function buildOnlineOrderStatusSnapshot(order: OnlineOrderStatusSnapshotSource): OnlineOrderStatusSnapshot {
  return {
    orderId: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    paidAt: toNullableIso(order.paidAt),
    fulfilledAt: toNullableIso(order.fulfilledAt),
    paymentConfirmedAt: toNullableIso(order.paymentConfirmedAt),
    preparingAt: toNullableIso(order.preparingAt),
    readyAt: toNullableIso(order.readyAt),
    collectedAt: toNullableIso(order.collectedAt),
    cancelledAt: toNullableIso(order.cancelledAt),
    notifiedAt: new Date().toISOString(),
  };
}

export async function notifyOrderStatusChange(
  tx: Prisma.TransactionClient,
  snapshot: OnlineOrderStatusSnapshot,
) {
  if (!isOrderStatusStreamEnabled() || !isPostgresRuntimeEnv(process.env)) {
    return;
  }

  await tx.$executeRaw`
    SELECT pg_notify(${ONLINE_ORDER_STATUS_CHANNEL}, ${JSON.stringify(snapshot)}::text)
  `;
}
