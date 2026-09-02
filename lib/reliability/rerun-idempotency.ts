/**
 * Phase 9 rerun / financial idempotency — fail-closed classifiers.
 *
 * Pure helpers. Do not delete records. Do not run hosted Phase 9 from here.
 * Journey must skip before submitting UI: client money keys are random UUIDs
 * per page load, so server MoneyIdempotency will not replay a Playwright rerun.
 */

export const RELIABILITY_RERUN_IDS = {
  cardRef: 'CARD-REL-1',
  momoRef: 'MOMO-REL-1',
  transferRef: 'BT-REL-1',
  till3AccCardRef: 'CARD-REL-T3ACC-1',
  till3AccMomoRef: 'MOMO-REL-T3ACC-1',
  till3AccTransferRef: 'BT-REL-T3ACC-1',
  /** Proposed split-tender card leg. Journey does not stamp this today. */
  splitCardRef: 'CARD-REL-SPLIT-1',
  expenseRef: 'REL-EXP-1',
  expenseVendor: 'REL-EXPENSE-1',
  supplierNotes: 'REL-SUP-1',
  customerReceiptIdentity: 'REL-AR-1',
  lateOfflineKey: 'REL-LATE-OFF-1',
  lateOfflineExternalRef: 'OFFLINE_SYNC:REL-LATE-OFF-1',
  openingQtyBase: 1,
  openingCostPence: 200,
  expenseAmountPence: 100,
  supplierPaymentPence: 100,
  customerReceiptPence: 100,
  desktopOpenFloatPence: 10_000,
  lateOfflineReopenFloatPence: 5_000,
  mobileOpenFloatPence: 2_000,
} as const;

export type RerunDecision = 'create' | 'skip' | 'fail';

export type RerunVerdict = {
  decision: RerunDecision;
  reason: string;
};

export type UniqueRefHit = {
  reference: string | null | undefined;
};

export type OpeningMovementHit = {
  productMatchesQa: boolean;
  qtyBase: number;
  type?: string | null;
  referenceType?: string | null;
};

export type Till3ShiftUiState = 'till-3-open' | 'other-till-open' | 'closed';

export type CashSaleShapeHit = {
  tillName?: string | null;
  saleSource?: string | null;
  paymentStatus?: string | null;
  methods: string[];
  returned?: boolean;
};

export type LateOfflineHit = {
  saleSource?: string | null;
  externalRef?: string | null;
};

function fail(reason: string): RerunVerdict {
  return { decision: 'fail', reason };
}

function skip(reason: string): RerunVerdict {
  return { decision: 'skip', reason };
}

function create(reason: string): RerunVerdict {
  return { decision: 'create', reason };
}

/** 0 → create, 1 → skip, extras or duplicates → fail. Never delete. */
export function classifyUniqueIdentity(
  identity: string,
  matchCount: number,
  extraCount = 0,
): RerunVerdict {
  if (matchCount < 0 || extraCount < 0) {
    return fail(`${identity}: snapshot counts are invalid`);
  }
  if (extraCount > 0) {
    return fail(`${identity}: ${extraCount} unexpected extra row(s)`);
  }
  if (matchCount === 0) return create(`${identity}: missing`);
  if (matchCount === 1) return skip(`${identity}: already present`);
  return fail(`${identity}: ${matchCount} unexpected duplicates`);
}

export function countExactRefs(hits: UniqueRefHit[], expected: string) {
  return hits.filter((hit) => (hit.reference ?? '').trim() === expected).length;
}

/**
 * CARD-REL-1 / MOMO-REL-1 / BT-REL-1: skip the completed unique ref;
 * fail if that ref appears more than once.
 */
export function classifyTenderRef(hits: UniqueRefHit[], expectedRef: string): RerunVerdict {
  return classifyUniqueIdentity(expectedRef, countExactRefs(hits, expectedRef));
}

/**
 * Opening stock: reuse if the QA product already has exactly one opening
 * movement at the expected qty. Fail on extra capital or extra opening stock.
 * Cost on that single line may differ (empty-SKU leftover product).
 */
export function classifyOpeningStockRerun(input: {
  movements: OpeningMovementHit[];
  openingCapitalPence: number;
  expectedQtyBase?: number;
}): RerunVerdict {
  const expectedQty = input.expectedQtyBase ?? RELIABILITY_RERUN_IDS.openingQtyBase;
  const opening = input.movements.filter((row) => {
    const type = (row.type ?? 'OPENING').toUpperCase();
    const refType = (row.referenceType ?? 'OPENING_BALANCE_INVENTORY').toUpperCase();
    return type === 'OPENING' || refType === 'OPENING_BALANCE_INVENTORY';
  });
  const qa = opening.filter((row) => row.productMatchesQa);
  const extras = opening.filter((row) => !row.productMatchesQa);

  if (extras.length > 0) {
    return fail(`opening stock: ${extras.length} extra opening movement(s) not for the QA product`);
  }
  if ((input.openingCapitalPence ?? 0) > 0) {
    return fail(
      `opening stock: conflicting extra capital ${input.openingCapitalPence}p (journey must not write cash capital)`,
    );
  }
  if (qa.length === 0) {
    return create('opening stock: QA product has no opening movement');
  }
  if (qa.length > 1) {
    return fail(`opening stock: ${qa.length} opening movements for the QA product`);
  }
  if (qa[0]!.qtyBase !== expectedQty) {
    return fail(
      `opening stock: QA product qty ${qa[0]!.qtyBase} conflicts with expected ${expectedQty}`,
    );
  }
  return skip('opening stock: QA product already recorded');
}

