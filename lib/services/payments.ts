import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';

type PaymentInput = {
  method: 'CASH' | 'CARD' | 'TRANSFER';
  amountPence: number;
};

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

  const newPayments = payments.filter((payment) => payment.amountPence > 0);
  if (newPayments.length === 0) return invoice;

  await prisma.salesPayment.createMany({
    data: newPayments.map((payment) => ({
      salesInvoiceId: invoiceId,
      method: payment.method,
      amountPence: payment.amountPence
    }))
  });

  const totalPaid =
    invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0) +
    newPayments.reduce((sum, payment) => sum + payment.amountPence, 0);

  const remaining = invoice.totalPence - totalPaid;
  if (remaining < 0) {
    throw new Error('Payment exceeds outstanding balance');
  }
  const status = remaining <= 0 ? 'PAID' : totalPaid > 0 ? 'PART_PAID' : 'UNPAID';

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { paymentStatus: status }
  });

  const cashPaid = newPayments
    .filter((payment) => payment.method === 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const bankPaid = newPayments
    .filter((payment) => payment.method !== 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);

  await postJournalEntry({
    businessId,
    description: `Customer receipt ${invoiceId}`,
    referenceType: 'CUSTOMER_RECEIPT',
    referenceId: invoiceId,
    lines: [
      cashPaid > 0 ? { accountCode: ACCOUNT_CODES.cash, debitPence: cashPaid } : null,
      bankPaid > 0 ? { accountCode: ACCOUNT_CODES.bank, debitPence: bankPaid } : null,
      { accountCode: ACCOUNT_CODES.ar, creditPence: cashPaid + bankPaid }
    ].filter(Boolean) as { accountCode: string; debitPence?: number; creditPence?: number }[]
  });

  return invoice;
}

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

  const newPayments = payments.filter((payment) => payment.amountPence > 0);
  if (newPayments.length === 0) return invoice;

  await prisma.purchasePayment.createMany({
    data: newPayments.map((payment) => ({
      purchaseInvoiceId: invoiceId,
      method: payment.method,
      amountPence: payment.amountPence
    }))
  });

  const totalPaid =
    invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0) +
    newPayments.reduce((sum, payment) => sum + payment.amountPence, 0);

  const remaining = invoice.totalPence - totalPaid;
  if (remaining < 0) {
    throw new Error('Payment exceeds outstanding balance');
  }
  const status = remaining <= 0 ? 'PAID' : totalPaid > 0 ? 'PART_PAID' : 'UNPAID';

  await prisma.purchaseInvoice.update({
    where: { id: invoiceId },
    data: { paymentStatus: status }
  });

  const cashPaid = newPayments
    .filter((payment) => payment.method === 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const bankPaid = newPayments
    .filter((payment) => payment.method !== 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);

  await postJournalEntry({
    businessId,
    description: `Supplier payment ${invoiceId}`,
    referenceType: 'SUPPLIER_PAYMENT',
    referenceId: invoiceId,
    lines: [
      { accountCode: ACCOUNT_CODES.ap, debitPence: cashPaid + bankPaid },
      cashPaid > 0 ? { accountCode: ACCOUNT_CODES.cash, creditPence: cashPaid } : null,
      bankPaid > 0 ? { accountCode: ACCOUNT_CODES.bank, creditPence: bankPaid } : null
    ].filter(Boolean) as { accountCode: string; debitPence?: number; creditPence?: number }[]
  });

  return invoice;
}
