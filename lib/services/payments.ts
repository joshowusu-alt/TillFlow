import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import {
  type PaymentInput,
  filterPositivePayments,
  splitPayments,
  derivePaymentStatus,
  debitCashBankLines,
  type JournalLine
} from './shared';
import {
  EXPLICIT_CASH_TILL_REQUIRED_MSG,
  getOpenCashShiftForPayment,
  recordCashDrawerEntryTx,
} from './cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import { UserError } from '@/lib/action-utils';
import type { Role } from '@/lib/auth';
import { RECEIPT_ORIGIN } from '@/lib/payments/receipt-origin';
import {
  assertMoneyMovementTenantChain,
  buildCustomerPaymentPayloadHash,
  findMoneyIdempotency,
  insertMoneyIdempotency,
  isPrismaUniqueConstraintOn as isMoneyUniqueConstraintOn,
  lockPurchaseInvoiceForUpdate,
  lockSalesInvoiceForUpdate,
  MoneyIdempotencyError,
  MONEY_IDEMPOTENCY_ERROR,
  normalizeMoneyIdempotencyKey,
  replayOrConflict,
  sumAmountPence,
} from './money-idempotency';

const SUPPLIER_PAYMENT_ROLES: readonly Role[] = ['OWNER', 'MANAGER'];

export const SUPPLIER_PAYMENT_ERROR = {
  FORBIDDEN: 'FORBIDDEN',
  IDEMPOTENCY_REQUIRED: 'IDEMPOTENCY_REQUIRED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  TEMPORARILY_UNAVAILABLE: 'TEMPORARILY_UNAVAILABLE',
} as const;

export class SupplierPaymentError extends UserError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SupplierPaymentError';
  }
}

export type RecordSupplierPaymentOptions = {
  paidAt?: Date;
  recordedByUserId: string;
  actorRole: string;
  actorName?: string | null;
  notes?: string;
  idempotencyKey: string;
  /** Required when any payment line is CASH. */
  tillId?: string | null;
  shiftId?: string | null;
};

export type RecordSupplierPaymentResult = {
  invoice: Awaited<ReturnType<typeof loadPurchaseInvoiceWithPayments>>;
  replayed: boolean;
};

export type RecordCustomerPaymentOptions = {
  idempotencyKey: string;
};

/** Rollout freeze: set TILLFLOW_SUPPLIER_PAYMENT_WRITES=0 during mixed-version cutover. */
export function assertSupplierPaymentWritesEnabled() {
  if (process.env.TILLFLOW_SUPPLIER_PAYMENT_WRITES === '0') {
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.TEMPORARILY_UNAVAILABLE,
      'Supplier payments are temporarily unavailable during a system update. Refresh the page and try again in a moment.',
    );
  }
}

function assertCanRecordSupplierPayment(actorRole: string | undefined) {
  if (!actorRole || !SUPPLIER_PAYMENT_ROLES.includes(actorRole as Role)) {
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.FORBIDDEN,
      'You do not have permission to record supplier payments.',
    );
  }
}

const STALE_CLIENT_IDEMPOTENCY_MESSAGE =
  'This payment form is out of date. Refresh the page or reopen the payment form, then try again.';

function normalizeIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? '';
  if (!key) {
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_REQUIRED,
      STALE_CLIENT_IDEMPOTENCY_MESSAGE,
    );
  }
  if (key.length > 128 || /[\u0000-\u001f]/.test(key)) {
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_REQUIRED,
      STALE_CLIENT_IDEMPOTENCY_MESSAGE,
    );
  }
  return key;
}

/** Canonical hash binding business, invoice, amounts, methods, funding, and payment date. */
export function buildSupplierPaymentPayloadHash(parts: {
  businessId: string;
  invoiceId: string;
  payments: Array<{ method: string; amountPence: number; reference?: string | null }>;
  paidAtIso: string;
  notes: string;
  recordedByUserId: string;
}): string {
  const paymentCanon = parts.payments
    .map((p) => `${p.method}:${p.amountPence}:${p.reference ?? ''}`)
    .join('|');
  const canonical = [
    parts.businessId,
    'SUPPLIER_PAYMENT',
    parts.invoiceId,
    paymentCanon,
    parts.paidAtIso,
    parts.notes,
    parts.recordedByUserId,
  ].join('\0');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function isPrismaUniqueConstraintOn(error: unknown, fields: string[]): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; meta?: { target?: string[] | string } };
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (!target) return false;
  const targets = Array.isArray(target) ? target : [target];
  return fields.every((field) => targets.some((t) => String(t).includes(field)));
}

