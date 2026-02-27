/**
 * Supplier service layer.
 *
 * All Prisma query logic for suppliers lives here.
 * Action files call these functions and handle auth, redirects, and revalidation.
 */

import { prisma } from '@/lib/prisma';
import { computeOutstandingBalance } from '@/lib/accounting';
import { DEFAULT_PAGE_SIZE } from '@/lib/format';

// ---------------------------------------------------------------------------
// Shared input / output types
// ---------------------------------------------------------------------------

export type SupplierWriteData = {
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimitPence?: number;
};

export type SupplierListOptions = {
  search?: string;
  page?: number;
  pageSize?: number;
};

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of suppliers for a business, with their purchase
 * invoice totals embedded so callers can compute outstanding balances without
 * extra round-trips.
 */
export async function getSuppliers(businessId: string, opts: SupplierListOptions = {}) {
  const { search, page = 1, pageSize = DEFAULT_PAGE_SIZE } = opts;

  const where = {
    businessId,
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [totalCount, suppliers] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        creditLimitPence: true,
        purchaseInvoices: {
          select: {
            paymentStatus: true,
            totalPence: true,
            payments: { select: { amountPence: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return { suppliers, totalCount, totalPages };
}

/**
 * Fetches a single supplier with purchase invoice history.
 * Returns `null` when the supplier does not belong to the given business.
 */
export async function getSupplier(id: string, businessId: string) {
  return prisma.supplier.findFirst({
    where: { id, businessId },
    include: {
      purchaseInvoices: {
        select: {
          id: true,
          createdAt: true,
          paymentStatus: true,
          totalPence: true,
          payments: { select: { amountPence: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Creates a new supplier for the given business.
 *
 * Throws a descriptive `Error` when validation fails (currently a no-op
 * guard; name emptiness is enforced in the action layer before calling here).
 */
export async function createSupplier(businessId: string, data: SupplierWriteData) {
  return prisma.supplier.create({
    data: {
      businessId,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      creditLimitPence: data.creditLimitPence ?? 0,
    },
  });
}

/**
 * Updates mutable fields on an existing supplier.
 *
 * Returns the updated record's `{ id }`, or `null` when the supplier does not
 * belong to the given business (caller should treat this as a not-found error).
 */
export async function updateSupplier(
  id: string,
  businessId: string,
  data: SupplierWriteData
): Promise<{ id: string } | null> {
  const existing = await prisma.supplier.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.supplier.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      creditLimitPence: data.creditLimitPence ?? 0,
    },
    select: { id: true },
  });
}

/**
 * Deletes a supplier after verifying they have no outstanding purchase
 * invoice balance.
 *
 * Returns the deleted record, or `null` when the supplier does not belong to
 * the business.
 *
 * Throws a descriptive `Error` when there are outstanding invoices.
 */
export async function deleteSupplier(id: string, businessId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      purchaseInvoices: {
        where: { paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
        select: {
          totalPence: true,
          payments: { select: { amountPence: true } },
        },
      },
    },
  });
  if (!supplier) return null;

  const outstanding = supplier.purchaseInvoices.reduce(
    (sum, inv) => sum + computeOutstandingBalance(inv),
    0
  );
  if (outstanding > 0) {
    throw new Error('Cannot delete a supplier who has outstanding purchase invoices.');
  }

  return prisma.supplier.delete({ where: { id: supplier.id } });
}
