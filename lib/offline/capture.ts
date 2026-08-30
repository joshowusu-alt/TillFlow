'use client';

import {
  getSyncMeta,
  queueOfflineSale,
  type OfflineSale,
  type OfflineSaleCaptureInput,
  type OfflineSaleLine,
} from './storage';
import { hashOfflineSalePayload } from './payload-hash';

export const CAPTURE_SHIFT_KEY_PREFIX = 'pos.capture.shift.';
export const CAPTURE_CASHIER_KEY_PREFIX = 'pos.capture.cashier.';

export type OfflineCaptureContext = {
  cashierUserId: string | null;
  shiftsByTill: Record<string, string>;
  catalogueVersion?: string | null;
};

let memoryContext: OfflineCaptureContext = {
  cashierUserId: null,
  shiftsByTill: {},
  catalogueVersion: null,
};

export function captureShiftStorageKey(businessId: string, tillId: string): string {
  return `${CAPTURE_SHIFT_KEY_PREFIX}${businessId}.${tillId}`;
}

export function captureCashierStorageKey(businessId: string): string {
  return `${CAPTURE_CASHIER_KEY_PREFIX}${businessId}`;
}

export function peekOfflineCaptureContext(): OfflineCaptureContext {
  return memoryContext;
}

export function peekCapturedShiftId(tillId: string): string | null {
  return memoryContext.shiftsByTill[tillId] ?? null;
}

export function peekCapturedCashierUserId(): string | null {
  return memoryContext.cashierUserId;
}

export function rememberOfflineCaptureContext(
  context: OfflineCaptureContext,
  scope?: { businessId?: string },
): void {
  memoryContext = {
    cashierUserId: context.cashierUserId ?? null,
    shiftsByTill: { ...context.shiftsByTill },
    catalogueVersion: context.catalogueVersion ?? null,
  };

  if (typeof window === 'undefined' || !scope?.businessId) return;

  try {
    if (memoryContext.cashierUserId) {
      window.localStorage.setItem(captureCashierStorageKey(scope.businessId), memoryContext.cashierUserId);
    }
    for (const [tillId, shiftId] of Object.entries(memoryContext.shiftsByTill)) {
      if (shiftId) {
        window.localStorage.setItem(captureShiftStorageKey(scope.businessId, tillId), shiftId);
      }
    }
  } catch {
    // localStorage may be unavailable in private mode — memory context still works.
  }
}

export function readPersistedCaptureFields(scope: {
  businessId: string;
  tillId: string;
}): { shiftId?: string; cashierUserId?: string } {
  const fromMemory = {
    shiftId: peekCapturedShiftId(scope.tillId) ?? undefined,
    cashierUserId: peekCapturedCashierUserId() ?? undefined,
  };
  if (fromMemory.shiftId && fromMemory.cashierUserId) return fromMemory;
  if (typeof window === 'undefined') return fromMemory;

  try {
    return {
      shiftId: fromMemory.shiftId ?? window.localStorage.getItem(captureShiftStorageKey(scope.businessId, scope.tillId)) ?? undefined,
      cashierUserId:
        fromMemory.cashierUserId ?? window.localStorage.getItem(captureCashierStorageKey(scope.businessId)) ?? undefined,
    };
  } catch {
    return fromMemory;
  }
}

export async function hydrateOfflineCaptureContext(businessId?: string): Promise<OfflineCaptureContext | null> {
  try {
    const response = await fetch('/api/offline/sync-sale', { method: 'GET' });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      cashierUserId?: string;
      openShifts?: Array<{ id: string; tillId: string }>;
    };
    const shiftsByTill: Record<string, string> = {};
    for (const shift of data.openShifts ?? []) {
      if (shift?.id && shift?.tillId) shiftsByTill[shift.tillId] = shift.id;
    }
    const context: OfflineCaptureContext = {
      cashierUserId: data.cashierUserId ?? null,
      shiftsByTill,
    };
    rememberOfflineCaptureContext(context, { businessId });
    return context;
  } catch {
    return null;
  }
}

export async function buildOfflineSaleCapture(
  input: OfflineSaleCaptureInput & { catalogueVersion?: string | null },
): Promise<Omit<OfflineSale, 'id'>> {
  const persisted = readPersistedCaptureFields({
    businessId: input.businessId,
    tillId: input.tillId,
  });
  const shiftId = input.shiftId ?? persisted.shiftId ?? null;
  const cashierUserId = input.cashierUserId ?? persisted.cashierUserId ?? null;
  const localSaleTime = input.localSaleTime ?? input.createdAt ?? new Date().toISOString();
  const catalogueVersion =
    input.catalogueVersion ??
    (await getSyncMeta(`products:${input.businessId}:${input.storeId}`).catch(() => null));

  const lines: OfflineSaleLine[] = (input.lines ?? []).map((line) => ({
    productId: String(line.productId),
    unitId: String(line.unitId),
    qtyInUnit: Math.floor(Number(line.qtyInUnit) || 0),
    qtyBase: line.qtyBase != null ? Math.round(Number(line.qtyBase)) : undefined,
    unitPricePence: line.unitPricePence != null ? Math.round(Number(line.unitPricePence)) : undefined,
    lineSubtotalPence: line.lineSubtotalPence != null ? Math.round(Number(line.lineSubtotalPence)) : undefined,
    discountType: String(line.discountType ?? 'NONE'),
    discountValue: String(line.discountValue ?? ''),
  }));

  const payments = (input.payments ?? []).map((payment) => ({
    method: payment.method,
    amountPence: Math.round(Number(payment.amountPence) || 0),
  }));

  const payloadHash =
    input.payloadHash ??
    (await hashOfflineSalePayload({
      businessId: input.businessId,
      storeId: input.storeId,
      tillId: input.tillId,
      shiftId,
      cashierUserId,
      customerId: input.customerId ?? null,
      paymentStatus: input.paymentStatus,
      lines,
      payments,
      orderDiscountType: input.orderDiscountType,
      orderDiscountValue: input.orderDiscountValue,
      inventoryPolicy: input.inventoryPolicy ?? 'enforce',
    }));

  const missingShift = !shiftId;
  return {
    businessId: input.businessId,
    storeId: input.storeId,
    tillId: input.tillId,
    shiftId,
    cashierUserId,
    customerId: input.customerId ?? null,
    paymentStatus: input.paymentStatus,
    lines,
    payments,
    orderDiscountType: input.orderDiscountType,
    orderDiscountValue: input.orderDiscountValue,
    createdAt: localSaleTime,
    localSaleTime,
    localSequence: input.localSequence ?? 0,
    idempotencyKey: input.idempotencyKey ?? '',
    payloadHash,
    catalogueVersion: catalogueVersion ?? null,
    inventoryPolicy: input.inventoryPolicy ?? 'enforce',
    synced: false,
    status: missingShift ? 'needs_review' : 'pending',
    statusReason: missingShift ? 'missing_shift' : undefined,
  };
}

export async function queueCapturedOfflineSale(
  input: OfflineSaleCaptureInput & { catalogueVersion?: string | null },
): Promise<string> {
  const capture = await buildOfflineSaleCapture(input);
  return queueOfflineSale(capture);
}
