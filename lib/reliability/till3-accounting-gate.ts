/**
 * Focused Till 3 accounting gate. Proves a completed Till 3 sale posts
 * Payment rows, CASH_SALE drawer, and non-zero shift cash/tender totals.
 * Does not cover import, expenses, refunds, offline, catalogue, or mobile.
 */

export const TILL3_ACCOUNTING_TILL_NAME = 'Till 3';

export const TILL3_ACCOUNTING_REFS = {
  card: 'CARD-REL-T3ACC-1',
  momo: 'MOMO-REL-T3ACC-1',
  transfer: 'BT-REL-T3ACC-1',
} as const;

/** One GH₵5.00 Reliability SKU split across cash + card + MoMo + transfer. */
export const TILL3_ACCOUNTING_SPLIT = {
  cashPence: 100,
  cardPence: 100,
  momoPence: 100,
  transferPence: 200,
  totalPence: 500,
} as const;

export const TILL3_ACCOUNTING_OPEN_FLOAT_PENCE = 10_000;

export type Till3AccountingPayment = {
  method?: string | null;
  amountPence?: number | null;
  reference?: string | null;
};

export type Till3AccountingDrawer = {
  entryType?: string | null;
  amountPence?: number | null;
  tillId?: string | null;
  shiftId?: string | null;
};

export type Till3AccountingInvoice = {
  invoiceId?: string | null;
  tillId?: string | null;
  tillName?: string | null;
  shiftId?: string | null;
  shiftTillId?: string | null;
  saleSource?: string | null;
  totalPence?: number | null;
  expectedCashPence?: number | null;
  cardTotalPence?: number | null;
  transferTotalPence?: number | null;
  momoTotalPence?: number | null;
  payments?: Till3AccountingPayment[];
  drawer?: Till3AccountingDrawer[];
};

export type Till3OpenShiftRow = {
  id?: string | null;
  tillId?: string | null;
  tillName?: string | null;
  status?: string | null;
  openingCashPence?: number | null;
  expectedCashPence?: number | null;
  cardTotalPence?: number | null;
  momoTotalPence?: number | null;
  transferTotalPence?: number | null;
  ownedByCurrentUser?: boolean | null;
  openFloatCount?: number | null;
  salesCount?: number | null;
};

export type Till3AccountingSnapshot = {
  invoices?: Till3AccountingInvoice[];
  sellableProduct?: { name?: string | null; sku?: string | null; qtyOnHandBase?: number | null } | null;
  openShifts?: Till3OpenShiftRow[];
  purchaseInvoiceCount?: number | null;
  saleInvoiceCount?: number | null;
  salesPaymentCount?: number | null;
  cashSaleDrawerCount?: number | null;
  purchaseInvoices?: Array<{
    id?: string | null;
    paymentStatus?: string | null;
    totalPence?: number | null;
    qaTag?: string | null;
  }>;
};

/**
 * Hosted SHA 4728edba error-context.md: still on /shifts closed form after Open Shift click.
 * Real ShiftClient success navigates to /pos?till=, it does not remain on "Shift Active".
 */
export const HOSTED_4728EDBA_TILL3_SHIFT_PAGE = {
  path: '/shifts',
  heading: 'Shift Reconciliation',
  startNewShiftVisible: true,
  shiftActiveVisible: false,
  closeShiftVisible: false,
  till3Selected: true,
  till3HeadingVisible: false,
  openShiftButtonVisible: true,
  openingCashValue: '100',
  recentShiftsEmpty: true,
  openShiftPending: false,
  navigatedToPos: false,
} as const;

export type HostedTill3ShiftPageView = {
  path: string;
  heading: string;
  startNewShiftVisible: boolean;
  shiftActiveVisible: boolean;
  closeShiftVisible: boolean;
  till3Selected: boolean;
  till3HeadingVisible: boolean;
  openShiftButtonVisible: boolean;
  openingCashValue: string;
  recentShiftsEmpty: boolean;
  openShiftPending: boolean;
  navigatedToPos: boolean;
};

export type Till3OpenShiftDefectClass =
  | 'outdated-exact-text-only'
  | 'till-selection'
  | 'open-shift-write'
  | 'redirect-navigation-timing';

export type PersistedTill3OpenShift = {
  state: 'till-3-open' | 'closed' | 'ambiguous';
  shiftId: string | null;
  tillId: string | null;
  openFloatCount: number;
};

function blocked(detail: string): never {
  throw new Error(`Till 3 accounting gate blocked: ${detail}`);
}

export function paymentHits(snapshot: Till3AccountingSnapshot): Till3AccountingPayment[] {
  return (snapshot.invoices ?? []).flatMap((row) => row.payments ?? []);
}

