import { createHash } from 'crypto';
import { UserError } from '@/lib/action-utils';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';

export const MONEY_IDEMPOTENCY_ERROR = {
  IDEMPOTENCY_REQUIRED: 'IDEMPOTENCY_REQUIRED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
} as const;

export class MoneyIdempotencyError extends UserError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'MoneyIdempotencyError';
  }
}

export type MoneyCommandKind =
  | 'CUSTOMER_RECEIPT'
  | 'EXPENSE_PAYMENT'
  | 'EXPENSE_CREATE'
  | 'PURCHASE_CREATE';

export type MoneyIdempotencyRow = {
  id: string;
  businessId: string;
  key: string;
  payloadHash: string;
  commandKind: string;
  resultJson: string;
};

const STALE_CLIENT_IDEMPOTENCY_MESSAGE =
  'This payment form is out of date. Refresh the page or reopen the payment form, then try again.';

export function normalizeMoneyIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? '';
  if (!key) {
    throw new MoneyIdempotencyError(
      MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_REQUIRED,
      STALE_CLIENT_IDEMPOTENCY_MESSAGE,
    );
  }
  if (key.length > 128 || /[\u0000-\u001f]/.test(key)) {
    throw new MoneyIdempotencyError(
      MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_REQUIRED,
      STALE_CLIENT_IDEMPOTENCY_MESSAGE,
    );
  }
  return key;
}

export function hashCanonicalParts(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0'), 'utf8').digest('hex');
}

export function paymentCanon(
  payments: Array<{ method: string; amountPence: number; reference?: string | null }>,
): string {
  return payments.map((p) => `${p.method}:${p.amountPence}:${p.reference ?? ''}`).join('|');
}

export function buildCustomerPaymentPayloadHash(parts: {
  businessId: string;
  invoiceId: string;
  payments: Array<{ method: string; amountPence: number; reference?: string | null }>;
  recordedByUserId: string;
}): string {
  return hashCanonicalParts([
    parts.businessId,
    'CUSTOMER_RECEIPT',
    parts.invoiceId,
    paymentCanon(parts.payments),
    parts.recordedByUserId,
  ]);
}

export function buildExpensePaymentPayloadHash(parts: {
  businessId: string;
  expenseId: string;
  method: string;
  amountPence: number;
  reference: string;
  userId: string;
}): string {
  return hashCanonicalParts([
    parts.businessId,
    'EXPENSE_PAYMENT',
    parts.expenseId,
    parts.method,
    String(parts.amountPence),
    parts.reference,
    parts.userId,
  ]);
}

export function buildExpenseCreatePayloadHash(parts: {
  businessId: string;
  storeId: string;
  accountId: string;
  amountPence: number;
  amountPaidPence: number;
  method: string;
  vendorName: string;
  reference: string;
  userId: string;
}): string {
  return hashCanonicalParts([
    parts.businessId,
    'EXPENSE_CREATE',
    parts.storeId,
    parts.accountId,
    String(parts.amountPence),
    String(parts.amountPaidPence),
    parts.method,
    parts.vendorName,
    parts.reference,
    parts.userId,
  ]);
}

export function buildPurchaseCreatePayloadHash(parts: {
  businessId: string;
  storeId: string;
  supplierId: string;
  payments: Array<{ method: string; amountPence: number; reference?: string | null }>;
  lines: Array<{ productId: string; unitId: string; qtyInUnit: number; unitCostPence?: number | null }>;
  userId: string;
}): string {
  const lineCanon = parts.lines
    .map((l) => `${l.productId}:${l.unitId}:${l.qtyInUnit}:${l.unitCostPence ?? ''}`)
    .join('|');
  return hashCanonicalParts([
    parts.businessId,
    'PURCHASE_CREATE',
    parts.storeId,
    parts.supplierId,
    paymentCanon(parts.payments),
    lineCanon,
    parts.userId,
  ]);
}

export function isPrismaUniqueConstraintOn(error: unknown, fields: string[]): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (!target) return false;
  const targets = Array.isArray(target) ? target : [target];
  return fields.every((field) => targets.some((t) => String(t).includes(field)));
}

export function canUseSelectForUpdate(tx: { $queryRaw?: unknown }): boolean {
  return typeof tx?.$queryRaw === 'function' && isPostgresDatabaseUrl(process.env.DATABASE_URL);
}

export async function lockSalesInvoiceForUpdate(
  tx: { $queryRaw: (query: unknown, ...values: unknown[]) => Promise<unknown> },
  businessId: string,
  invoiceId: string,
) {
  if (!canUseSelectForUpdate(tx)) return;
  await tx.$queryRaw`
    SELECT id FROM "SalesInvoice"
    WHERE id = ${invoiceId} AND "businessId" = ${businessId}
    FOR UPDATE
  `;
}

export async function lockPurchaseInvoiceForUpdate(
  tx: { $queryRaw: (query: unknown, ...values: unknown[]) => Promise<unknown> },
  businessId: string,
  invoiceId: string,
) {
  if (!canUseSelectForUpdate(tx)) return;
  await tx.$queryRaw`
    SELECT id FROM "PurchaseInvoice"
    WHERE id = ${invoiceId} AND "businessId" = ${businessId}
    FOR UPDATE
  `;
}

