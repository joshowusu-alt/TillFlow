import { describe, expect, it } from 'vitest';
import {
  HISTORIC_SOURCE_UNAVAILABLE,
  SOURCE_LINK_MATRIX,
  isSaleAmendmentHref,
  resolveSourceLink,
} from './source-links';

describe('P0 source link matrix', () => {
  it('covers every required source type', () => {
    expect(Object.keys(SOURCE_LINK_MATRIX).sort()).toEqual(
      [
        'ADJUSTMENT',
        'ADJUSTMENT_REVERSAL',
        'CUSTOMER_RECEIPT',
        'EXPENSE_PAYMENT',
        'OPENING_STOCK',
        'PURCHASE',
        'PURCHASE_RETURN',
        'SALE',
        'SALES_RETURN',
        'STOCKTAKE',
        'SUPPLIER_PAYMENT',
        'TRANSFER',
      ].sort(),
    );
  });

  it('routes sale movements to read-only sale detail, never amend', () => {
    const link = resolveSourceLink({
      type: 'SALE',
      referenceType: 'SALES_INVOICE',
      referenceId: 'sale-1',
    });
    expect(link.href).toBe('/sales/sale-1');
    expect(isSaleAmendmentHref(link.href)).toBe(false);
  });

  it('does not fabricate links for historic unlinked rows', () => {
    const link = resolveSourceLink({ type: 'SALE', referenceType: null, referenceId: null });
    expect(link.historic).toBe(true);
    expect(link.href).toBeNull();
    expect(link.label).toBe(HISTORIC_SOURCE_UNAVAILABLE);
  });

  it('links each supported source type to a safe destination', () => {
    expect(resolveSourceLink({ type: 'PURCHASE', referenceType: 'PURCHASE_INVOICE', referenceId: 'p1' }).href).toBe(
      '/purchases/p1',
    );
    expect(resolveSourceLink({ type: 'SALES_RETURN', referenceType: 'SALES_RETURN', referenceId: 'r1' }).href).toBe(
      '/sales/return/r1',
    );
    expect(resolveSourceLink({ type: 'STOCKTAKE', referenceType: 'STOCKTAKE', referenceId: 'st1' }).href).toContain(
      'stocktakeId=st1',
    );
    expect(
      resolveSourceLink({ type: 'ADJUSTMENT_REVERSAL', referenceType: 'STOCK_ADJUSTMENT', referenceId: 'adj1' }).href,
    ).toContain('adjustmentId=adj1');
    expect(resolveSourceLink({ type: 'TRANSFER_IN', referenceType: 'STOCK_TRANSFER', referenceId: 't1' }).href).toContain(
      'transferId=t1',
    );
    expect(resolveSourceLink({ type: 'OPENING', referenceType: 'OPENING', referenceId: 'o1' }).href).toContain(
      'movementId=o1',
    );
    expect(
      resolveSourceLink({ type: 'PAYMENT', referenceType: 'PURCHASE_PAYMENT', referenceId: 'sp1' }).href,
    ).toContain('paymentId=sp1');
    expect(
      resolveSourceLink({ type: 'PAYMENT', referenceType: 'EXPENSE_PAYMENT', referenceId: 'ep1' }).href,
    ).toContain('paymentId=ep1');
    expect(
      resolveSourceLink({ type: 'PAYMENT', referenceType: 'CUSTOMER_RECEIPT', referenceId: 'sale-9' }).href,
    ).toBe('/sales/sale-9');
  });
});
