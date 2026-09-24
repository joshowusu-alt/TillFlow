import { localDateInstant } from '@/lib/reports/reporting-clock';

export const CASHIER_MY_SALES_ROUTE = '/my-sales';

export type CashierMySalesFilters = {
  businessId: string;
  cashierUserId: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export function buildCashierMySalesWhere({
  businessId,
  cashierUserId,
  from,
  to,
  timeZone,
}: Pick<CashierMySalesFilters, 'businessId' | 'cashierUserId' | 'from' | 'to'> & { timeZone?: string | null }) {
  const dateFilter: { gte?: Date; lt?: Date } = {};
  const start = localDateInstant(from, 'start', timeZone);
  const endExclusive = localDateInstant(to, 'endExclusive', timeZone);
  if (start) dateFilter.gte = start;
  if (endExclusive) dateFilter.lt = endExclusive;

  return {
    businessId,
    cashierUserId,
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
  };
}

export function summarizePaymentMethods(payments: Array<{ method: string; amountPence: number }>) {
  const totals = new Map<string, number>();

  for (const payment of payments) {
    totals.set(payment.method, (totals.get(payment.method) ?? 0) + payment.amountPence);
  }

  return [...totals.entries()].map(([method, amountPence]) => ({ method, amountPence }));
}
