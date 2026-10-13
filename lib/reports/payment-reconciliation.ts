import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';

/** Live receipt totals; a saved daily comparison is evidence, not a frozen total. */
export function buildPaymentReconciliationRows(
  payments: { method: string; amountPence: number; receivedAt: Date; salesInvoice: { storeId: string } }[],
  saved: { id: string; storeId: string; date: Date; paymentMethod: string; systemTotalPence: number; actualTotalPence: number | null; status: string }[],
  timezone: string,
) {
  const totals = new Map<string, number>();
  const records = new Map<string, (typeof saved)[number]>();
  for (const payment of payments) {
    const key = `${payment.salesInvoice.storeId}|${formatBusinessLocalDateKey(payment.receivedAt, timezone)}|${payment.method}`;
    totals.set(key, (totals.get(key) ?? 0) + payment.amountPence);
  }
  for (const record of saved) {
    records.set(`${record.storeId}|${formatBusinessLocalDateKey(record.date, timezone)}|${record.paymentMethod}`, record);
  }
  return [...new Set([...totals.keys(), ...records.keys()])].map(key => {
    const [storeId, date, method] = key.split('|');
    const record = records.get(key);
    const systemTotalPence = totals.get(key) ?? 0;
    const actualTotalPence = record?.actualTotalPence ?? null;
    const variancePence = actualTotalPence === null ? null : actualTotalPence - systemTotalPence;
    return {
      storeId, date, method, systemTotalPence, actualTotalPence, variancePence,
      status: actualTotalPence === null ? 'PENDING' : record?.systemTotalPence !== systemTotalPence ? 'REVIEW_REQUIRED' : variancePence === 0 ? 'RECONCILED' : 'DISCREPANCY',
      id: record?.id ?? null,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.method.localeCompare(b.method) || a.storeId.localeCompare(b.storeId));
}
