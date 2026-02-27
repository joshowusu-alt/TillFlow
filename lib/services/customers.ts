/**
 * Customer service layer.
 *
 * All Prisma query logic for customers lives here.
 * Action files call these functions and handle auth, redirects, and revalidation.
 */

import { prisma } from '@/lib/prisma';
import { computeOutstandingBalance } from '@/lib/accounting';
import { DEFAULT_PAGE_SIZE } from '@/lib/format';

// ---------------------------------------------------------------------------
// Shared input / output types
// ---------------------------------------------------------------------------

export type CustomerWriteData = {
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimitPence?: number;
};

export type CustomerListOptions = {
  search?: string;
  page?: number;
  pageSize?: number;
  /** Filter by store — only applied when the business uses BRANCH scope. */
  storeId?: string;
};

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of customers for a business, with their invoice
 * totals embedded so callers can compute outstanding balances without extra
 * round-trips.
 */
export async function getCustomers(businessId: string, opts: CustomerListOptions = {}) {
  const { search, page = 1, pageSize = DEFAULT_PAGE_SIZE, storeId } = opts;

  const where = {
    businessId,
    ...(storeId ? { storeId } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [totalCount, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        creditLimitPence: true,
        storeId: true,
        salesInvoices: {
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
  return { customers, totalCount, totalPages };
}

/**
 * Fetches a single customer with invoice history.
 * Returns `null` when the customer does not belong to the given business.
 */
export async function getCustomer(
  id: string,
  businessId: string,
  opts: { from?: Date; to?: Date } = {}
) {
  return prisma.customer.findFirst({
    where: { id, businessId },
    include: {
      salesInvoices: {
        where: {
          ...(opts.from ? { createdAt: { gte: opts.from } } : {}),
          ...(opts.to ? { createdAt: { lte: opts.to } } : {}),
        },
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
 * Creates a customer, resolving the correct `storeId` based on the business's
 * `customerScope` setting.
 *
 * Throws a descriptive `Error` when:
 * - The business cannot be found
 * - The scope is BRANCH but no `storeId` was supplied
 * - The supplied `storeId` does not belong to the business
 */
export async function createCustomer(
  businessId: string,
  data: CustomerWriteData & { storeId?: string | null }
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { customerScope: true },
  });
  if (!business) throw new Error('Business not found.');

  let resolvedStoreId: string | null = null;
  if (business.customerScope === 'BRANCH') {
    if (!data.storeId) throw new Error('Select a branch/store for this customer.');
    const store = await prisma.store.findFirst({
      where: { id: data.storeId, businessId },
      select: { id: true },
    });
    if (!store) throw new Error('Invalid branch/store selected.');
    resolvedStoreId = store.id;
  }

  return prisma.customer.create({
    data: {
      businessId,
      storeId: resolvedStoreId,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      creditLimitPence: data.creditLimitPence ?? 0,
    },
  });
}

/**
 * Quick-create a customer for use from the POS screen.
 *
 * When the business uses BRANCH scope the customer is automatically assigned
 * to the first store (mirrors the original quick-create behaviour).
 *
 * Returns only `{ id, name }` — the minimum the POS needs.
 *
 * Throws a descriptive `Error` when the business cannot be found.
 */
export async function quickCreateCustomer(
  businessId: string,
  data: CustomerWriteData
): Promise<{ id: string; name: string }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      customerScope: true,
      stores: { select: { id: true }, take: 1 },
    },
  });
  if (!business) throw new Error('Business not found.');

  let storeId: string | null = null;
  if (business.customerScope === 'BRANCH') {
    storeId = business.stores[0]?.id ?? null;
  }

  return prisma.customer.create({
    data: {
      businessId,
      storeId,
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      creditLimitPence: Math.max(0, data.creditLimitPence ?? 0),
    },
    select: { id: true, name: true },
  });
}

/**
 * Updates mutable fields on an existing customer.
 *
 * Returns the updated record's `{ id }`, or `null` when the customer does not
 * belong to the given business (caller should treat this as a not-found error).
 */
export async function updateCustomer(
  id: string,
  businessId: string,
  data: CustomerWriteData
): Promise<{ id: string } | null> {
  const existing = await prisma.customer.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.customer.update({
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
 * Deletes a customer after verifying they have no outstanding balance.
 *
 * Returns the deleted record, or `null` when the customer does not belong to
 * the business.
 *
 * Throws a descriptive `Error` when there is an outstanding balance.
 */
export async function deleteCustomer(id: string, businessId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, businessId },
    select: {
      id: true,
      salesInvoices: {
        where: { paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
        select: {
          totalPence: true,
          payments: { select: { amountPence: true } },
        },
      },
    },
  });
  if (!customer) return null;

  const outstanding = customer.salesInvoices.reduce(
    (sum, inv) => sum + computeOutstandingBalance(inv),
    0
  );
  if (outstanding > 0) {
    throw new Error('Cannot delete a customer who has an outstanding balance.');
  }

  return prisma.customer.delete({ where: { id: customer.id } });
}
