import { describe, expect, it } from 'vitest';

import { calculateCheckoutSummary, computeDiscount, parseCurrencyToPence } from './pos-checkout';

describe('parseCurrencyToPence', () => {
  it('parses decimal and comma-formatted strings', () => {
    expect(parseCurrencyToPence('10')).toBe(1000);
    expect(parseCurrencyToPence('1,234.56')).toBe(123456);
    expect(parseCurrencyToPence('')).toBe(0);
    expect(parseCurrencyToPence('bad-data')).toBe(0);
  });
});

describe('computeDiscount', () => {
  it('computes percentage discounts with clamping', () => {
    expect(computeDiscount(10000, 'PERCENT', '10')).toBe(1000);
    expect(computeDiscount(10000, 'PERCENT', '200')).toBe(10000);
  });

  it('computes fixed discounts without exceeding subtotal', () => {
    expect(computeDiscount(10000, 'AMOUNT', '12.50')).toBe(1250);
    expect(computeDiscount(10000, 'AMOUNT', '500')).toBe(10000);
  });
});

describe('calculateCheckoutSummary', () => {
  it('computes totals for mixed cash/card checkout', () => {
    const summary = calculateCheckoutSummary({
      totals: { subtotal: 10000, lineDiscount: 500, promoDiscount: 0, netSubtotal: 9500, vat: 0 },
      orderDiscountType: 'AMOUNT',
      orderDiscountInput: '5.00',
      vatEnabled: false,
      discountApprovalThresholdBps: 1500,
      discountManagerPin: '',
      discountReasonCode: null,
      discountReason: '',
      paymentMethods: ['CASH', 'CARD'],
      cashTendered: '40.00',
      cardPaid: '50.00',
      transferPaid: '',
      momoPaid: '',
      momoNetwork: 'MTN',
      momoPayerMsisdn: '',
      momoCollectionStatus: 'IDLE',
    });

    expect(summary.orderDiscount).toBe(500);
    expect(summary.totalDue).toBe(9000);
    expect(summary.cardPaidValue).toBe(5000);
    expect(summary.cashApplied).toBe(4000);
    expect(summary.changeDue).toBe(0);
    expect(summary.balanceRemaining).toBe(0);
    expect(summary.nonCashOverpay).toBe(false);
  });

  it('tracks manual MoMo state and approval requirements', () => {
    const summary = calculateCheckoutSummary({
      totals: { subtotal: 20000, lineDiscount: 0, promoDiscount: 0, netSubtotal: 20000, vat: 0 },
      orderDiscountType: 'PERCENT',
      orderDiscountInput: '20',
      vatEnabled: false,
      discountApprovalThresholdBps: 1500,
      discountManagerPin: '',
      discountReasonCode: null,
      discountReason: '',
      paymentMethods: ['CASH', 'MOBILE_MONEY'],
      cashTendered: '0',
      cardPaid: '0',
      transferPaid: '0',
      momoPaid: '100.00',
      momoNetwork: 'MTN',
      momoPayerMsisdn: '024 123 4567',
      momoCollectionStatus: 'PENDING',
    });

    expect(summary.requiresDiscountApproval).toBe(true);
    expect(summary.discountApprovalReady).toBe(false);
    expect(summary.momoPaidValue).toBe(10000);
    expect(summary.needsMomoConfirmation).toBe(true);
    expect(summary.momoConfirmed).toBe(false);
    expect(summary.momoSignature).toBe('10000|MTN|0241234567');
  });
});