/**
 * Till 3 open / OPEN_FLOAT: never double-open float.
 * If no downstream create needs a live shift, skip opening a new one.
 */
export function classifyTill3DrawerOpenRerun(input: {
  shiftState: Till3ShiftUiState;
  needsOpenShift: boolean;
  openFloatCountOnCurrentShift?: number;
}): RerunVerdict {
  if (input.shiftState === 'other-till-open') {
    return fail('open Till 3: another till is already open');
  }
  if (input.shiftState === 'till-3-open') {
    const floats = input.openFloatCountOnCurrentShift ?? 1;
    if (floats > 1) {
      return fail(`open Till 3: current shift has ${floats} OPEN_FLOAT rows`);
    }
    return skip('open Till 3: already open — do not add another OPEN_FLOAT');
  }
  if (!input.needsOpenShift) {
    return skip('open Till 3: closed and no pending mutation needs a live shift');
  }
  return create('open Till 3: closed and a live shift is required');
}

export function anyCreatePending(verdicts: RerunVerdict[]) {
  return verdicts.some((row) => row.decision === 'create');
}

export function classifyLateOfflineRerun(
  hits: LateOfflineHit[],
  expectedKey = RELIABILITY_RERUN_IDS.lateOfflineKey,
): RerunVerdict {
  const expectedRef = `OFFLINE_SYNC:${expectedKey}`;
  const matches = hits.filter(
    (row) =>
      row.saleSource === 'LATE_OFFLINE' ||
      (row.externalRef ?? '') === expectedRef ||
      (row.externalRef ?? '') === expectedKey,
  );
  return classifyUniqueIdentity('LATE_OFFLINE', matches.length);
}

export function isDesktopCashSale(row: CashSaleShapeHit) {
  if (row.tillName !== 'Till 3') return false;
  if (row.saleSource === 'LATE_OFFLINE') return false;
  if (row.paymentStatus && row.paymentStatus !== 'PAID') return false;
  if (row.returned) return false;
  return row.methods.length === 1 && row.methods[0] === 'CASH';
}

export function isSplitCashCardSale(row: CashSaleShapeHit) {
  if (row.tillName !== 'Till 3') return false;
  if (row.saleSource === 'LATE_OFFLINE') return false;
  const methods = [...row.methods].sort();
  return methods.length === 2 && methods[0] === 'CARD' && methods[1] === 'CASH';
}

export function isCreditSale(row: CashSaleShapeHit) {
  if (row.tillName !== 'Till 3') return false;
  if (row.saleSource === 'LATE_OFFLINE') return false;
  return row.paymentStatus === 'UNPAID' || row.paymentStatus === 'PART_PAID';
}

/**
 * Desktop cash (no payment ref today): exactly one Till 3 cash-only PAID
 * non-LATE_OFFLINE invoice, not counting the mobile cash sale.
 * Call with desktop-only hits, or pass mobileCount separately.
 */
export function classifyShapelessSale(
  identity: string,
  matchCount: number,
  extraCount = 0,
): RerunVerdict {
  return classifyUniqueIdentity(identity, matchCount, extraCount);
}

/**
 * Mobile: one cash sale after desktop close.
 * Expected: exactly one extra Till 3 cash-only PAID vs the desktop cash sale.
 */
export function classifyMobileCashSaleRerun(input: {
  till3CashPaidExcludingLateOffline: number;
  desktopCashExpected?: number;
}): RerunVerdict {
  const desktopExpected = input.desktopCashExpected ?? 1;
  const total = input.till3CashPaidExcludingLateOffline;
  if (total < desktopExpected) {
    return fail(
      `mobile cash: ${total} Till 3 cash sale(s) but desktop cash is not present yet`,
    );
  }
  const mobileCount = total - desktopExpected;
  return classifyUniqueIdentity('mobile cash REL-MOBILE-1', mobileCount);
}

export function assertRerunDecision(step: string, verdict: RerunVerdict): 'create' | 'skip' {
  if (verdict.decision === 'fail') {
    throw new Error(`Phase 9 blocked at ${step}: ${verdict.reason}`);
  }
  return verdict.decision;
}