export async function lockExpenseForUpdate(
  tx: { $queryRaw: (query: unknown, ...values: unknown[]) => Promise<unknown> },
  businessId: string,
  expenseId: string,
) {
  if (!canUseSelectForUpdate(tx)) return;
  await tx.$queryRaw`
    SELECT id FROM "Expense"
    WHERE id = ${expenseId} AND "businessId" = ${businessId}
    FOR UPDATE
  `;
}

export async function findMoneyIdempotency(
  tx: { moneyIdempotency: { findUnique: (args: unknown) => Promise<MoneyIdempotencyRow | null> } },
  businessId: string,
  key: string,
): Promise<MoneyIdempotencyRow | null> {
  return tx.moneyIdempotency.findUnique({
    where: { businessId_key: { businessId, key } },
  });
}

export async function insertMoneyIdempotency(
  tx: { moneyIdempotency: { create: (args: unknown) => Promise<MoneyIdempotencyRow> } },
  input: {
    businessId: string;
    key: string;
    payloadHash: string;
    commandKind: MoneyCommandKind;
    resultJson: string;
  },
) {
  return tx.moneyIdempotency.create({
    data: {
      businessId: input.businessId,
      key: input.key,
      payloadHash: input.payloadHash,
      commandKind: input.commandKind,
      resultJson: input.resultJson,
    },
  });
}

export function replayOrConflict(
  existing: MoneyIdempotencyRow,
  expected: { payloadHash: string; commandKind: MoneyCommandKind; entityId?: string; entityIdKey?: string },
): 'replay' {
  let entityMatches = true;
  if (expected.entityId && expected.entityIdKey) {
    try {
      const parsed = JSON.parse(existing.resultJson) as Record<string, unknown>;
      entityMatches = parsed[expected.entityIdKey] === expected.entityId;
    } catch {
      entityMatches = false;
    }
  }
  if (
    existing.payloadHash === expected.payloadHash &&
    existing.commandKind === expected.commandKind &&
    entityMatches
  ) {
    return 'replay';
  }
  throw new MoneyIdempotencyError(
    MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_CONFLICT,
    'This payment request conflicts with a previous submission.',
  );
}

export function parseIdempotencyResult<T extends Record<string, unknown>>(resultJson: string): T {
  return JSON.parse(resultJson) as T;
}

/**
 * Reject cross-tenant IDs: business → store → till → shift → user.
 * Till/shift are optional (non-cash paths). Shift.userId may differ from the
 * actor when the till's single OPEN shift was opened by another user.
 */
export async function assertMoneyMovementTenantChain(
  tx: {
    store: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
    user: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
    till: { findFirst: (args: unknown) => Promise<{ id: string; storeId: string } | null> };
    shift: { findFirst: (args: unknown) => Promise<{ id: string; tillId: string } | null> };
  },
  input: {
    businessId: string;
    storeId: string;
    userId?: string | null;
    tillId?: string | null;
    shiftId?: string | null;
  },
) {
  const store = await tx.store.findFirst({
    where: { id: input.storeId, businessId: input.businessId },
    select: { id: true },
  });
  if (!store) {
    throw new MoneyIdempotencyError(
      MONEY_IDEMPOTENCY_ERROR.TENANT_MISMATCH,
      'Store does not belong to this business.',
    );
  }

  if (input.userId) {
    const user = await tx.user.findFirst({
      where: { id: input.userId, businessId: input.businessId },
      select: { id: true },
    });
    if (!user) {
      throw new MoneyIdempotencyError(
        MONEY_IDEMPOTENCY_ERROR.TENANT_MISMATCH,
        'User does not belong to this business.',
      );
    }
  }

  if (input.tillId) {
    const till = await tx.till.findFirst({
      where: { id: input.tillId, storeId: store.id },
      select: { id: true, storeId: true },
    });
    if (!till) {
      throw new MoneyIdempotencyError(
        MONEY_IDEMPOTENCY_ERROR.TENANT_MISMATCH,
        'Till does not belong to this store.',
      );
    }
  }

  if (input.shiftId) {
    const shift = await tx.shift.findFirst({
      where: {
        id: input.shiftId,
        till: { storeId: store.id, store: { businessId: input.businessId } },
      },
      select: { id: true, tillId: true },
    });
    if (!shift) {
      throw new MoneyIdempotencyError(
        MONEY_IDEMPOTENCY_ERROR.TENANT_MISMATCH,
        'Shift does not belong to this business.',
      );
    }
    if (input.tillId && shift.tillId !== input.tillId) {
      throw new MoneyIdempotencyError(
        MONEY_IDEMPOTENCY_ERROR.TENANT_MISMATCH,
        'Shift does not belong to this till.',
      );
    }
  }
}

export function sumAmountPence(rows: Array<{ amountPence: number }>): number {
  return rows.reduce((sum, row) => sum + row.amountPence, 0);
}
