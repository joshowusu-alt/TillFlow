/**
 * Historic credit purchases with no supplier (orphans).
 * Listed for owner/manager review. Assignment is an audited, one-invoice repair.
 */

import { prisma } from '@/lib/prisma';
import { computeOutstandingBalance } from '@/lib/accounting';
import { audit } from '@/lib/audit';
import { UserError } from '@/lib/action-utils';

const ORPHAN_STATUSES = ['UNPAID', 'PART_PAID'] as const;

export type OrphanCreditPurchase = {
  id: string;
  transactionNumber: string | null;
  createdAt: Date;
  dueDate: Date | null;
  paymentStatus: string;
  totalPence: number;
  paidPence: number;
  outstandingPence: number;
};

export async function listOrphanCreditPurchases(businessId: string): Promise<OrphanCreditPurchase[]> {
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      businessId,
      supplierId: null,
      paymentStatus: { in: [...ORPHAN_STATUSES] },
    },
    select: {
      id: true,
      transactionNumber: true,
      createdAt: true,
      dueDate: true,
      paymentStatus: true,
      totalPence: true,
      payments: { select: { amountPence: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return invoices.map((invoice) => {
    const paidPence = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    return {
      id: invoice.id,
      transactionNumber: invoice.transactionNumber,
      createdAt: invoice.createdAt,
      dueDate: invoice.dueDate,
      paymentStatus: invoice.paymentStatus,
      totalPence: invoice.totalPence,
      paidPence,
      outstandingPence: computeOutstandingBalance(invoice),
    };
  });
}

export async function assignOrphanPurchaseSupplier(input: {
  businessId: string;
  invoiceId: string;
  supplierId: string;
  user: { id: string; name: string | null; role: string };
}): Promise<{ id: string; supplierId: string }> {
  if (!input.invoiceId?.trim()) {
    throw new UserError('Purchase invoice is required.');
  }
  if (!input.supplierId?.trim()) {
    throw new UserError('Select a supplier to assign.');
  }
  if (input.user.role !== 'OWNER') {
    throw new UserError('Only the owner can assign a supplier to a historic credit purchase.');
  }

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: {
      id: input.invoiceId,
      businessId: input.businessId,
      supplierId: null,
    },
    select: {
      id: true,
      supplierId: true,
      paymentStatus: true,
      totalPence: true,
    },
  });
  if (!invoice) {
    throw new UserError('Orphan purchase not found for this business.');
  }
  if (!ORPHAN_STATUSES.includes(invoice.paymentStatus as (typeof ORPHAN_STATUSES)[number])) {
    throw new UserError('Only unpaid or part-paid purchases can be assigned a supplier.');
  }

  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, businessId: input.businessId },
    select: { id: true, name: true },
  });
  if (!supplier) {
    throw new UserError('Supplier not found for this business.');
  }

  const updated = await prisma.purchaseInvoice.updateMany({
    where: { id: invoice.id, businessId: input.businessId, supplierId: null },
    data: { supplierId: supplier.id },
  });
  if (updated.count !== 1) {
    throw new UserError('This purchase already has a supplier.');
  }

  await audit({
    businessId: input.businessId,
    userId: input.user.id,
    userName: input.user.name,
    userRole: input.user.role,
    action: 'PURCHASE_LINK_SUPPLIER',
    entity: 'PurchaseInvoice',
    entityId: invoice.id,
    details: {
      before: { supplierId: null },
      after: { supplierId: supplier.id, supplierName: supplier.name },
      previousSupplierId: null,
      previousSupplierValue: null,
      newSupplierId: supplier.id,
      newSupplierValue: supplier.name,
      purchaseInvoiceId: invoice.id,
    },
  });

  return { id: invoice.id, supplierId: supplier.id };
}
