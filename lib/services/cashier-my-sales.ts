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
}: Pick<CashierMySalesFilters, 'businessId' | 'cashierUserId' | 'from' | 'to'>) {
  const dateFilter: { gte?: Date; lte?: Date } = {};

  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) dateFilter.gte = start;
  }

  if (to) {
    const end = new Date(`${to}T23:59:59.999`);
    if (!Number.isNaN(end.getTime())) dateFilter.lte = end;
  }

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