export function findTill3AccountingInvoice(
  snapshot: Till3AccountingSnapshot,
): Till3AccountingInvoice | undefined {
  return (snapshot.invoices ?? []).find((invoice) => {
    if (invoice.tillName !== TILL3_ACCOUNTING_TILL_NAME) return false;
    if (invoice.saleSource === 'LATE_OFFLINE') return false;
    const refs = new Set(
      (invoice.payments ?? []).map((payment) => (payment.reference ?? '').trim()).filter(Boolean),
    );
    return (
      refs.has(TILL3_ACCOUNTING_REFS.card) &&
      refs.has(TILL3_ACCOUNTING_REFS.momo) &&
      refs.has(TILL3_ACCOUNTING_REFS.transfer)
    );
  });
}

function amountFor(invoice: Till3AccountingInvoice, method: string) {
  return (invoice.payments ?? [])
    .filter((payment) => (payment.method ?? '').toUpperCase() === method)
    .reduce((sum, payment) => sum + (payment.amountPence ?? 0), 0);
}

export function formatTill3AccountingTable(invoice: Till3AccountingInvoice) {
  const cashSale = (invoice.drawer ?? [])
    .filter((row) => (row.entryType ?? '').toUpperCase() === 'CASH_SALE')
    .reduce((sum, row) => sum + (row.amountPence ?? 0), 0);
  return [
    'Till 3 accounting snapshot (no PII)',
    `tillName=${invoice.tillName ?? ''} tillMatchesShift=${invoice.tillId === invoice.shiftTillId}`,
    `salePence=${invoice.totalPence ?? 0} cashPence=${amountFor(invoice, 'CASH')} cardPence=${amountFor(invoice, 'CARD')} momoPence=${amountFor(invoice, 'MOBILE_MONEY')} transferPence=${amountFor(invoice, 'TRANSFER')}`,
    `shiftExpectedCashPence=${invoice.expectedCashPence ?? 0} shiftCardPence=${invoice.cardTotalPence ?? 0} shiftMomoPence=${invoice.momoTotalPence ?? 0} shiftTransferPence=${invoice.transferTotalPence ?? 0}`,
    `cashSaleDrawerPence=${cashSale}`,
  ].join('\n');
}

export function classifyPersistedTill3OpenShifts(
  rows: Till3OpenShiftRow[] | null | undefined,
): PersistedTill3OpenShift {
  const open = (rows ?? []).filter((row) => (row.status ?? 'OPEN').toUpperCase() === 'OPEN');
  const unnamed = open.filter((row) => !(row.tillName ?? '').trim());
  if (unnamed.length > 0) {
    return { state: 'ambiguous', shiftId: null, tillId: null, openFloatCount: 0 };
  }
  const till3 = open.filter((row) => (row.tillName ?? '').trim() === TILL3_ACCOUNTING_TILL_NAME);
  if (till3.length > 1) {
    return { state: 'ambiguous', shiftId: null, tillId: null, openFloatCount: 0 };
  }
  if (till3.length === 1) {
    const row = till3[0]!;
    if (row.ownedByCurrentUser === false || !row.id || !row.tillId) {
      return { state: 'ambiguous', shiftId: null, tillId: null, openFloatCount: 0 };
    }
    return {
      state: 'till-3-open',
      shiftId: row.id,
      tillId: row.tillId,
      openFloatCount: row.openFloatCount ?? 1,
    };
  }
  return { state: 'closed', shiftId: null, tillId: null, openFloatCount: 0 };
}

export function classifyHostedTill3OpenShiftFailure(page: HostedTill3ShiftPageView): {
  till3WasSelected: boolean;
  openShiftClickSucceeded: boolean;
  persistedOpenShiftFromUi: boolean;
  visibleWording: 'Start New Shift' | 'Shift Active' | 'POS' | 'ambiguous';
  defectClass: Till3OpenShiftDefectClass;
} {
  const onPos = page.navigatedToPos || page.path.startsWith('/pos');
  const openChrome = page.closeShiftVisible && page.till3HeadingVisible;
  const stillClosedForm =
    page.startNewShiftVisible &&
    page.openShiftButtonVisible &&
    !page.openShiftPending &&
    !onPos &&
    !openChrome;

  if (!page.till3Selected && stillClosedForm) {
    return {
      till3WasSelected: false,
      openShiftClickSucceeded: false,
      persistedOpenShiftFromUi: false,
      visibleWording: 'Start New Shift',
      defectClass: 'till-selection',
    };
  }
  if (onPos || openChrome) {
    return {
      till3WasSelected: page.till3Selected || page.till3HeadingVisible,
      openShiftClickSucceeded: true,
      persistedOpenShiftFromUi: true,
      visibleWording: onPos ? 'POS' : 'Shift Active',
      defectClass: 'outdated-exact-text-only',
    };
  }
  if (stillClosedForm) {
    return {
      till3WasSelected: page.till3Selected,
      openShiftClickSucceeded: false,
      persistedOpenShiftFromUi: false,
      visibleWording: 'Start New Shift',
      defectClass: 'redirect-navigation-timing',
    };
  }
  return {
    till3WasSelected: page.till3Selected,
    openShiftClickSucceeded: false,
    persistedOpenShiftFromUi: false,
    visibleWording: 'ambiguous',
    defectClass: 'open-shift-write',
  };
}

