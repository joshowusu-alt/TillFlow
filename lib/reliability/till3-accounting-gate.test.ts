import { describe, expect, it } from 'vitest';
import {
  HOSTED_0DFA476B_POS_TILL_PAGE,
  HOSTED_4728EDBA_TILL3_SHIFT_PAGE,
  TILL3_ACCOUNTING_REFS,
  TILL3_ACCOUNTING_SPLIT,
  assertPosBoundToPersistedTill3,
  assertTill3AccountingPersisted,
  classifyHostedTill3OpenShiftFailure,
  classifyHostedTill3PosTillBinding,
  classifyPersistedTill3OpenShifts,
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

describe('hosted Till 3 open-shift artifact (SHA 4728edba)', () => {
  it('classifies the error-context page as Till 3 selected, click not persisted, Start New Shift still showing', () => {
    const classified = classifyHostedTill3OpenShiftFailure(HOSTED_4728EDBA_TILL3_SHIFT_PAGE);
    expect(HOSTED_4728EDBA_TILL3_SHIFT_PAGE.heading).toBe('Shift Reconciliation');
    expect(HOSTED_4728EDBA_TILL3_SHIFT_PAGE.path).toBe('/shifts');
    expect(classified.till3WasSelected).toBe(true);
    expect(classified.openShiftClickSucceeded).toBe(false);
    expect(classified.persistedOpenShiftFromUi).toBe(false);
    expect(classified.visibleWording).toBe('Start New Shift');
    expect(classified.defectClass).toBe('redirect-navigation-timing');
  });

  it('does not treat exact Shift Active text as success when the closed form is still on screen', () => {
    expect(
      classifyHostedTill3OpenShiftFailure({
        ...HOSTED_4728EDBA_TILL3_SHIFT_PAGE,
        shiftActiveVisible: false,
      }).defectClass,
    ).not.toBe('outdated-exact-text-only');
  });

  it('treats POS redirect or Close Shift + Till 3 heading as the real open-shift success path', () => {
    expect(
      classifyHostedTill3OpenShiftFailure({
        ...HOSTED_4728EDBA_TILL3_SHIFT_PAGE,
        path: '/pos',
        navigatedToPos: true,
        startNewShiftVisible: false,
        openShiftButtonVisible: false,
        till3Selected: false,
      }).defectClass,
    ).toBe('outdated-exact-text-only');
    expect(
      classifyHostedTill3OpenShiftFailure({
        ...HOSTED_4728EDBA_TILL3_SHIFT_PAGE,
        startNewShiftVisible: false,
        openShiftButtonVisible: false,
        closeShiftVisible: true,
        till3HeadingVisible: true,
        shiftActiveVisible: true,
      }).visibleWording,
    ).toBe('Shift Active');
  });

  it('reuses a unique persisted Till 3 OPEN shift and fails closed when identity is ambiguous', () => {
    expect(
      classifyPersistedTill3OpenShifts([
        {
          id: 'shift-3',
          tillId: 'till-3',
          tillName: 'Till 3',
          status: 'OPEN',
          ownedByCurrentUser: true,
          openFloatCount: 1,
        },
      ]),
    ).toEqual({
      state: 'till-3-open',
      shiftId: 'shift-3',
      tillId: 'till-3',
      openFloatCount: 1,
    });
    expect(classifyPersistedTill3OpenShifts([])).toEqual({
      state: 'closed',
      shiftId: null,
      tillId: null,
      openFloatCount: 0,
    });
    expect(
      classifyPersistedTill3OpenShifts([
        {
          id: 'shift-3a',
          tillId: 'till-3',
          tillName: 'Till 3',
          status: 'OPEN',
          ownedByCurrentUser: true,
        },
        {
          id: 'shift-3b',
          tillId: 'till-3',
          tillName: 'Till 3',
          status: 'OPEN',
          ownedByCurrentUser: true,
        },
      ]).state,
    ).toBe('ambiguous');
    expect(
      classifyPersistedTill3OpenShifts([
        {
          id: 'shift-3',
          tillId: 'till-3',
          tillName: 'Till 3',
          status: 'OPEN',
          ownedByCurrentUser: false,
        },
      ]).state,
    ).toBe('ambiguous');
  });

  it('keeps the original unique payment references', () => {
    expect(TILL3_ACCOUNTING_REFS).toEqual({
      card: 'CARD-REL-T3ACC-1',
      momo: 'MOMO-REL-T3ACC-1',
      transfer: 'BT-REL-T3ACC-1',
    });
  });
});

describe('hosted Till 3 POS till binding artifact (SHA 0dfa476b)', () => {
  it('classifies Preparing checkout as checkout extras not ready, not a missing Till 3 till', () => {
    const classified = classifyHostedTill3PosTillBinding(HOSTED_0DFA476B_POS_TILL_PAGE);
    expect(HOSTED_0DFA476B_POS_TILL_PAGE.path).toBe('/pos');
    expect(HOSTED_0DFA476B_POS_TILL_PAGE.tillComboboxName).toBe('Till');
    expect(HOSTED_0DFA476B_POS_TILL_PAGE.tillOptions).toEqual(['Preparing checkout…']);
    expect(classified.isPosPage).toBe(true);
    expect(classified.till3OptionPresent).toBe(false);
    expect(classified.defectClass).toBe('checkout-extras-not-ready');
  });

  it('fails closed when barcode is ready but the unique till select is still loading', () => {
    expect(() =>
      assertPosBoundToPersistedTill3({
        persistedShiftId: 'shift-3',
        persistedTillId: 'till-3',
        urlTillId: null,
        selectedTillId: '',
        selectedShiftId: '',
        checkoutTillState: 'loading',
        visibleTillSelectCount: 1,
        till3OptionCount: 0,
        selectedOptionText: 'Preparing checkout…',
      }),
    ).toThrow(/checkout extras are still loading/);
  });

  it('accepts a unique ready till select bound to the persisted Till 3 shift id', () => {
    expect(
      assertPosBoundToPersistedTill3({
        persistedShiftId: 'shift-3',
        persistedTillId: 'till-3',
        urlTillId: 'till-3',
        selectedTillId: 'till-3',
        selectedShiftId: 'shift-3',
        checkoutTillState: 'ready',
        visibleTillSelectCount: 1,
        till3OptionCount: 1,
        selectedOptionText: 'Till 3',
      }).selectedShiftId,
    ).toBe('shift-3');
  });

  it('does not treat duplicate visible till selects as bound', () => {
    expect(() =>
      assertPosBoundToPersistedTill3({
        persistedShiftId: 'shift-3',
        persistedTillId: 'till-3',
        urlTillId: 'till-3',
        selectedTillId: 'till-3',
        selectedShiftId: 'shift-3',
        checkoutTillState: 'ready',
        visibleTillSelectCount: 2,
        till3OptionCount: 1,
        selectedOptionText: 'Till 3',
      }),
    ).toThrow(/visible=2/);
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