async function loadPurchaseInvoiceWithPayments(businessId: string, invoiceId: string, tx: typeof prisma | any = prisma) {
  return tx.purchaseInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { payments: true },
  });
}

async function findByIdempotencyKey(businessId: string, idempotencyKey: string, tx: typeof prisma | any = prisma) {
  return tx.purchasePayment.findUnique({
    where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
    select: {
      id: true,
      businessId: true,
      purchaseInvoiceId: true,
      payloadHash: true,
      amountPence: true,
      method: true,
    },
  });
}

async function loadSalesInvoiceWithPayments(businessId: string, invoiceId: string, tx: typeof prisma | any = prisma) {
  return tx.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { payments: true },
  });
}

/**
 * Record additional payment(s) against an existing sales invoice.
 */
export async function recordCustomerPayment(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[],
  actorUserId?: string,
  options?: RecordCustomerPaymentOptions,
) {
  return measureServerOperation(
    'action.customer-receipt.record',
    () => recordCustomerPaymentImpl(businessId, invoiceId, payments, actorUserId, options),
    {
      businessId,
      action: 'recordCustomerPaymentAction',
      rowCount: payments.length,
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function recordCustomerPaymentImpl(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[],
  actorUserId?: string,
  options?: RecordCustomerPaymentOptions,
) {
  const idempotencyKey = normalizeMoneyIdempotencyKey(options?.idempotencyKey);
  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) {
    return loadSalesInvoiceWithPayments(businessId, invoiceId);
  }

  const payloadHash = buildCustomerPaymentPayloadHash({
    businessId,
    invoiceId,
    payments: newPayments.map((p) => ({
      method: p.method,
      amountPence: p.amountPence,
      reference: p.reference ?? null,
    })),
    recordedByUserId: actorUserId ?? '',
  });

  const existing = await findMoneyIdempotency(prisma as any, businessId, idempotencyKey);
  if (existing) {
    replayOrConflict(existing, {
      payloadHash,
      commandKind: 'CUSTOMER_RECEIPT',
      entityId: invoiceId,
      entityIdKey: 'invoiceId',
    });
    const invoice = await loadSalesInvoiceWithPayments(businessId, invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    return invoice;
  }

  const invoiceBase = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, totalPence: true, tillId: true, storeId: true, shiftId: true, cashierUserId: true },
  });
  if (!invoiceBase) throw new Error('Invoice not found');

  const split = splitPayments(newPayments);

  try {
    return await prisma.$transaction(async (tx) => {
      const existingInTx = await findMoneyIdempotency(tx as any, businessId, idempotencyKey);
      if (existingInTx) {
        replayOrConflict(existingInTx, {
          payloadHash,
          commandKind: 'CUSTOMER_RECEIPT',
          entityId: invoiceId,
          entityIdKey: 'invoiceId',
        });
        const replayed = await loadSalesInvoiceWithPayments(businessId, invoiceId, tx);
        if (!replayed) throw new Error('Invoice not found');
        return replayed;
      }

      await lockSalesInvoiceForUpdate(tx as any, businessId, invoiceId);

      const invoice = await tx.salesInvoice.findFirst({
        where: { id: invoiceId, businessId },
        include: { payments: true },
      });
      if (!invoice) throw new Error('Invoice not found');

      const previouslyPaid = sumAmountPence(invoice.payments);
      const newPaid = sumAmountPence(newPayments);
      if (previouslyPaid + newPaid > invoice.totalPence) {
        throw new Error('Payment exceeds outstanding balance');
      }

      let openShift: { id: string; tillId: string } | null = null;
      if (split.cashPence > 0) {
        if (!actorUserId) {
          throw new Error('Open shift is required before recording cash customer payments.');
        }
        openShift = await getOpenCashShiftForPayment(tx, {
          businessId,
          storeId: invoice.storeId,
          userId: actorUserId,
          fallbackTillId: invoice.tillId,
        });
        if (!openShift) {
          throw new Error('Open shift is required before recording cash customer payments.');
        }
      }

      await assertMoneyMovementTenantChain(tx as any, {
        businessId,
        storeId: invoice.storeId,
        userId: actorUserId,
        tillId: openShift?.tillId,
        shiftId: openShift?.id,
      });

      await tx.salesPayment.createMany({
        data: newPayments.map((p) => ({
          salesInvoiceId: invoice.id,
          method: p.method,
          amountPence: p.amountPence,
          reference: p.reference ?? null,
          receiptOrigin: RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION,
        })),
      });

      if (openShift && actorUserId) {
        await recordCashDrawerEntryTx(tx, {
          businessId,
          storeId: invoice.storeId,
          tillId: openShift.tillId,
          shiftId: openShift.id,
          createdByUserId: actorUserId,
          cashierUserId: actorUserId,
          entryType: 'CASH_DEBTOR_PAYMENT',
          amountPence: split.cashPence,
          reasonCode: 'CUSTOMER_RECEIPT',
          reason: 'Cash received against outstanding invoice',
          referenceType: 'SALES_INVOICE',
          referenceId: invoice.id,
        });
      }

      const persisted = await tx.salesPayment.findMany({
        where: { salesInvoiceId: invoice.id },
        select: { id: true, amountPence: true },
      });
      const totalPaid = sumAmountPence(persisted);
      if (totalPaid > invoice.totalPence) {
        throw new Error('Payment exceeds outstanding balance');
      }
      const status = derivePaymentStatus(invoice.totalPence, totalPaid);

      const updatedInvoice = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { paymentStatus: status },
        include: { payments: true },
      });

      await postJournalEntry({
        businessId,
        description: `Customer receipt ${invoice.id}`,
        referenceType: 'CUSTOMER_RECEIPT',
        referenceId: invoice.id,
        lines: [
          ...debitCashBankLines(split),
          { accountCode: ACCOUNT_CODES.ar, creditPence: split.totalPence },
        ].filter(Boolean) as JournalLine[],
        prismaClient: tx as any,
      });

      await insertMoneyIdempotency(tx as any, {
        businessId,
        key: idempotencyKey,
        payloadHash,
        commandKind: 'CUSTOMER_RECEIPT',
        resultJson: JSON.stringify({ invoiceId: invoice.id }),
      });

      return updatedInvoice;
    });
  } catch (error) {
    if (isMoneyUniqueConstraintOn(error, ['businessId', 'key'])) {
      const winner = await findMoneyIdempotency(prisma as any, businessId, idempotencyKey);
      if (winner) {
        replayOrConflict(winner, {
          payloadHash,
          commandKind: 'CUSTOMER_RECEIPT',
          entityId: invoiceId,
          entityIdKey: 'invoiceId',
        });
        const invoice = await loadSalesInvoiceWithPayments(businessId, invoiceId);
        if (!invoice) throw new Error('Invoice not found');
        return invoice;
      }
      throw new MoneyIdempotencyError(
        MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_CONFLICT,
        'This payment request conflicts with a previous submission.',
      );
    }
    throw error;
  }
}

