import { describe, expect, it } from 'vitest';
import { pendingMomoReceipt } from './pending-momo-receipt';

describe('pendingMomoReceipt', () => {
  it('qualifies a paid invoice when the MoMo tender is still pending', () => {
    expect(
      pendingMomoReceipt({
        invoiceStatus: 'PAID',
        payments: [{ method: 'MOBILE_MONEY', amountPence: 5_200, status: 'PENDING_MANUAL' }],
      }),
    ).toEqual({ pendingMomoPence: 5_200, label: 'MoMo confirmation pending' });
  });

  it('uses only the unconfirmed MoMo portion of a mixed or partial payment', () => {
    expect(
      pendingMomoReceipt({
        invoiceStatus: 'PAID',
        payments: [
          { method: 'CASH', amountPence: 1_000, status: 'CONFIRMED' },
          { method: 'MOBILE_MONEY', amountPence: 3_000, status: 'CONFIRMED' },
          { method: 'MOBILE_MONEY', amountPence: 4_100, status: 'PENDING_MANUAL' },
        ],
      }).pendingMomoPence,
    ).toBe(4_100);
  });

  it('does not qualify confirmed, failed, or cancelled MoMo', () => {
    expect(
      pendingMomoReceipt({
        invoiceStatus: 'PAID',
        payments: [
          { method: 'MOBILE_MONEY', amountPence: 2_000, status: 'CONFIRMED' },
          { method: 'MOBILE_MONEY', amountPence: 500, status: 'FAILED' },
          { method: 'MOBILE_MONEY', amountPence: 500, status: 'CANCELLED' },
        ],
      }).label,
    ).toBeNull();
  });

  it('lets returned and void status take precedence over a pending tender', () => {
    for (const invoiceStatus of ['RETURNED', 'VOID']) {
      expect(
        pendingMomoReceipt({
          invoiceStatus,
          payments: [{ method: 'MOBILE_MONEY', amountPence: 5_200, status: 'PENDING_MANUAL' }],
        }),
      ).toEqual({ pendingMomoPence: 0, label: null });
    }
  });
});
