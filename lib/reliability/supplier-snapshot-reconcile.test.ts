import { describe, expect, it } from 'vitest';
import { reconcileSupplierSnapshot } from './supplier-snapshot-reconcile';

describe('supplier snapshot reconcile', () => {
  const asOf = new Date('2026-09-17T00:00:00.000Z');

  it('explains orphans and missing due dates without forcing totals to agree by mutation', () => {
    const result = reconcileSupplierSnapshot(
      [
        {
          id: 'p1',
          supplierId: 's1',
          dueDate: new Date('2026-09-20T00:00:00.000Z'),
          totalPence: 10_000,
          paymentStatus: 'UNPAID',
          payments: [],
        },
        {
          id: 'p2',
          supplierId: 's1',
          dueDate: null,
          totalPence: 4_000,
          paymentStatus: 'UNPAID',
          payments: [],
        },
        {
          id: 'orphan',
          supplierId: null,
          dueDate: new Date('2026-08-01T00:00:00.000Z'),
          totalPence: 7_000,
          paymentStatus: 'UNPAID',
          payments: [],
        },
      ],
      asOf,
    );

    expect(result.supplierAttributedOutstandingPence).toBe(14_000);
    expect(result.orphanCreditOutstandingPence).toBe(7_000);
    expect(result.ageingAttributedPence).toBe(14_000);
    expect(result.dueDateMissingPence).toBe(4_000);
    expect(result.genuineDifferencePence).toBe(0);
    expect(result.explanations.some((line) => line.includes('without suppliers'))).toBe(true);
    expect(result.explanations.some((line) => line.includes('DUE_DATE_MISSING'))).toBe(true);
  });
});
