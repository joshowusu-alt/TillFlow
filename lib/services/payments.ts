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

/**
 * Record additional payment(s) against an existing sales invoice.
 */
export async function recordCustomerPayment(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[]
) {
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { payments: true }
  });
  if (!invoice) throw new Error('Invoice not found');

  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) return invoice;

  const previouslyPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
  const newPaid = newPayments.reduce((s, p) => s + p.amountPence, 0);
  const totalPaid = previouslyPaid + newPaid;
  if (totalPaid > invoice.totalPence) throw new Error('Payment exceeds outstanding balance');

  const status = derivePaymentStatus(invoice.totalPence, totalPaid);
  const split = splitPayments(newPayments);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.salesPayment.createMany({
      data: newPayments.map((p) => ({
        salesInvoiceId: invoice.id,
        method: p.method,
        amountPence: p.amountPence,
        reference: p.reference ?? null
      }))
    });

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
  payments: PaymentInput[]
) {
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { payments: true }
  });
  if (!invoice) throw new Error('Invoice not found');

  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) return invoice;

  const previouslyPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
  const newPaid = newPayments.reduce((s, p) => s + p.amountPence, 0);
  const totalPaid = previouslyPaid + newPaid;
  if (totalPaid > invoice.totalPence) throw new Error('Payment exceeds outstanding balance');

  const status = derivePaymentStatus(invoice.totalPence, totalPaid);
  const split = splitPayments(newPayments);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.purchasePayment.createMany({
      data: newPayments.map((p) => ({
        purchaseInvoiceId: invoice.id,
        method: p.method,
        amountPence: p.amountPence,
        reference: p.reference ?? null
      }))
    });

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
