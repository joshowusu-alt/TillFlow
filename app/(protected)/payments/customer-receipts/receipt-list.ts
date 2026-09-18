import {
  RECEIPT_ORIGIN,
  resolveReceiptOrigin,
  type ReceiptOrigin,
} from '@/lib/payments/receipt-origin';

export const RECEIPT_ORIGIN_LABELS: Record<ReceiptOrigin, string> = {
  RECEIVED_AT_SALE: 'Received at sale',
  LATER_CREDIT_COLLECTION: 'Later credit collection',
  UNCLASSIFIED: 'Unclassified',
};

/** Prisma filter for the default "Recent customer payments" list. */
export function laterCreditCollectionWhere() {
  return { receiptOrigin: RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION };
}

export function saleTimeReceiptWhere() {
  return { receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE };
}

/** Legacy NULL, empty, and explicit UNCLASSIFIED — never inferred from time. */
export function unclassifiedReceiptWhere() {
  return {
    OR: [
      { receiptOrigin: null },
      { receiptOrigin: '' },
      { receiptOrigin: RECEIPT_ORIGIN.UNCLASSIFIED },
    ],
  };
}

export function partitionCustomerPaymentsByOrigin<T extends { receiptOrigin?: string | null }>(
  rows: T[],
): {
  laterCreditCollections: T[];
  receivedAtSale: T[];
  unclassified: T[];
} {
  const laterCreditCollections: T[] = [];
  const receivedAtSale: T[] = [];
  const unclassified: T[] = [];

  for (const row of rows) {
    const origin = resolveReceiptOrigin(row.receiptOrigin);
    if (origin === RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION) {
      laterCreditCollections.push(row);
    } else if (origin === RECEIPT_ORIGIN.RECEIVED_AT_SALE) {
      receivedAtSale.push(row);
    } else {
      unclassified.push(row);
    }
  }

  return { laterCreditCollections, receivedAtSale, unclassified };
}
