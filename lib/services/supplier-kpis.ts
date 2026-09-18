/**
 * Supplier list KPI aggregation.
 *
 * Pagination is not financial scope. These totals use the full filtered
 * supplier population (search + amount-owed) before skip/take.
 * Invoices with supplierId = null are excluded.
 */

import { prisma } from '@/lib/prisma';
import { computeOutstandingBalance } from '@/lib/accounting';

export type SupplierKpiFilter = {
  search?: string;
  amountOwed?: boolean;
};

export type SupplierKpiScope = 'all' | 'search' | 'amount_owed' | 'search_and_amount_owed';

export type SupplierListKpis = {
  suppliersWithBalanceCount: number;
  totalApOutstandingPence: number;
  scope: SupplierKpiScope;
};

export function supplierKpiFilterScope(filter: SupplierKpiFilter): SupplierKpiScope {
  const hasSearch = Boolean(filter.search?.trim());
  if (hasSearch && filter.amountOwed) return 'search_and_amount_owed';
  if (hasSearch) return 'search';
  if (filter.amountOwed) return 'amount_owed';
  return 'all';
}

export function supplierKpiScopeHelper(scope: SupplierKpiScope): string {
  switch (scope) {
    case 'search':
      return 'Matching current search';
    case 'amount_owed':
      return 'Amount owed only';
    case 'search_and_amount_owed':
      return 'Matching search and amount owed';
    default:
      return 'All supplier accounts';
  }
}

export function buildSupplierListWhere(
  businessId: string,
  filter: SupplierKpiFilter,
): {
  businessId: string;
  name?: { contains: string; mode: 'insensitive' };
  purchaseInvoices?: { some: { paymentStatus: { in: string[] } } };
} {
  const search = filter.search?.trim() ?? '';
  return {
    businessId,
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    ...(filter.amountOwed
      ? { purchaseInvoices: { some: { paymentStatus: { in: ['UNPAID', 'PART_PAID'] } } } }
      : {}),
  };
}

/**
 * Outstanding payables across every supplier that matches the active filter.
 * Uses unpaid invoices for matching suppliers — not the current page of rows.
 */
export async function getSupplierListKpis(
  businessId: string,
  filter: SupplierKpiFilter = {},
): Promise<SupplierListKpis> {
  const search = filter.search?.trim() ?? '';
  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      businessId,
      supplierId: { not: null },
      paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      supplier: {
        businessId,
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
        ...(filter.amountOwed
          ? { purchaseInvoices: { some: { paymentStatus: { in: ['UNPAID', 'PART_PAID'] } } } }
          : {}),
      },
    },
    select: {
      supplierId: true,
      totalPence: true,
      paymentStatus: true,
      payments: { select: { amountPence: true } },
    },
  });

  const outstandingBySupplier = new Map<string, number>();
  for (const invoice of invoices) {
    if (!invoice.supplierId) continue;
    const balance = computeOutstandingBalance(invoice);
    if (balance <= 0) continue;
    outstandingBySupplier.set(
      invoice.supplierId,
      (outstandingBySupplier.get(invoice.supplierId) ?? 0) + balance,
    );
  }

  let totalApOutstandingPence = 0;
  for (const balance of outstandingBySupplier.values()) {
    totalApOutstandingPence += balance;
  }

  return {
    suppliersWithBalanceCount: outstandingBySupplier.size,
    totalApOutstandingPence,
    scope: supplierKpiFilterScope({ search, amountOwed: filter.amountOwed }),
  };
}
