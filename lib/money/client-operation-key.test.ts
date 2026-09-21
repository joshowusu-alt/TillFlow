import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeMoneyOperationKey,
  consumeMoneyOperationKeysForRecord,
  readOrCreateMoneyOperationKey,
  readStoredMoneyOperationKey,
} from './client-operation-key';
import { paymentIntentRedirect } from './payment-intent';

describe('money operation keys', () => {
  afterEach(() => window.sessionStorage.clear());

  it('reuses an open key and mints a new one after the intention is consumed', () => {
    const first = readOrCreateMoneyOperationKey('supplier-payment:inv1');
    expect(readOrCreateMoneyOperationKey('supplier-payment:inv1')).toBe(first);
    consumeMoneyOperationKey('supplier-payment:inv1');
    expect(readStoredMoneyOperationKey('supplier-payment:inv1')?.consumed).toBe(true);
    const second = readOrCreateMoneyOperationKey('supplier-payment:inv1');
    expect(second).not.toBe(first);
    expect(readStoredMoneyOperationKey('supplier-payment:inv1')?.consumed).toBe(false);
  });

  it('retires every scope for the paid record, including a page that does not mount the form', () => {
    const supplier = readOrCreateMoneyOperationKey('supplier-payment:inv1');
    const other = readOrCreateMoneyOperationKey('supplier-payment:inv2');
    consumeMoneyOperationKeysForRecord('inv1');
    expect(readStoredMoneyOperationKey('supplier-payment:inv1')?.consumed).toBe(true);
    expect(readOrCreateMoneyOperationKey('supplier-payment:inv2')).toBe(other);
    expect(readOrCreateMoneyOperationKey('supplier-payment:inv1')).not.toBe(supplier);
  });

  it('still reads a bare key written by an older build as an open intention', () => {
    window.sessionStorage.setItem('tillflow:money-op-key:expense-payment:exp1', 'legacy-key');
    expect(readOrCreateMoneyOperationKey('expense-payment:exp1')).toBe('legacy-key');
  });

  it('names the record and this payment on the success redirect', () => {
    expect(paymentIntentRedirect('/suppliers/sup1', 'inv1', 'pay1')).toBe('/suppliers/sup1?paid=inv1&pay=pay1');
    expect(paymentIntentRedirect('/payments/expense-payments?supplierId=s', 'exp1', 'ep1')).toBe(
      '/payments/expense-payments?supplierId=s&paid=exp1&pay=ep1',
    );
  });
});
