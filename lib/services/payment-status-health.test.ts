import { describe, expect, it } from 'vitest';
import { buildPaymentStatusHealth } from './payment-status-health';

describe('buildPaymentStatusHealth', () => {
  it('flags stale open invoice statuses while keeping paid-underpaid rows review-only', () => {
    const health = buildPaymentStatusHealth({
      salesInvoices: [
        { id: 'sale-paid', paymentStatus: 'PART_PAID', totalPence: 1000, payments: [{ amountPence: 1000 }] },
        { id: 'sale-review', paymentStatus: 'PAID', totalPence: 1000, payments: [] },
      ],
      purchaseInvoices: [
        { id: 'purchase-unpaid', paymentStatus: 'PART_PAID', totalPence: 1000, payments: [] },
      ],
    });

    expect(health.issueCount).toBe(3);
    expect(health.repairableCount).toBe(2);
    expect(health.salesIssues).toEqual([
      expect.objectContaining({ invoiceId: 'sale-paid', expectedStatus: 'PAID', repairable: true }),
      expect.objectContaining({ invoiceId: 'sale-review', expectedStatus: 'UNPAID', repairable: false }),
    ]);
    expect(health.purchaseIssues).toEqual([
      expect.objectContaining({ invoiceId: 'purchase-unpaid', expectedStatus: 'UNPAID', repairable: true }),
    ]);
  });
});
