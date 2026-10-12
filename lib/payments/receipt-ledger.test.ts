import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { pendingMomoConfirmationLines, receiptLedgerFields, settledReceiptSplit, RECEIPT_LEDGER_V1 } from './receipt-ledger';

describe('confirmed-receipts receivable posting contract', () => {
  it('keeps mixed pending tender out of Bank without losing confirmed cash or provider money', () => {
    expect(settledReceiptSplit([
      { method: 'CASH', amountPence: 2000 },
      { method: 'MOBILE_MONEY', amountPence: 3200, status: 'PENDING_MANUAL' },
      { method: 'MOBILE_MONEY', amountPence: 1000, status: 'CONFIRMED' },
    ])).toEqual({cashPence:2000,bankPence:1000,totalPence:3000});
  });
  it('never books failed or cancelled MoMo as Bank', () => {
    for (const status of ['FAILED','CANCELLED','VOID','PENDING_MANUAL']) {
      expect(settledReceiptSplit([{method:'MOBILE_MONEY',amountPence:5200,status}]).totalPence).toBe(0);
    }
  });
  it('dates only settled receipts and marks the forward treatment explicitly', () => {
    expect(receiptLedgerFields({method:'MOBILE_MONEY',status:'PENDING_MANUAL'})).toEqual({ledgerTreatment:RECEIPT_LEDGER_V1,confirmedAt:null});
    expect(receiptLedgerFields({method:'CASH'}).confirmedAt).toBeInstanceOf(Date);
  });
  it('moves exactly the confirmed amount from AR to Bank and refuses invalid amounts', () => {
    expect(pendingMomoConfirmationLines(5200)).toEqual([{accountCode:'1010',debitPence:5200},{accountCode:'1100',creditPence:5200}]);
    for(const amount of [0,-1,0.5,NaN]) expect(()=>pendingMomoConfirmationLines(amount)).toThrow();
  });
});
