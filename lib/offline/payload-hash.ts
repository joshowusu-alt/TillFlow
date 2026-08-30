/**
 * Canonical payload hash for offline sale capture / exact-replay sync.
 * Hash includes identity, tenders, product+unit ids, quantities, and captured prices.
 */

export type OfflineSaleHashLine = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  qtyBase?: number;
  unitPricePence?: number;
  lineSubtotalPence?: number;
  discountType: string;
  discountValue: string;
};

export type OfflineSaleHashPayment = {
  method: string;
  amountPence: number;
};

export type OfflineSaleHashInput = {
  businessId: string;
  storeId: string;
  tillId: string;
  shiftId?: string | null;
  cashierUserId?: string | null;
  customerId?: string | null;
  paymentStatus: string;
  lines: OfflineSaleHashLine[];
  payments: OfflineSaleHashPayment[];
  orderDiscountType: string;
  orderDiscountValue: string;
  inventoryPolicy?: string | null;
};

function sortBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

export function canonicalizeOfflineSalePayload(input: OfflineSaleHashInput): string {
  const lines = sortBy(input.lines ?? [], (line) => `${line.productId}:${line.unitId}`).map((line) => ({
    productId: String(line.productId ?? ''),
    unitId: String(line.unitId ?? ''),
    qtyInUnit: Math.floor(Number(line.qtyInUnit) || 0),
    qtyBase: line.qtyBase != null ? Math.round(Number(line.qtyBase)) : null,
    unitPricePence: line.unitPricePence != null ? Math.round(Number(line.unitPricePence)) : null,
    lineSubtotalPence: line.lineSubtotalPence != null ? Math.round(Number(line.lineSubtotalPence)) : null,
    discountType: String(line.discountType ?? 'NONE'),
    discountValue: String(line.discountValue ?? ''),
  }));

  const payments = sortBy(input.payments ?? [], (payment) => `${payment.method}:${payment.amountPence}`).map(
    (payment) => ({
      method: String(payment.method ?? ''),
      amountPence: Math.round(Number(payment.amountPence) || 0),
    }),
  );

  return JSON.stringify({
    businessId: String(input.businessId ?? ''),
    storeId: String(input.storeId ?? ''),
    tillId: String(input.tillId ?? ''),
    shiftId: input.shiftId ?? null,
    cashierUserId: input.cashierUserId ?? null,
    customerId: input.customerId ?? null,
    paymentStatus: String(input.paymentStatus ?? ''),
    lines,
    payments,
    orderDiscountType: String(input.orderDiscountType ?? 'NONE'),
    orderDiscountValue: String(input.orderDiscountValue ?? ''),
    inventoryPolicy: input.inventoryPolicy ?? 'enforce',
  });
}

function hexFromBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return hexFromBuffer(digest);
  }

  const { createHash } = await import('crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function hashOfflineSalePayload(input: OfflineSaleHashInput): Promise<string> {
  return sha256Hex(canonicalizeOfflineSalePayload(input));
}

export function invoiceCaptureFingerprint(input: {
  storeId: string;
  tillId: string;
  cashierUserId?: string | null;
  customerId?: string | null;
  lines: Array<{
    productId: string;
    unitId: string;
    qtyInUnit: number;
    unitPricePence?: number | null;
    lineSubtotalPence?: number | null;
  }>;
  payments: Array<{ method: string; amountPence: number }>;
}): string {
  return JSON.stringify({
    storeId: input.storeId,
    tillId: input.tillId,
    cashierUserId: input.cashierUserId ?? null,
    customerId: input.customerId ?? null,
    lines: sortBy(input.lines, (line) => `${line.productId}:${line.unitId}`).map((line) => ({
      productId: line.productId,
      unitId: line.unitId,
      qtyInUnit: Math.floor(Number(line.qtyInUnit) || 0),
      unitPricePence: line.unitPricePence != null ? Math.round(Number(line.unitPricePence)) : null,
      lineSubtotalPence: line.lineSubtotalPence != null ? Math.round(Number(line.lineSubtotalPence)) : null,
    })),
    payments: sortBy(input.payments, (payment) => `${payment.method}:${payment.amountPence}`).map((payment) => ({
      method: payment.method,
      amountPence: Math.round(Number(payment.amountPence) || 0),
    })),
  });
}

/** Replay identity: product/qty/tenders only. Server-filled prices must not break exact replay. */
export function offlineReplayIdentityFingerprint(input: {
  storeId: string;
  tillId: string;
  cashierUserId?: string | null;
  customerId?: string | null;
  lines: Array<{ productId: string; unitId: string; qtyInUnit: number }>;
  payments: Array<{ method: string; amountPence: number }>;
}): string {
  return JSON.stringify({
    storeId: input.storeId,
    tillId: input.tillId,
    cashierUserId: input.cashierUserId ?? null,
    customerId: input.customerId ?? null,
    lines: sortBy(input.lines, (line) => `${line.productId}:${line.unitId}`).map((line) => ({
      productId: line.productId,
      unitId: line.unitId,
      qtyInUnit: Math.floor(Number(line.qtyInUnit) || 0),
    })),
    payments: sortBy(input.payments, (payment) => `${payment.method}:${payment.amountPence}`).map((payment) => ({
      method: payment.method,
      amountPence: Math.round(Number(payment.amountPence) || 0),
    })),
  });
}
