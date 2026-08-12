import { describe, expect, it } from 'vitest';
import {
  classifyMoneyReceivedRowKind,
  moneyReceivedRowKindHint,
  moneyReceivedRowKindLabel,
} from './display';

describe('Money Received owner-facing row kinds', () => {
  it('labels positive confirmed payments as money in', () => {
    const kind = classifyMoneyReceivedRowKind({
      sourceType: 'SalesPayment',
      amountPence: 5000,
      includedInMetricId: 'money_received',
    });
    expect(kind).toBe('money_in');
    expect(moneyReceivedRowKindLabel(kind)).toBe('Money in');
    expect(moneyReceivedRowKindHint(kind)).toBeNull();
  });

  it('labels negative confirmed payments as sale amend money out', () => {
    const kind = classifyMoneyReceivedRowKind({
      sourceType: 'SalesPayment',
      amountPence: -1200,
      includedInMetricId: 'money_received',
    });
    expect(kind).toBe('sale_amend_out');
    expect(moneyReceivedRowKindLabel(kind)).toBe('Sale amend (money out)');
    expect(moneyReceivedRowKindHint(kind)).toMatch(/Sale was edited/i);
  });

  it('keeps SalesReturn refunds as refund outflows', () => {
    const kind = classifyMoneyReceivedRowKind({
      sourceType: 'SalesReturnRefund',
      amountPence: 2000,
      includedInMetricId: 'refund_outflows',
    });
    expect(kind).toBe('refund_outflow');
    expect(moneyReceivedRowKindLabel(kind)).toBe('Refund outflow');
  });

  it('labels unverified legacy rows separately', () => {
    const kind = classifyMoneyReceivedRowKind({
      sourceType: 'SalesPayment',
      amountPence: 4500,
      includedInMetricId: 'unverified_legacy_receipts',
    });
    expect(kind).toBe('unverified');
    expect(moneyReceivedRowKindLabel(kind)).toBe('Unverified');
  });
});
