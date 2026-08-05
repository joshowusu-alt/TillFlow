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
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import { UserError } from '@/lib/action-utils';
import type { Role } from '@/lib/auth';

const SUPPLIER_PAYMENT_ROLES: readonly Role[] = ['OWNER', 'MANAGER'];

export const SUPPLIER_PAYMENT_ERROR = {
  FORBIDDEN: 'FORBIDDEN',
  IDEMPOTENCY_REQUIRED: 'IDEMPOTENCY_REQUIRED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
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
};

export type RecordSupplierPaymentResult = {
  invoice: Awaited<ReturnType<typeof loadPurchaseInvoiceWithPayments>>;
  replayed: boolean;
};

function assertCanRecordSupplierPayment(actorRole: string | undefined) {
  if (!actorRole || !SUPPLIER_PAYMENT_ROLES.includes(actorRole as Role)) {
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.FORBIDDEN,
      'You do not have permission to record supplier payments.',
    );
  }
}

function normalizeIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? '';
  if (!key) {
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_REQUIRED,
      'Idempotency key is required.',
    );
  }
  if (key.length > 128) {
    throw new SupplierPaymentError(
      SUPPLIER_PAYMENT_ERROR.IDEMPOTENCY_REQUIRED,
      'Idempotency key is invalid.',
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

/**
 * Record additional payment(s) against an existing sales invoice.
 */
export async function recordCustomerPayment(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[],
  actorUserId?: string
) {
  return measureServerOperation(
    'action.customer-receipt.record',
    () => recordCustomerPaymentImpl(businessId, invoiceId, payments, actorUserId),
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
  actorUserId?: string
) {
  const invoiceBase = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, totalPence: true, tillId: true, storeId: true, shiftId: true, cashierUserId: true },
  });
  if (!invoiceBase) throw new Error('Invoice not found');

  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) return prisma.salesInvoice.findFirst({ where: { id: invoiceId }, include: { payments: true } });

  const split = splitPayments(newPayments);
  const updated = await prisma.$transaction(async (tx) => {
    // Re-read payments inside the transaction to prevent concurrent overpayment.
    const invoice = await tx.salesInvoice.findFirst({
      where: { id: invoiceId, businessId },
      include: { payments: true },
    });
    if (!invoice) throw new Error('Invoice not found');

    const previouslyPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
    const newPaid = newPayments.reduce((s, p) => s + p.amountPence, 0);
    const totalPaid = previouslyPaid + newPaid;
    if (totalPaid > invoice.totalPence) throw new Error('Payment exceeds outstanding balance');

    const status = derivePaymentStatus(invoice.totalPence, totalPaid);

    await tx.salesPayment.createMany({
      data: newPayments.map((p) => ({
        salesInvoiceId: invoice.id,
        method: p.method,
        amountPence: p.amountPence,
        reference: p.reference ?? null
      }))
    });

    if (split.cashPence > 0) {
      if (!actorUserId) {
        throw new Error('Open shift is required before recording cash customer payments.');
      }

      const openShift = await getOpenCashShiftForPayment(tx, {
        businessId,
        storeId: invoice.storeId,
        userId: actorUserId,
        fallbackTillId: invoice.tillId,
      });
      if (!openShift) {
        throw new Error('Open shift is required before recording cash customer payments.');
      }

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

    const updatedInvoice = await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { paymentStatus: status },
      include: { payments: true }
    });

    await postJournalEntry({
      businessId,
      description: `Customer receipt ${invoice.id}`,
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: invoice.id,
      lines: [
        ...debitCashBankLines(split),
        { accountCode: ACCOUNT_CODES.ar, creditPence: split.totalPence }
      ].filter(Boolean) as JournalLine[],
      prismaClient: tx as any
    });

    return updatedInvoice;
  });

  return updated;
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

      const previouslyPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
      const newPaid = newPayments.reduce((s, p) => s + p.amountPence, 0);
      const totalPaid = previouslyPaid + newPaid;
      if (totalPaid > invoice.totalPence) throw new Error('Payment exceeds outstanding balance');

      const status = derivePaymentStatus(invoice.totalPence, totalPaid);

      const openShift = split.cashPence > 0
        ? await getOpenCashShiftForPayment(tx, {
            businessId,
            storeId: invoice.storeId,
            userId: recordedByUserId,
          })
        : null;

      if (split.cashPence > 0 && !openShift) {
        throw new Error('Open shift is required before recording cash supplier payments.');
      }

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
