import { describe, expect, it } from 'vitest';
import { RECEIPT_ORIGIN } from '@/lib/payments/receipt-origin';
import {
  laterCreditCollectionWhere,
  partitionCustomerPaymentsByOrigin,
  saleTimeReceiptWhere,
  unclassifiedReceiptWhere,
} from './receipt-list';

describe('customer receipt list filter', () => {
  it('defaults the recent list to later credit collections only', () => {
    expect(laterCreditCollectionWhere()).toEqual({
      receiptOrigin: RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION,
    });
  });

  it('filters sale-time and unclassified by persisted origin, not timestamps', () => {
    expect(saleTimeReceiptWhere()).toEqual({
      receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE,
    });
    expect(unclassifiedReceiptWhere()).toEqual({
      OR: [
        { receiptOrigin: null },
        { receiptOrigin: '' },
        { receiptOrigin: RECEIPT_ORIGIN.UNCLASSIFIED },
      ],
    });
  });

  it('never treats walk-in sale-time cash as a later collection', () => {
    const walkInCash = {
      id: 'pay-sale',
      receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE,
      receivedAt: new Date('2026-09-17T18:00:00.000Z'),
    };
    const laterCollection = {
      id: 'pay-later',
      receiptOrigin: RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION,
      receivedAt: new Date('2026-09-17T18:01:00.000Z'),
    };
    const legacyNull = {
      id: 'pay-legacy',
      receiptOrigin: null,
      receivedAt: new Date('2026-09-17T18:02:00.000Z'),
    };

    const partitioned = partitionCustomerPaymentsByOrigin([walkInCash, laterCollection, legacyNull]);
    expect(partitioned.laterCreditCollections.map((row) => row.id)).toEqual(['pay-later']);
    expect(partitioned.receivedAtSale.map((row) => row.id)).toEqual(['pay-sale']);
    expect(partitioned.unclassified.map((row) => row.id)).toEqual(['pay-legacy']);
  });
});