/**
 * Record additional payment(s) against an existing purchase invoice.
 * Owner/Manager only. Durable idempotency covers payment, allocation, drawer, journal, and audit.
 */
export async function recordSupplierPayment(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[],
  options: RecordSupplierPaymentOptions,
): Promise<RecordSupplierPaymentResult> {
  return measureServerOperation(
    'action.supplier-payment.record',
    () => recordSupplierPaymentImpl(businessId, invoiceId, payments, options),
    {
      businessId,
      action: 'recordSupplierPaymentAction',
      rowCount: payments.length,
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function recordSupplierPaymentImpl(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[],
  options: RecordSupplierPaymentOptions,
): Promise<RecordSupplierPaymentResult> {
  assertSupplierPaymentWritesEnabled();
  assertCanRecordSupplierPayment(options.actorRole);
  const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
  const recordedByUserId = options.recordedByUserId;
  if (!recordedByUserId) {
    throw new SupplierPaymentError(SUPPLIER_PAYMENT_ERROR.FORBIDDEN, 'You do not have permission to record supplier payments.');
  }

  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) {
    const invoice = await loadPurchaseInvoiceWithPayments(businessId, invoiceId);
    if (!invoice) {
      throw new SupplierPaymentError(SUPPLIER_PAYMENT_ERROR.NOT_FOUND, 'Invoice not found');
    }
    return { invoice, replayed: false };
  }

  const paidAt = options.paidAt;
  const notes = options.notes?.trim() || '';
  const paidAtIso = paidAt ? paidAt.toISOString().slice(0, 10) : '';
  const payloadHash = buildSupplierPaymentPayloadHash({
    businessId,
    invoiceId,
    payments: newPayments.map((p) => ({
      method: p.method,
      amountPence: p.amountPence,
      reference: p.reference ?? null,
    })),
    paidAtIso,
    notes,
    recordedByUserId,
  });

  const existing = await findByIdempotencyKey(businessId, idempotencyKey);
  if (existing) {
    if (existing.payloadHash === payloadHash && existing.purchaseInvoiceId === invoiceId) {
      const invoice = await loadPurchaseInvoiceWithPayments(businessId, invoiceId);
      if (!invoice) {
        throw new SupplierPaymentError(SUPPLIER_PAYMENT_ERROR.NOT_FOUND, 'Invoice not found');
      }
      return { invoice, replayed: true };
    }
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_CONFLICT,
      'This payment request conflicts with a previous submission.',
    );
  }

  const invoiceBase = await prisma.purchaseInvoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, totalPence: true, storeId: true },
  });
  if (!invoiceBase) {
    throw new SupplierPaymentError(SUPPLIER_PAYMENT_ERROR.NOT_FOUND, 'Invoice not found');
  }

  const split = splitPayments(newPayments);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Re-check idempotency inside the transaction for concurrent races.
      const existingInTx = await findByIdempotencyKey(businessId, idempotencyKey, tx);
      if (existingInTx) {
        if (existingInTx.payloadHash === payloadHash && existingInTx.purchaseInvoiceId === invoiceId) {
          const invoice = await loadPurchaseInvoiceWithPayments(businessId, invoiceId, tx);
          if (!invoice) {
            throw new SupplierPaymentError(SUPPLIER_PAYMENT_ERROR.NOT_FOUND, 'Invoice not found');
          }
          return { invoice, replayed: true as const };
        }
        throw new SupplierPaymentError(
          SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_CONFLICT,
          'This payment request conflicts with a previous submission.',
        );
      }

      await lockPurchaseInvoiceForUpdate(tx as any, businessId, invoiceId);

      const invoice = await tx.purchaseInvoice.findFirst({
        where: { id: invoiceId, businessId },
        include: {
          payments: true,
          supplier: { select: { id: true, name: true } },
        },
      });
      if (!invoice) {
        throw new SupplierPaymentError(SUPPLIER_PAYMENT_ERROR.NOT_FOUND, 'Invoice not found');
      }

      const previouslyPaid = sumAmountPence(invoice.payments);
      const newPaid = sumAmountPence(newPayments);
      if (previouslyPaid + newPaid > invoice.totalPence) {
        throw new Error('Payment exceeds outstanding balance');
      }

      let openShift: { id: string; tillId: string } | null = null;
      if (split.cashPence > 0) {
        if (!options.tillId) {
          throw new Error(EXPLICIT_CASH_TILL_REQUIRED_MSG);
        }
        openShift = await getOpenCashShiftForPayment(tx, {
          businessId,
          storeId: invoice.storeId,
          tillId: options.tillId,
          shiftId: options.shiftId,
        });
        if (!openShift) {
          throw new Error('Open shift is required before recording cash supplier payments.');
        }
      }

      await assertMoneyMovementTenantChain(tx as any, {
        businessId,
        storeId: invoice.storeId,
        userId: recordedByUserId,
        tillId: openShift?.tillId,
        shiftId: openShift?.id,
      });

      const createdPayments = [];
      for (let i = 0; i < newPayments.length; i++) {
        const p = newPayments[i]!;
        const createdPayment = await tx.purchasePayment.create({
          data: {
            businessId,
            purchaseInvoiceId: invoice.id,
            method: p.method,
            amountPence: p.amountPence,
            reference: p.reference ?? null,
            ...(paidAt ? { paidAt } : {}),
            recordedByUserId,
            ...(notes ? { notes } : {}),
            // Bind the durable key to the first payment row of this economic event.
            ...(i === 0
              ? { idempotencyKey, payloadHash }
              : {}),
          },
        });
        createdPayments.push(createdPayment);
      }

      if (openShift) {
        for (const payment of createdPayments.filter((p) => p.method === 'CASH' && p.amountPence > 0)) {
          await recordCashDrawerEntryTx(tx, {
            businessId,
            storeId: invoice.storeId,
            tillId: openShift.tillId,
            shiftId: openShift.id,
            createdByUserId: recordedByUserId,
            cashierUserId: recordedByUserId,
            entryType: 'PAID_OUT_SUPPLIER',
            amountPence: -payment.amountPence,
            reasonCode: 'SUPPLIER_PAYMENT',
            reason: invoice.supplier?.name
              ? `Cash paid to supplier: ${invoice.supplier.name}`
              : 'Cash paid to supplier',
            referenceType: 'PURCHASE_PAYMENT',
            referenceId: payment.id,
            actor: {
              userId: recordedByUserId,
              userName: options.actorName ?? 'Unknown',
              userRole: options.actorRole,
            },
          });
        }
      }

      const persisted = await tx.purchasePayment.findMany({
        where: { purchaseInvoiceId: invoice.id },
        select: { amountPence: true },
      });
      const totalPaid = sumAmountPence(persisted);
      if (totalPaid > invoice.totalPence) {
        throw new Error('Payment exceeds outstanding balance');
      }
      const status = derivePaymentStatus(invoice.totalPence, totalPaid);

      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { paymentStatus: status },
        include: { payments: true }
      });

      await postJournalEntry({
        businessId,
        description: `Supplier payment ${invoice.id}`,
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: invoice.id,
        lines: [
          { accountCode: ACCOUNT_CODES.ap, debitPence: split.totalPence },
          ...(split.cashPence > 0 ? [{ accountCode: ACCOUNT_CODES.cash, creditPence: split.cashPence }] : []),
          ...(split.bankPence > 0 ? [{ accountCode: ACCOUNT_CODES.bank, creditPence: split.bankPence }] : [])
        ],
        prismaClient: tx as any
      });

      const primaryPayment = createdPayments[0]!;
      await tx.auditLog.create({
        data: {
          businessId,
          userId: recordedByUserId,
          userName: options.actorName ?? 'Unknown',
          userRole: options.actorRole,
          action: 'SUPPLIER_PAYMENT',
          entity: 'PurchasePayment',
          entityId: primaryPayment.id,
          beforeState: null,
          afterState: JSON.stringify({
            purchaseInvoiceId: invoice.id,
            amountPence: split.totalPence,
            methods: newPayments.map((p) => p.method),
            idempotencyKey,
            payloadHash,
            cashDrawer: Boolean(openShift && split.cashPence > 0),
          }),
          reason: notes || null,
          details: JSON.stringify({
            purchaseInvoiceId: invoice.id,
            supplierId: invoice.supplier?.id ?? null,
            paymentIds: createdPayments.map((p) => p.id),
            replayed: false,
          }),
          branchId: null,
          actionType: 'PAYMENT',
          entityType: 'PURCHASE_PAYMENT',
        },
      });

      return { invoice: updatedInvoice, replayed: false as const };
    });

    return updated;
  } catch (error) {
    if (isPrismaUniqueConstraintOn(error, ['businessId', 'idempotencyKey'])) {
      const winner = await findByIdempotencyKey(businessId, idempotencyKey);
      if (winner && winner.payloadHash === payloadHash && winner.purchaseInvoiceId === invoiceId) {
        const invoice = await loadPurchaseInvoiceWithPayments(businessId, invoiceId);
        if (!invoice) {
          throw new SupplierPaymentError(SUPPLIER_PAYMENT_ERROR.NOT_FOUND, 'Invoice not found');
        }
        return { invoice, replayed: true };
      }
      throw new SupplierPaymentError(
        SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_CONFLICT,
        'This payment request conflicts with a previous submission.',
      );
    }
    throw error;
  }
}
