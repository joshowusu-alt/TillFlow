import { describe, expect, it } from 'vitest';

import {
  POS_QUICK_CASH_DENOMINATIONS_GHS,
  applyPaidSingleMethodDefaults,
  buildOnlineSaleExternalRef,
  paymentMethodLabel,
  primaryCheckoutLabel,
  resolveDueDateForSubmit,
} from './pos-checkout-state';

describe('pos-checkout-state', () => {
  it('labels TRANSFER as Bank Transfer without renaming the stored value', () => {
    expect(paymentMethodLabel('TRANSFER')).toBe('Bank Transfer');
    expect(paymentMethodLabel('MOBILE_MONEY')).toBe('MoMo');
  });

  it('uses approved Ghana quick-cash denominations without GH₵2', () => {
    expect([...POS_QUICK_CASH_DENOMINATIONS_GHS]).toEqual([1, 5, 10, 20, 50, 100, 200]);
  });

  it('defaults exact cash for Paid + Cash when tendered is blank', () => {
    const result = applyPaidSingleMethodDefaults({
      paymentStatus: 'PAID',
      paymentMethods: ['CASH'],
      totalDuePence: 1250,
      cashTendered: '',
      cardPaid: '',
      transferPaid: '',
      momoPaid: '',
    });
    expect(result.usedExactCashDefault).toBe(true);
    expect(result.cashTendered).toBe('12.50');
  });

  it('defaults Paid single-method non-cash amounts to the total', () => {
    const card = applyPaidSingleMethodDefaults({
      paymentStatus: 'PAID',
      paymentMethods: ['CARD'],
      totalDuePence: 2000,
      cashTendered: '',
      cardPaid: '',
      transferPaid: '',
      momoPaid: '',
    });
    expect(card.cardPaid).toBe('20.00');
  });

  it('requires an explicit due-date decision for credit sales', () => {
    expect(
      resolveDueDateForSubmit({
        paymentStatus: 'UNPAID',
        dueDateDecision: 'unset',
        dueDate: '',
      }).ok,
    ).toBe(false);
    expect(
      resolveDueDateForSubmit({
        paymentStatus: 'PART_PAID',
        dueDateDecision: 'none',
        dueDate: '',
      }),
    ).toEqual({ ok: true, dueDate: '' });
    expect(
      resolveDueDateForSubmit({
        paymentStatus: 'PAID',
        dueDateDecision: 'date',
        dueDate: '2026-08-01',
      }),
    ).toEqual({ ok: true, dueDate: '' });
  });

  it('builds online idempotency refs that do not collide with offline sync', () => {
    expect(buildOnlineSaleExternalRef('abc')).toBe('POS_ONLINE:abc');
    expect(buildOnlineSaleExternalRef('abc').startsWith('OFFLINE_SYNC:')).toBe(false);
  });

  it('uses distinct primary CTA labels by sale status', () => {
    expect(
      primaryCheckoutLabel({
        paymentStatus: 'PAID',
        paymentMethods: ['CASH'],
        isCompletingSale: false,
        totalLabel: 'GH₵10.00',
      }),
    ).toContain('Complete Cash Sale');
    expect(
      primaryCheckoutLabel({
        paymentStatus: 'UNPAID',
        paymentMethods: [],
        isCompletingSale: false,
        totalLabel: 'GH₵10.00',
      }),
    ).toBe('Complete Credit Sale');
  });
});
