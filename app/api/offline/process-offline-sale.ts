import { prisma } from '@/lib/prisma';
import { findBusinessCommercialSnapshot } from '@/lib/billing-db-compat';
import { getBillingEntitlement } from '@/lib/billing-entitlements';
import { createSale, type DiscountType } from '@/lib/services/sales';
import type { PaymentStatus } from '@/lib/services/shared';
import { parseDiscountValue } from '@/lib/format';
import {
  hashOfflineSalePayload,
  offlineReplayMatches,
} from '@/lib/offline/payload-hash';

export const CLOCK_SKEW_REVIEW_MS = 24 * 60 * 60 * 1000;
export const LATE_OFFLINE_SALE_SOURCE = 'LATE_OFFLINE';

export type OfflineSyncStatus = 'synced' | 'already_synced' | 'needs_review' | 'rejected';

export interface OfflineSalePayload {
  id: string;
  businessId?: string;
  storeId: string;
  tillId: string;
  shiftId?: string | null;
  cashierUserId?: string | null;
  customerId: string | null;
  paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  lines: Array<{
    productId: string;
    unitId: string;
    qtyInUnit: number;
    qtyBase?: number;
    unitPricePence?: number;
    lineSubtotalPence?: number;
    discountType: string;
    discountValue: string;
  }>;
  payments: Array<{
    method: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
    amountPence: number;
  }>;
  orderDiscountType: string;
  orderDiscountValue: string;
  createdAt: string;
  localSaleTime?: string;
  localSequence?: number;
  idempotencyKey?: string;
  payloadHash?: string;
  catalogueVersion?: string | null;
  inventoryPolicy?: 'enforce' | 'allow-negative';
}

export type ProcessOfflineSaleResult =
  | { success: true; status: 'synced' | 'already_synced'; invoiceId: string; message?: string }
  | { success: false; status: 'needs_review' | 'rejected'; reason: string; invoiceId?: string };

function toDiscountType(value: unknown): DiscountType {
  if (value === 'PERCENT' || value === 'AMOUNT') return value;
  return 'NONE';
}

function toPaymentStatus(value: unknown): PaymentStatus {
  if (value === 'PAID' || value === 'PART_PAID' || value === 'UNPAID') return value;
  return 'PAID';
}

function review(reason: string): ProcessOfflineSaleResult {
  return { success: false, status: 'needs_review', reason };
}

function reject(reason: string): ProcessOfflineSaleResult {
  return { success: false, status: 'rejected', reason };
}

function externalRefsFor(payload: OfflineSalePayload): string[] {
  const key = payload.idempotencyKey?.trim() || payload.id;
  const refs = [`OFFLINE_SYNC:${key}`];
  if (payload.id && payload.id !== key) {
    refs.push(`OFFLINE_SYNC:${payload.id}`);
  }
  return [...new Set(refs)];
}

function replayMatchesExisting(
  existing: {
    storeId: string;
    tillId: string;
    shiftId?: string | null;
    cashierUserId?: string | null;
    customerId?: string | null;
    lines: Array<{ productId: string; unitId: string; qtyInUnit: number }>;
    payments: Array<{ method: string; amountPence: number }>;
  },
  payload: OfflineSalePayload,
): boolean {
  return offlineReplayMatches(existing, {
    storeId: payload.storeId,
    tillId: payload.tillId,
    shiftId: payload.shiftId ?? null,
    cashierUserId: payload.cashierUserId ?? null,
    customerId: payload.customerId ?? null,
    lines: payload.lines ?? [],
    payments: payload.payments ?? [],
  });
}

function classifyCreateSaleError(error: unknown): ProcessOfflineSaleResult | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Insufficient on hand') || message.includes('Insufficient stock')) {
    return review('insufficient_stock');
  }
  if (message.includes('Unit not configured') || message.includes('Product not found')) {
    return review('product_deleted');
  }
  if (message.includes('Open till is required')) {
    return review('shift_closed');
  }
  if (message.includes('Captured offline shift')) {
    return review('shift_not_found');
  }
  if (message.includes('Cashier is not authorised')) {
    return review('cashier_revoked');
  }
  if (message.includes('Customer not found')) {
    return reject('customer_not_found');
  }
  if (message.includes('Store not found')) {
    return reject('store_not_found');
  }
  return null;
}

export function createSaleSupportsLateOfflineHook(): boolean {
  return true;
}

