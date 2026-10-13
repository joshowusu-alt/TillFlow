import { describe, expect, it } from 'vitest';
import { buildPaymentReconciliationRows } from './payment-reconciliation';

const payment = (storeId: string, amountPence: number, receivedAt = new Date('2026-10-13T12:00:00Z')) => ({ method: 'CARD', amountPence, receivedAt, salesInvoice: { storeId } });
const saved = { id: 'r1', storeId: 'branch-a', date: new Date('2026-10-13T00:00:00Z'), paymentMethod: 'CARD', systemTotalPence: 1000, actualTotalPence: 1000, status: 'RECONCILED' };

describe('daily receipt comparison', () => {
  it('keeps branches separate when date and method match', () => {
    const rows = buildPaymentReconciliationRows([payment('branch-a', 1000), payment('branch-b', 2000)], [saved], 'Africa/Accra');
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ storeId: 'branch-a', systemTotalPence: 1000, status: 'RECONCILED' }),
      expect.objectContaining({ storeId: 'branch-b', systemTotalPence: 2000, status: 'PENDING' }),
    ]));
  });
  it('shows live totals and requires another review after later receipts', () => {
    const [row] = buildPaymentReconciliationRows([payment('branch-a', 1500)], [saved], 'Africa/Accra');
    expect(row).toMatchObject({ systemTotalPence: 1500, actualTotalPence: 1000, variancePence: -500, status: 'REVIEW_REQUIRED' });
  });
  it('does not preserve a reconciled label when a receipt disappears', () => {
    expect(buildPaymentReconciliationRows([], [saved], 'Africa/Accra')[0]).toMatchObject({ systemTotalPence: 0, variancePence: 1000, status: 'REVIEW_REQUIRED' });
  });
  it('groups receipts on the business local day rather than UTC day', () => {
    const rows = buildPaymentReconciliationRows([payment('branch-a', 250, new Date('2026-10-13T00:30:00Z'))], [], 'America/New_York');
    expect(rows[0]).toMatchObject({ date: '2026-10-12', systemTotalPence: 250 });
  });
  it('reports a genuine statement difference after a fresh comparison', () => {
    const [row] = buildPaymentReconciliationRows([payment('branch-a', 1000)], [{ ...saved, actualTotalPence: 900 }], 'Africa/Accra');
    expect(row).toMatchObject({ variancePence: -100, status: 'DISCREPANCY' });
  });
});
