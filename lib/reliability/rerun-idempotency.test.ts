import { describe, expect, it } from 'vitest';
import {
  RELIABILITY_RERUN_IDS,
  anyCreatePending,
  assertRerunDecision,
  classifyLateOfflineRerun,
  classifyMobileCashSaleRerun,
  classifyOpeningStockRerun,
  classifyShapelessSale,
  classifyTenderRef,
  classifyTill3DrawerOpenRerun,
  classifyUniqueIdentity,
  countExactRefs,
  isCreditSale,
  isDesktopCashSale,
  isSplitCashCardSale,
} from './rerun-idempotency';

describe('classifyUniqueIdentity', () => {
  it('creates when missing, skips the single match, fails extras and duplicates', () => {
    expect(classifyUniqueIdentity('CARD-REL-1', 0)).toEqual({
      decision: 'create',
      reason: 'CARD-REL-1: missing',
    });
    expect(classifyUniqueIdentity('CARD-REL-1', 1).decision).toBe('skip');
    expect(classifyUniqueIdentity('CARD-REL-1', 2).decision).toBe('fail');
    expect(classifyUniqueIdentity('REL-EXP-1', 1, 1).decision).toBe('fail');
  });
});

describe('tender refs CARD-REL-1 / MOMO-REL-1 / BT-REL-1', () => {
  const hits = [
    { reference: 'CARD-REL-1' },
    { reference: 'MOMO-REL-1' },
    { reference: 'BT-REL-1' },
  ];

  it('skips each completed unique ref and fails unexpected duplicates', () => {
    expect(classifyTenderRef(hits, RELIABILITY_RERUN_IDS.cardRef).decision).toBe('skip');
    expect(classifyTenderRef([], RELIABILITY_RERUN_IDS.cardRef).decision).toBe('create');
    expect(
      classifyTenderRef(
        [{ reference: 'CARD-REL-1' }, { reference: 'CARD-REL-1' }],
        RELIABILITY_RERUN_IDS.cardRef,
      ).decision,
    ).toBe('fail');
    expect(countExactRefs(hits, 'CASH')).toBe(0);
  });
});

describe('classifyOpeningStockRerun', () => {
  const qa = { productMatchesQa: true, qtyBase: 1, type: 'OPENING', referenceType: 'OPENING_BALANCE_INVENTORY' };

  it('creates when the failed run never wrote opening stock', () => {
    expect(classifyOpeningStockRerun({ movements: [], openingCapitalPence: 0 }).decision).toBe(
      'create',
    );
  });

  it('reuses a single QA opening at expected qty even if cost is empty-SKU leftover', () => {
    expect(
      classifyOpeningStockRerun({ movements: [qa], openingCapitalPence: 0 }).decision,
    ).toBe('skip');
  });

  it('fails conflicting extra capital or extra stock', () => {
    expect(
      classifyOpeningStockRerun({ movements: [qa], openingCapitalPence: 500 }).decision,
    ).toBe('fail');
    expect(
      classifyOpeningStockRerun({
        movements: [qa, { productMatchesQa: false, qtyBase: 2, type: 'OPENING' }],
        openingCapitalPence: 0,
      }).decision,
    ).toBe('fail');
    expect(
      classifyOpeningStockRerun({
        movements: [qa, { ...qa }],
        openingCapitalPence: 0,
      }).decision,
    ).toBe('fail');
    expect(
      classifyOpeningStockRerun({
        movements: [{ ...qa, qtyBase: 5 }],
        openingCapitalPence: 0,
      }).decision,
    ).toBe('fail');
  });
});

