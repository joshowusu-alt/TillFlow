import { describe, expect, it } from 'vitest';
import {
  TILL3_ACCOUNTING_REFS,
  TILL3_ACCOUNTING_SPLIT,
  assertTill3AccountingPersisted,
  findTill3AccountingInvoice,
  formatTill3AccountingTable,
} from './till3-accounting-gate';
import { RELIABILITY_PREVIEW_DEFECT_1, RELIABILITY_PREVIEW_DEFECT_2 } from './preview-defects';

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: 'inv-1',
    tillId: 'till-3',
    tillName: 'Till 3',
    shiftId: 'shift-3',
    shiftTillId: 'till-3',
    saleSource: 'POS',
    totalPence: TILL3_ACCOUNTING_SPLIT.totalPence,
    expectedCashPence: 10_100,
    cardTotalPence: TILL3_ACCOUNTING_SPLIT.cardPence,
    momoTotalPence: TILL3_ACCOUNTING_SPLIT.momoPence,
    transferTotalPence: TILL3_ACCOUNTING_SPLIT.transferPence,
    payments: [
      { method: 'CASH', amountPence: TILL3_ACCOUNTING_SPLIT.cashPence, reference: null },
      { method: 'CARD', amountPence: TILL3_ACCOUNTING_SPLIT.cardPence, reference: TILL3_ACCOUNTING_REFS.card },
      {
        method: 'MOBILE_MONEY',
        amountPence: TILL3_ACCOUNTING_SPLIT.momoPence,
        reference: TILL3_ACCOUNTING_REFS.momo,
      },
      {
        method: 'TRANSFER',
        amountPence: TILL3_ACCOUNTING_SPLIT.transferPence,
        reference: TILL3_ACCOUNTING_REFS.transfer,
      },
    ],
    drawer: [
      {
        entryType: 'CASH_SALE',
        amountPence: TILL3_ACCOUNTING_SPLIT.cashPence,
        tillId: 'till-3',
        shiftId: 'shift-3',
      },
    ],
    ...overrides,
  };
}

describe('Till 3 accounting gate', () => {
  it('accepts a Till 3 split sale with payments, CASH_SALE, and non-zero shift totals', () => {
    const persisted = assertTill3AccountingPersisted({ invoices: [invoice()] });
    expect(persisted.shiftId).toBe('shift-3');
    expect(formatTill3AccountingTable(persisted)).toContain('shiftExpectedCashPence=10100');
  });

  it('fails the original defect: sale identity present but shift totals remain zero', () => {
    expect(() =>
      assertTill3AccountingPersisted({
        invoices: [
          invoice({
            expectedCashPence: 0,
            cardTotalPence: 0,
            momoTotalPence: 0,
            transferTotalPence: 0,
          }),
        ],
      }),
    ).toThrow(/shift cardTotal still 0/);
  });

  it('does not treat a different till or missing refs as evidence', () => {
    expect(findTill3AccountingInvoice({ invoices: [invoice({ tillName: 'Till 1' })] })).toBeUndefined();
    expect(
      findTill3AccountingInvoice({
        invoices: [invoice({ payments: [{ method: 'CASH', amountPence: 500, reference: null }] })],
      }),
    ).toBeUndefined();
  });
});

describe('Preview original defects', () => {
  it('records defect 1 as Preview-validated and does not reopen the register helper as an app defect', () => {
    expect(RELIABILITY_PREVIEW_DEFECT_1.verdict).toBe(
      'PREVIEW VALIDATED — NEW-BUSINESS MANUAL PRODUCT ROUTING FIXED',
    );
    expect(RELIABILITY_PREVIEW_DEFECT_1.doNotRerunOnboardingManual).toBe(true);
    expect(RELIABILITY_PREVIEW_DEFECT_1.registrationHelperIsTestInfrastructureDebt).toBe(true);
    expect(RELIABILITY_PREVIEW_DEFECT_2.verdict).toBe(
      'PREVIEW BLOCKED — FOCUSED TILL 3 ACCOUNTING GATE REQUIRED',
    );
    expect(RELIABILITY_PREVIEW_DEFECT_2.gateProject).toBe('reliability-till3-accounting');
  });
});