/**
 * Fail closed on the original defect: sale identity present, shift totals still 0.
 */
export function assertTill3AccountingPersisted(snapshot: Till3AccountingSnapshot) {
  const invoice = findTill3AccountingInvoice(snapshot);
  if (!invoice) {
    blocked(
      `no Till 3 invoice with ${TILL3_ACCOUNTING_REFS.card} / ${TILL3_ACCOUNTING_REFS.momo} / ${TILL3_ACCOUNTING_REFS.transfer}.`,
    );
  }
  if (!invoice.tillId) blocked('SalesInvoice.tillId is missing.');
  if (!invoice.shiftId) blocked('SalesInvoice.shiftId is missing.');
  if (invoice.tillName !== TILL3_ACCOUNTING_TILL_NAME) {
    blocked(`SalesInvoice.tillName=${invoice.tillName ?? '(none)'}; expected ${TILL3_ACCOUNTING_TILL_NAME}.`);
  }
  if (invoice.shiftTillId !== invoice.tillId) {
    blocked('SalesInvoice.shiftId does not belong to the Till 3 till.');
  }
  if ((invoice.totalPence ?? 0) !== TILL3_ACCOUNTING_SPLIT.totalPence) {
    blocked(`invoice total ${invoice.totalPence ?? 0}p !== ${TILL3_ACCOUNTING_SPLIT.totalPence}p.`);
  }

  const cashPence = amountFor(invoice, 'CASH');
  const cardPence = amountFor(invoice, 'CARD');
  const momoPence = amountFor(invoice, 'MOBILE_MONEY');
  const transferPence = amountFor(invoice, 'TRANSFER');
  if (cashPence !== TILL3_ACCOUNTING_SPLIT.cashPence) {
    blocked(`CASH payment ${cashPence}p !== ${TILL3_ACCOUNTING_SPLIT.cashPence}p.`);
  }
  if (cardPence !== TILL3_ACCOUNTING_SPLIT.cardPence) {
    blocked(`CARD payment ${cardPence}p !== ${TILL3_ACCOUNTING_SPLIT.cardPence}p.`);
  }
  if (momoPence !== TILL3_ACCOUNTING_SPLIT.momoPence) {
    blocked(`MOBILE_MONEY payment ${momoPence}p !== ${TILL3_ACCOUNTING_SPLIT.momoPence}p.`);
  }
  if (transferPence !== TILL3_ACCOUNTING_SPLIT.transferPence) {
    blocked(`TRANSFER payment ${transferPence}p !== ${TILL3_ACCOUNTING_SPLIT.transferPence}p.`);
  }

  const cashSale = (invoice.drawer ?? []).filter(
    (row) => (row.entryType ?? '').toUpperCase() === 'CASH_SALE',
  );
  const cashSalePence = cashSale.reduce((sum, row) => sum + (row.amountPence ?? 0), 0);
  if (cashSalePence < TILL3_ACCOUNTING_SPLIT.cashPence) {
    blocked(`CASH_SALE CashDrawerEntry on Till 3 shift is ${cashSalePence}p.`);
  }
  for (const entry of cashSale) {
    if (entry.tillId !== invoice.tillId || entry.shiftId !== invoice.shiftId) {
      blocked('CASH_SALE drawer row is not on the Till 3 shift.');
    }
  }

  if ((invoice.cardTotalPence ?? 0) <= 0) {
    blocked('shift cardTotal still 0 after Till 3 card tender.');
  }
  if ((invoice.momoTotalPence ?? 0) <= 0) {
    blocked('shift momoTotal still 0 after Till 3 MoMo tender.');
  }
  if ((invoice.transferTotalPence ?? 0) <= 0) {
    blocked('shift transferTotal still 0 after Till 3 transfer tender.');
  }
  if ((invoice.expectedCashPence ?? 0) <= 0) {
    blocked('shift expectedCash still 0 after Till 3 cash tender.');
  }
  if ((invoice.expectedCashPence ?? 0) < TILL3_ACCOUNTING_SPLIT.cashPence) {
    blocked(
      `shift expectedCash ${invoice.expectedCashPence ?? 0}p does not include the Till 3 cash tender.`,
    );
  }

  return invoice;
}
