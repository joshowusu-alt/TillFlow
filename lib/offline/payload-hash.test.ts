import { describe, expect, it } from 'vitest';
import { canonicalizeOfflineSalePayload, hashOfflineSalePayload, offlineReplayMatches } from './payload-hash';

const sample = {
  businessId: 'biz-1',
  storeId: 'store-1',
  tillId: 'till-1',
  shiftId: 'shift-1',
  cashierUserId: 'cashier-1',
  customerId: null,
  paymentStatus: 'PAID',
  lines: [
    {
      productId: 'prod-1',
      unitId: 'unit-1',
      qtyInUnit: 2,
      unitPricePence: 2500,
      lineSubtotalPence: 5000,
      discountType: 'NONE',
      discountValue: '0',
    },
  ],
  payments: [{ method: 'CASH', amountPence: 5000 }],
  orderDiscountType: 'NONE',
  orderDiscountValue: '0',
};

describe('offline sale payload hash', () => {
  it('is stable for the same capture', async () => {
    const a = await hashOfflineSalePayload(sample);
    const b = await hashOfflineSalePayload({ ...sample, lines: [...sample.lines] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when captured prices change', async () => {
    const original = await hashOfflineSalePayload(sample);
    const changed = await hashOfflineSalePayload({
      ...sample,
      lines: [{ ...sample.lines[0], unitPricePence: 2600, lineSubtotalPence: 5200 }],
    });
    expect(changed).not.toBe(original);
  });

  it('canonical form includes tenders and captured line totals', () => {
    const canonical = canonicalizeOfflineSalePayload(sample);
    expect(canonical).toContain('"amountPence":5000');
    expect(canonical).toContain('"unitPricePence":2500');
    expect(canonical).toContain('"shiftId":"shift-1"');
    expect(canonical).toContain('"cashierUserId":"cashier-1"');
  });

  it('does not treat the same cart on a different shift as an exact replay', () => {
    expect(
      offlineReplayMatches(
        {
          storeId: sample.storeId,
          tillId: sample.tillId,
          shiftId: 'shift-1',
          cashierUserId: sample.cashierUserId,
          customerId: null,
          lines: sample.lines,
          payments: sample.payments,
        },
        {
          storeId: sample.storeId,
          tillId: sample.tillId,
          shiftId: 'shift-2',
          cashierUserId: sample.cashierUserId,
          customerId: null,
          lines: sample.lines,
          payments: sample.payments,
        },
      ),
    ).toBe(false);
  });
});
