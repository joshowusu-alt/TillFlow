import { describe, expect, it } from 'vitest';
import {
  parseReceiptMethodParam,
  RECEIPT_METHOD_LABELS,
  resolveReceiptMethodBucket,
  sumMoneyReceivedByMethod,
  UNKNOWN_RECEIPT_METHOD,
} from '@/lib/reports/money-received';

describe('money received method buckets', () => {
  it('resolves only exact supported methods; everything else is UNKNOWN', () => {
    expect(resolveReceiptMethodBucket('CASH')).toBe('CASH');
    expect(resolveReceiptMethodBucket('CARD')).toBe('CARD');
    expect(resolveReceiptMethodBucket('TRANSFER')).toBe('TRANSFER');
    expect(resolveReceiptMethodBucket('MOBILE_MONEY')).toBe('MOBILE_MONEY');

    expect(resolveReceiptMethodBucket('cash')).toBe(UNKNOWN_RECEIPT_METHOD);
    expect(resolveReceiptMethodBucket('CHEQUE')).toBe(UNKNOWN_RECEIPT_METHOD);
    expect(resolveReceiptMethodBucket('')).toBe(UNKNOWN_RECEIPT_METHOD);
    expect(resolveReceiptMethodBucket('   ')).toBe(UNKNOWN_RECEIPT_METHOD);
    expect(resolveReceiptMethodBucket(null)).toBe(UNKNOWN_RECEIPT_METHOD);
    expect(resolveReceiptMethodBucket(undefined)).toBe(UNKNOWN_RECEIPT_METHOD);
    expect(resolveReceiptMethodBucket('CRYPTO_FUTURE')).toBe(UNKNOWN_RECEIPT_METHOD);
  });

  it('labels UNKNOWN as Unknown/Other and reconciles amount identity helper', () => {
    expect(RECEIPT_METHOD_LABELS.UNKNOWN).toBe('Unknown/Other');
    expect(
      sumMoneyReceivedByMethod({
        CASH: 100,
        CARD: 200,
        TRANSFER: 50,
        MOBILE_MONEY: 75,
        UNKNOWN: 25,
      }),
    ).toBe(450);
  });

  it('parses UNKNOWN filter without accepting free-text unsupported methods as known', () => {
    expect(parseReceiptMethodParam('UNKNOWN')).toBe('UNKNOWN');
    expect(parseReceiptMethodParam('CASH')).toBe('CASH');
    expect(parseReceiptMethodParam('cheque')).toBeNull();
    expect(parseReceiptMethodParam('cash')).toBeNull();
    expect(parseReceiptMethodParam('')).toBeNull();
  });
});
