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
import { getOpenShiftForTill, recordCashDrawerEntryTx } from './cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

async function getOpenCashShiftForPayment(
  tx: any,
  input: {
    businessId: string;
    storeId: string;
    userId?: string | null;
    fallbackTillId?: string | null;
  }
) {
  if (input.userId) {
    const userShift = await tx.shift.findFirst({
      where: {
        status: 'OPEN',
        userId: input.userId,
        till: {
          storeId: input.storeId,
          store: { businessId: input.businessId },
        },
      },
      select: { id: true, tillId: true },
      orderBy: { openedAt: 'desc' },
    });
    if (userShift) return userShift;
  }

  if (!input.fallbackTillId) return null;
  const tillShift = await getOpenShiftForTill(input.businessId, input.fallbackTillId, tx);
  return tillShift ? { id: tillShift.id, tillId: tillShift.tillId } : null;
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
 */
export async function recordSupplierPayment(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[],
  paidAt?: Date,
  recordedByUserId?: string,
  notes?: string
) {
  return measureServerOperation(
    'action.supplier-payment.record',
    () => recordSupplierPaymentImpl(businessId, invoiceId, payments, paidAt, recordedByUserId, notes),
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
  paidAt?: Date,
  recordedByUserId?: string,
  notes?: string
) {
  const invoiceBase = await prisma.purchaseInvoice.findFirst({
    where: { id: invoiceId, businessId },
    select: { id: true, totalPence: true, storeId: true },
  });
  if (!invoiceBase) throw new Error('Invoice not found');

  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) return prisma.purchaseInvoice.findFirst({ where: { id: invoiceId }, include: { payments: true } });

  const split = splitPayments(newPayments);
  const updated = await prisma.$transaction(async (tx) => {
    // Re-read payments inside the transaction to prevent concurrent overpayment.
    const invoice = await tx.purchaseInvoice.findFirst({
      where: { id: invoiceId, businessId },
      include: {
        payments: true,
        supplier: { select: { id: true, name: true } },
      },
    });
    if (!invoice) throw new Error('Invoice not found');

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

    if (split.cashPence > 0 && (!recordedByUserId || !openShift)) {
      throw new Error('Open shift is required before recording cash supplier payments.');
    }

    const createdPayments = [];
    for (const p of newPayments) {
      const createdPayment = await tx.purchasePayment.create({
        data: {
          purchaseInvoiceId: invoice.id,
          method: p.method,
          amountPence: p.amountPence,
          reference: p.reference ?? null,
          ...(paidAt ? { paidAt } : {}),
          ...(recordedByUserId ? { recordedByUserId } : {}),
          ...(notes ? { notes } : {}),
        },
      });
      createdPayments.push(createdPayment);
    }

    if (openShift && recordedByUserId) {
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

    return updatedInvoice;
  });

  return updated;
}
