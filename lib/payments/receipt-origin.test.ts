/**
 * Unit tests for receipt-origin domain contract (no DB).
 */
import { describe, expect, it } from 'vitest';
import {
  RECEIPT_ORIGIN,
  isReceiptOrigin,
  parseOptionalReceiptOrigin,
  resolveReceiptOrigin,
  withReceiptOrigin,
} from '@/lib/payments/receipt-origin';

describe('receipt-origin contract', () => {
  it('accepts the three explicit origins', () => {
    expect(isReceiptOrigin('RECEIVED_AT_SALE')).toBe(true);
    expect(isReceiptOrigin('LATER_CREDIT_COLLECTION')).toBe(true);
    expect(isReceiptOrigin('UNCLASSIFIED')).toBe(true);
    expect(isReceiptOrigin('SALE')).toBe(false);
    expect(isReceiptOrigin(null)).toBe(false);
  });

  it('maps legacy NULL to UNCLASSIFIED without inventing sale-time meaning', () => {
    expect(resolveReceiptOrigin(null)).toBe(RECEIPT_ORIGIN.UNCLASSIFIED);
    expect(resolveReceiptOrigin(undefined)).toBe(RECEIPT_ORIGIN.UNCLASSIFIED);
    expect(resolveReceiptOrigin('')).toBe(RECEIPT_ORIGIN.UNCLASSIFIED);
  });

  it('preserves valid persisted origins on read', () => {
    expect(resolveReceiptOrigin('RECEIVED_AT_SALE')).toBe(RECEIPT_ORIGIN.RECEIVED_AT_SALE);
    expect(resolveReceiptOrigin('LATER_CREDIT_COLLECTION')).toBe(
      RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION,
    );
  });

  it('parses optional backup/import origins safely', () => {
    expect(parseOptionalReceiptOrigin(undefined)).toBeNull();
    expect(parseOptionalReceiptOrigin(null)).toBeNull();
    expect(parseOptionalReceiptOrigin('')).toBeNull();
    expect(parseOptionalReceiptOrigin('RECEIVED_AT_SALE')).toBe('RECEIVED_AT_SALE');
    expect(() => parseOptionalReceiptOrigin('YESTERDAY')).toThrow(/Invalid receiptOrigin/);
  });

  it('withReceiptOrigin attaches an explicit origin', () => {
    expect(
      withReceiptOrigin({ method: 'CASH', amountPence: 100 }, RECEIPT_ORIGIN.RECEIVED_AT_SALE),
    ).toEqual({
      method: 'CASH',
      amountPence: 100,
      receiptOrigin: 'RECEIVED_AT_SALE',
    });
  });
});