describe('classifyTill3DrawerOpenRerun', () => {
  it('keeps fail on other-till-open', () => {
    expect(
      classifyTill3DrawerOpenRerun({
        shiftState: 'other-till-open',
        needsOpenShift: true,
      }).decision,
    ).toBe('fail');
  });

  it('skips when Till 3 is already open so OPEN_FLOAT is not doubled', () => {
    expect(
      classifyTill3DrawerOpenRerun({
        shiftState: 'till-3-open',
        needsOpenShift: true,
        openFloatCountOnCurrentShift: 1,
      }).decision,
    ).toBe('skip');
    expect(
      classifyTill3DrawerOpenRerun({
        shiftState: 'till-3-open',
        needsOpenShift: true,
        openFloatCountOnCurrentShift: 2,
      }).decision,
    ).toBe('fail');
  });

  it('does not open a new float when every downstream mutation will skip', () => {
    expect(
      classifyTill3DrawerOpenRerun({
        shiftState: 'closed',
        needsOpenShift: false,
      }).decision,
    ).toBe('skip');
    expect(
      classifyTill3DrawerOpenRerun({
        shiftState: 'closed',
        needsOpenShift: true,
      }).decision,
    ).toBe('create');
  });
});

describe('LATE_OFFLINE and mobile cash', () => {
  it('skips the stable LATE_OFFLINE key and fails extras', () => {
    expect(classifyLateOfflineRerun([]).decision).toBe('create');
    expect(
      classifyLateOfflineRerun([
        { saleSource: 'LATE_OFFLINE', externalRef: RELIABILITY_RERUN_IDS.lateOfflineExternalRef },
      ]).decision,
    ).toBe('skip');
    expect(
      classifyLateOfflineRerun([
        { saleSource: 'LATE_OFFLINE' },
        { saleSource: 'LATE_OFFLINE' },
      ]).decision,
    ).toBe('fail');
  });

  it('skips the one post-close mobile cash sale and fails extras', () => {
    expect(
      classifyMobileCashSaleRerun({ till3CashPaidExcludingLateOffline: 1 }).decision,
    ).toBe('create');
    expect(
      classifyMobileCashSaleRerun({ till3CashPaidExcludingLateOffline: 2 }).decision,
    ).toBe('skip');
    expect(
      classifyMobileCashSaleRerun({ till3CashPaidExcludingLateOffline: 3 }).decision,
    ).toBe('fail');
    expect(
      classifyMobileCashSaleRerun({ till3CashPaidExcludingLateOffline: 0 }).decision,
    ).toBe('fail');
  });
});

describe('shapeless desktop sales', () => {
  it('classifies cash / split / credit by snapshot shape', () => {
    const cash = {
      tillName: 'Till 3',
      saleSource: 'POS',
      paymentStatus: 'PAID',
      methods: ['CASH'],
    };
    const split = {
      tillName: 'Till 3',
      saleSource: 'POS',
      paymentStatus: 'PAID',
      methods: ['CARD', 'CASH'],
    };
    const credit = {
      tillName: 'Till 3',
      saleSource: 'POS',
      paymentStatus: 'UNPAID',
      methods: [],
    };
    expect(isDesktopCashSale(cash)).toBe(true);
    expect(isDesktopCashSale({ ...cash, saleSource: 'LATE_OFFLINE' })).toBe(false);
    expect(isSplitCashCardSale(split)).toBe(true);
    expect(isCreditSale(credit)).toBe(true);
    expect(classifyShapelessSale('split CASH+CARD', 1).decision).toBe('skip');
    expect(classifyShapelessSale('credit UNPAID', 2).decision).toBe('fail');
  });
});

describe('assertRerunDecision', () => {
  it('returns create/skip and throws fail-closed without suggesting deletes', () => {
    expect(assertRerunDecision('opening stock', { decision: 'create', reason: 'missing' })).toBe(
      'create',
    );
    expect(assertRerunDecision('CARD-REL-1', { decision: 'skip', reason: 'present' })).toBe('skip');
    expect(() => assertRerunDecision('CARD-REL-1', { decision: 'fail', reason: '2 duplicates' })).toThrow(
      /Phase 9 blocked at CARD-REL-1: 2 duplicates/,
    );
  });

  it('treats any create as needing a live Till 3 shift', () => {
    expect(
      anyCreatePending([
        { decision: 'skip', reason: 'card' },
        { decision: 'create', reason: 'expense' },
      ]),
    ).toBe(true);
  });
});
