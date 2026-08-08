/**
 * Shared sales-revenue contract for Home and Trading Report.
 *
 * Sales revenue = Σ SalesInvoice.totalPence where:
 *   - businessId from authenticated session
 *   - createdAt in [startInclusive, endExclusive)
 *   - paymentStatus not in RETURNED | VOID
 *   - optional storeId filter
 *
 * totalPence already reflects discounts and tax per TillFlow checkout.
 * Credit (UNPAID / PART_PAID) sales are included in full — unpaid amounts
 * are not receipts. Later debtor collections do not create new invoices and
 * therefore do not inflate revenue.
 */
import { prisma } from '@/lib/prisma';
import {
  REPORTING_EXCLUDED_SALE_STATUSES,
  reportingTimestampFilter,
  salesInvoiceStoreFilter,
  type ReportingScope,
} from '@/lib/reports/reporting-scope';

export type SalesRevenueSummary = {
  salesRevenuePence: number;
  transactionCount: number;
  /** Invoice total still unpaid within the period (credit component of period sales). */
  creditSalesOutstandingPence: number;
};

export function salesRevenueWhere(scope: ReportingScope) {
  return {
    businessId: scope.businessId,
    ...salesInvoiceStoreFilter(scope.storeId),
    createdAt: reportingTimestampFilter(scope),
    paymentStatus: { notIn: [...REPORTING_EXCLUDED_SALE_STATUSES] },
  };
}

export async function getSalesRevenueSummary(scope: ReportingScope): Promise<SalesRevenueSummary> {
  const where = salesRevenueWhere(scope);

  const [agg, creditRows] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where,
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    prisma.salesInvoice.findMany({
      where: {
        ...where,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
      },
      select: {
        totalPence: true,
        payments: {
          where: { status: { notIn: ['FAILED', 'CANCELLED', 'VOID'] } },
          select: { amountPence: true },
        },
      },
      take: 5000,
    }),
  ]);

  let creditSalesOutstandingPence = 0;
  for (const invoice of creditRows) {
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    creditSalesOutstandingPence += Math.max(invoice.totalPence - paid, 0);
  }

  return {
    salesRevenuePence: agg._sum.totalPence ?? 0,
    transactionCount: agg._count.id,
    creditSalesOutstandingPence,
  };
}
