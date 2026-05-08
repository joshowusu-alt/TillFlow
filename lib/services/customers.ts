/**
 * Customer service layer.
 *
 * All Prisma query logic for customers lives here.
 * Action files call these functions and handle auth, redirects, and revalidation.
 */

import { prisma } from '@/lib/prisma';
import { computeOutstandingBalance } from '@/lib/accounting';
import { DEFAULT_PAGE_SIZE } from '@/lib/format';
import { normalizeGhanaPhone } from '@/lib/storefront-phone';
import { parseTags, serializeTags } from '@/lib/contact-tags';

// ---------------------------------------------------------------------------
// Shared input / output types
// ---------------------------------------------------------------------------

export type CustomerWriteData = {
  name: string;
  phone?: string | null;
  email?: string | null;
  creditLimitPence?: number;
  notes?: string | null;
  tags?: string[] | null;
};

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------

/**
 * Canonical phone form for Customer.phone.
 *
 * For Ghana shapes we store the full E.164 (+233XXXXXXXXX) so that
 * "0244 123 456" and "+233244123456" collide on a single record. For other
 * markets we strip whitespace/dashes and keep the digits (preserving any
 * leading +) so duplicates differ only in formatting also collapse.
 *
 * Returns null for empty/whitespace input. Never throws.
 */
export function normalizeCustomerPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  const ghana = normalizeGhanaPhone(trimmed);
  if (ghana) return ghana;

  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/**
 * Look up an existing customer in the same business with a phone that
 * normalises to the same canonical form. Used by create/update actions to
 * surface duplicates before they happen rather than after.
 */
export async function findCustomerByPhone(
  businessId: string,
  phone: string | null | undefined,
  excludeId?: string,
): Promise<{ id: string; name: string; phone: string | null } | null> {
  const canonical = normalizeCustomerPhone(phone);
  if (!canonical) return null;

  const existing = await prisma.customer.findFirst({
    where: {
      businessId,
      phone: canonical,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, name: true, phone: true },
  });
  return existing;
}

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
        tagsJson: true,
        // salesInvoices intentionally omitted — balance loaded in a single
        // batch query below to eliminate the previous N+1.
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Batch-load unpaid/part-paid invoices for every customer on this page in a
  // single round-trip, then compute the per-customer balance in JS.
  const customerIds = customers.map((c) => c.id);
  const [arInvoices, lifetimeStats] = await Promise.all([
    customerIds.length
      ? prisma.salesInvoice.findMany({
          where: {
            customerId: { in: customerIds },
            paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
          },
          select: {
            customerId: true,
            totalPence: true,
            payments: { select: { amountPence: true } },
          },
        })
      : Promise.resolve([] as Array<{
          customerId: string | null;
          totalPence: number;
          payments: { amountPence: number }[];
        }>),
    customerIds.length
      ? prisma.salesInvoice.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: customerIds },
            paymentStatus: { notIn: ['VOID', 'RETURNED'] },
          },
          _sum: { totalPence: true },
          _max: { createdAt: true },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{
          customerId: string | null;
          _sum: { totalPence: number | null };
          _max: { createdAt: Date | null };
          _count: { _all: number };
        }>),
  ]);

  const balanceMap = new Map<string, number>();
  for (const inv of arInvoices) {
    if (!inv.customerId) continue;
    const paid = inv.payments.reduce((s, p) => s + p.amountPence, 0);
    balanceMap.set(
      inv.customerId,
      (balanceMap.get(inv.customerId) ?? 0) + Math.max(inv.totalPence - paid, 0),
    );
  }

  const lifetimeMap = new Map<string, { spentPence: number; lastSaleAt: Date | null; saleCount: number }>();
  for (const row of lifetimeStats) {
    if (!row.customerId) continue;
    lifetimeMap.set(row.customerId, {
      spentPence: row._sum.totalPence ?? 0,
      lastSaleAt: row._max.createdAt ?? null,
      saleCount: row._count._all,
    });
  }

  const customersWithBalance = customers.map((c) => {
    const lifetime = lifetimeMap.get(c.id);
    const { tagsJson, ...rest } = c;
    return {
      ...rest,
      tags: parseTags(tagsJson),
      outstandingBalancePence: balanceMap.get(c.id) ?? 0,
      lifetimeSpentPence: lifetime?.spentPence ?? 0,
      lastSaleAt: lifetime?.lastSaleAt ?? null,
      saleCount: lifetime?.saleCount ?? 0,
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return { customers: customersWithBalance, totalCount, totalPages };
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
      phone: normalizeCustomerPhone(data.phone),
      email: data.email ?? null,
      creditLimitPence: data.creditLimitPence ?? 0,
      notes: data.notes?.trim() || null,
      tagsJson: serializeTags(data.tags ?? null),
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
      phone: normalizeCustomerPhone(data.phone),
      email: data.email?.trim() || null,
      creditLimitPence: Math.max(0, data.creditLimitPence ?? 0),
      notes: data.notes?.trim() || null,
      tagsJson: serializeTags(data.tags ?? null),
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
      phone: normalizeCustomerPhone(data.phone),
      email: data.email ?? null,
      creditLimitPence: data.creditLimitPence ?? 0,
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.tags !== undefined ? { tagsJson: serializeTags(data.tags) } : {}),
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
