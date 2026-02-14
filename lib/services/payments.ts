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
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true }
  });
  if (!invoice) throw new Error('Invoice not found');

  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) return invoice;

  await prisma.salesPayment.createMany({
    data: newPayments.map((p) => ({
      salesInvoiceId: invoiceId,
      method: p.method,
      amountPence: p.amountPence
    }))
  });

  const previouslyPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
  const newPaid = newPayments.reduce((s, p) => s + p.amountPence, 0);
  const totalPaid = previouslyPaid + newPaid;
  if (totalPaid > invoice.totalPence) throw new Error('Payment exceeds outstanding balance');

  const status = derivePaymentStatus(invoice.totalPence, totalPaid);
  await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { paymentStatus: status } });

  const split = splitPayments(newPayments);
  await postJournalEntry({
    businessId,
    description: `Customer receipt ${invoiceId}`,
    referenceType: 'CUSTOMER_RECEIPT',
    referenceId: invoiceId,
    lines: [
      ...debitCashBankLines(split),
      { accountCode: ACCOUNT_CODES.ar, creditPence: split.totalPence }
    ].filter(Boolean) as JournalLine[]
  });

  return invoice;
}

/**
 * Record additional payment(s) against an existing purchase invoice.
 */
export async function recordSupplierPayment(
  businessId: string,
  invoiceId: string,
  payments: PaymentInput[]
) {
  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true }
  });
  if (!invoice) throw new Error('Invoice not found');

  const newPayments = filterPositivePayments(payments);
  if (newPayments.length === 0) return invoice;

  await prisma.purchasePayment.createMany({
    data: newPayments.map((p) => ({
      purchaseInvoiceId: invoiceId,
      method: p.method,
      amountPence: p.amountPence
    }))
  });

  const previouslyPaid = invoice.payments.reduce((s, p) => s + p.amountPence, 0);
  const newPaid = newPayments.reduce((s, p) => s + p.amountPence, 0);
  const totalPaid = previouslyPaid + newPaid;
  if (totalPaid > invoice.totalPence) throw new Error('Payment exceeds outstanding balance');

  const status = derivePaymentStatus(invoice.totalPence, totalPaid);
  await prisma.purchaseInvoice.update({ where: { id: invoiceId }, data: { paymentStatus: status } });

  const split = splitPayments(newPayments);
  await postJournalEntry({
    businessId,
    description: `Supplier payment ${invoiceId}`,
    referenceType: 'SUPPLIER_PAYMENT',
    referenceId: invoiceId,
    lines: [
      { accountCode: ACCOUNT_CODES.ap, debitPence: split.totalPence },
      ...split.cashPence > 0 ? [{ accountCode: ACCOUNT_CODES.cash, creditPence: split.cashPence }] : [],
      ...split.bankPence > 0 ? [{ accountCode: ACCOUNT_CODES.bank, creditPence: split.bankPence }] : []
    ]
  });

  return invoice;
}