/**
 * Process a single offline sale payload. Shared by both the single sync-sale
 * route and the batch-sync route. Never rebinds a captured sale onto a later shift.
 */
export async function processOfflineSale(
  payload: OfflineSalePayload,
  user: { id: string; businessId: string },
  options?: { seenSequences?: Set<string> },
): Promise<ProcessOfflineSaleResult> {
  if (!payload?.id || !payload.storeId || !payload.tillId || !Array.isArray(payload.lines)) {
    return reject('invalid_payload');
  }
  if (payload.businessId && payload.businessId !== user.businessId) {
    return reject('tenant_mismatch');
  }

  const idempotencyKey = payload.idempotencyKey?.trim() || payload.id;
  if (!idempotencyKey) {
    return reject('missing_idempotency_key');
  }

  const localSaleTimeRaw = payload.localSaleTime || payload.createdAt;
  const localSaleTime = localSaleTimeRaw ? new Date(localSaleTimeRaw) : null;
  if (localSaleTime && !Number.isNaN(localSaleTime.getTime())) {
    if (Math.abs(Date.now() - localSaleTime.getTime()) > CLOCK_SKEW_REVIEW_MS) {
      return review('clock_skew');
    }
  }

  if (!payload.shiftId) {
    return review('missing_shift');
  }

  const expectedHash = await hashOfflineSalePayload({
    businessId: payload.businessId || user.businessId,
    storeId: payload.storeId,
    tillId: payload.tillId,
    shiftId: payload.shiftId,
    cashierUserId: payload.cashierUserId ?? null,
    customerId: payload.customerId ?? null,
    paymentStatus: payload.paymentStatus,
    lines: payload.lines,
    payments: payload.payments ?? [],
    orderDiscountType: payload.orderDiscountType,
    orderDiscountValue: payload.orderDiscountValue,
    inventoryPolicy: payload.inventoryPolicy ?? 'enforce',
  });
  if (!payload.payloadHash) {
    return reject('payload_mismatch');
  }
  if (payload.payloadHash !== expectedHash) {
    return reject('payload_mismatch');
  }

  const refs = externalRefsFor(payload);
  const existingSale = await prisma.salesInvoice.findFirst({
    where: {
      businessId: user.businessId,
      OR: [
        { externalRef: { in: refs } },
        { payments: { some: { reference: { in: refs } } } },
      ],
    },
    select: {
      id: true,
      storeId: true,
      tillId: true,
      shiftId: true,
      cashierUserId: true,
      customerId: true,
      lines: {
        select: {
          productId: true,
          unitId: true,
          qtyInUnit: true,
          unitPricePence: true,
          lineSubtotalPence: true,
        },
      },
      payments: { select: { method: true, amountPence: true } },
    },
  });

  if (existingSale) {
    if (replayMatchesExisting(existingSale, payload)) {
      return {
        success: true,
        status: 'already_synced',
        invoiceId: existingSale.id,
        message: 'Sale already synced',
      };
    }
    return reject('payload_mismatch');
  }

  if (payload.localSequence != null && payload.localSequence > 0) {
    const sequenceKey = `${payload.tillId}:${payload.shiftId}:${payload.localSequence}`;
    if (options?.seenSequences?.has(sequenceKey)) {
      return review('duplicate_local_sequence');
    }
    options?.seenSequences?.add(sequenceKey);
  }

  const store = await prisma.store.findFirst({
    where: { id: payload.storeId, businessId: user.businessId },
    select: { id: true },
  });
  if (!store) return reject('store_not_found');

  const { business } = await findBusinessCommercialSnapshot(user.businessId);
  const entitlement = getBillingEntitlement((business as any) ?? {});
  if (!entitlement.canWrite) return reject('read_only');

  const till = await prisma.till.findFirst({
    where: { id: payload.tillId, storeId: store.id, active: true },
    select: { id: true },
  });
  if (!till) return reject('till_not_found');

  const capturedShift = await prisma.shift.findFirst({
    where: {
      id: payload.shiftId,
      tillId: till.id,
      till: { store: { businessId: user.businessId } },
    },
    select: { id: true, tillId: true, status: true, closedAt: true, openKey: true },
  });
  if (!capturedShift) {
    return review('shift_not_found');
  }
  if (capturedShift.tillId !== till.id) {
    return review('shift_till_mismatch');
  }

  const capturedCashierId = payload.cashierUserId?.trim() || null;
  if (capturedCashierId) {
    const cashier = await prisma.user.findFirst({
      where: { id: capturedCashierId },
      select: { id: true, businessId: true, active: true },
    });
    if (!cashier || cashier.businessId !== user.businessId) {
      return review('cashier_revoked');
    }
    // Revoked/inactive cashier: still pass captured id (do not rewrite).
  }

  if (payload.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: payload.customerId, businessId: user.businessId },
      select: { id: true },
    });
    if (!customer) return reject('customer_not_found');
  }

  const lines = payload.lines
    .map((line) => {
      const qtyInUnit = Math.floor(Number(line.qtyInUnit));
      const discountType = toDiscountType(line.discountType);
      return {
        productId: String(line.productId || ''),
        unitId: String(line.unitId || ''),
        qtyInUnit,
        qtyBase: line.qtyBase != null ? Math.round(Number(line.qtyBase)) : undefined,
        unitPricePence: line.unitPricePence != null ? Math.round(Number(line.unitPricePence)) : undefined,
        lineSubtotalPence:
          line.lineSubtotalPence != null ? Math.round(Number(line.lineSubtotalPence)) : undefined,
        discountType,
        discountValue: parseDiscountValue(discountType, line.discountValue),
      };
    })
    .filter((line) => line.productId && line.unitId && line.qtyInUnit > 0);

  if (lines.length === 0) {
    return reject('invalid_payload');
  }

  const externalRef = refs[0];
  const payments = Array.isArray(payload.payments)
    ? payload.payments
        .map((payment) => ({
          method: payment.method,
          amountPence: Math.max(0, Math.round(Number(payment.amountPence) || 0)),
          reference: externalRef,
        }))
        .filter((payment) => payment.amountPence > 0)
    : [];

  const orderDiscountType = toDiscountType(payload.orderDiscountType);
  const orderDiscountValue = parseDiscountValue(orderDiscountType, payload.orderDiscountValue);
  const createdAt = localSaleTime && !Number.isNaN(localSaleTime.getTime()) ? localSaleTime : null;
  const inventoryPolicy = payload.inventoryPolicy === 'allow-negative' ? 'allow-negative' : 'enforce';
  const cashierUserId = capturedCashierId || user.id;

  try {
    const invoice = await createSale({
      businessId: user.businessId,
      storeId: store.id,
      tillId: till.id,
      cashierUserId,
      customerId: payload.customerId || null,
      paymentStatus: toPaymentStatus(payload.paymentStatus),
      dueDate: null,
      orderDiscountType,
      orderDiscountValue,
      externalRef,
      createdAt,
      inventoryPolicy,
      payments,
      lines,
      // Immutable captured shift. LATE_OFFLINE vs ordinary sync is decided
      // inside createSale's transaction after locking this row — not here.
      capturedShiftId: payload.shiftId,
    });
    return { success: true, status: 'synced', invoiceId: invoice.id };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in (error as object) &&
      (error as { code?: string }).code === 'P2002' &&
      (error as { meta?: { target?: string[] } }).meta?.target?.includes('externalRef')
    ) {
      const existing = await prisma.salesInvoice.findFirst({
        where: { businessId: user.businessId, externalRef },
        select: {
          id: true,
          storeId: true,
          tillId: true,
          cashierUserId: true,
          customerId: true,
          lines: {
            select: {
              productId: true,
              unitId: true,
              qtyInUnit: true,
              unitPricePence: true,
              lineSubtotalPence: true,
            },
          },
          payments: { select: { method: true, amountPence: true } },
        },
      });
      if (existing) {
        if (replayMatchesExisting(existing, payload)) {
          return {
            success: true,
            status: 'already_synced',
            invoiceId: existing.id,
            message: 'Sale already synced',
          };
        }
        return reject('payload_mismatch');
      }
    }

    const classified = classifyCreateSaleError(error);
    if (classified) return classified;
    throw error;
  }
}

export async function loadOfflineCaptureContext(user: { id: string; businessId: string }) {
  const openShifts = await prisma.shift.findMany({
    where: {
      status: 'OPEN',
      closedAt: null,
      till: { store: { businessId: user.businessId } },
    },
    select: { id: true, tillId: true, userId: true },
  });
  return {
    cashierUserId: user.id,
    openShifts,
  };
}
