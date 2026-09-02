/**
 * Focused Till 3 accounting EVIDENCE gate.
 * Proves the already-persisted INV-000001 / T3ACC split sale on Till 3.
 * Never sells, pays, restocks, opens/closes a shift, or provisions an owner.
 */

import {
  RELIABILITY_PREVIEW_QA_BUSINESS_NAME,
  RELIABILITY_PREVIEW_QA_TAG,
} from './preview-qa-tag';

export const TILL3_ACCOUNTING_TILL_NAME = 'Till 3';
export const TILL3_ACCOUNTING_TXN = 'INV-000001';
export const TILL3_ACCOUNTING_INVOICE_ID = 'cmtj3u47r000210vs057wpm6i';

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
  id?: string | null;
  method?: string | null;
  amountPence?: number | null;
  reference?: string | null;
  invoiceId?: string | null;
};

export type Till3AccountingDrawer = {
  id?: string | null;
  entryType?: string | null;
  amountPence?: number | null;
  tillId?: string | null;
  shiftId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type Till3AccountingInvoice = {
  invoiceId?: string | null;
  transactionNumber?: string | null;
  paymentStatus?: string | null;
  tillId?: string | null;
  tillName?: string | null;
  shiftId?: string | null;
  shiftTillId?: string | null;
  shiftStatus?: string | null;
  shiftOpenedAt?: string | Date | null;
  saleSource?: string | null;
  totalPence?: number | null;
  openingCashPence?: number | null;
  expectedCashPence?: number | null;
  cardTotalPence?: number | null;
  transferTotalPence?: number | null;
  momoTotalPence?: number | null;
  payments?: Till3AccountingPayment[];
  drawer?: Till3AccountingDrawer[];
  stockMovements?: Array<{ id?: string | null; productId?: string | null; qtyBase?: number | null }>;
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
  openedAt?: string | Date | null;
};

export type Till3AccountingSnapshot = {
  businessId?: string | null;
  businessName?: string | null;
  userRole?: string | null;
  userQaTag?: string | null;
  invoices?: Till3AccountingInvoice[];
  sellableProduct?: { name?: string | null; sku?: string | null; qtyOnHandBase?: number | null } | null;
  openShifts?: Till3OpenShiftRow[];
  purchaseInvoiceCount?: number | null;
  saleInvoiceCount?: number | null;
  salesPaymentCount?: number | null;
  cashSaleDrawerCount?: number | null;
  productCount?: number | null;
  moneyIdempotency?: Array<{ commandKind?: string | null; createdAt?: string | Date | null }>;
  expenses?: Array<{ reference?: string | null; amountPence?: number | null }>;
  openingMovements?: Array<{ qtyBase?: number | null; productSku?: string | null }>;
  productImports?: Array<{ id?: string | null; status?: string | null; rowsImported?: number | null }>;
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

export type Till3PosTillDefectClass =
  | 'checkout-extras-not-ready'
  | 'hidden-or-duplicated-controls'
  | 'wrong-locator'
  | 'till3-already-bound'
  | 'stale-pos-state'
  | 'till-selection-defect';

/**
 * Hosted SHA 0dfa476b error-context.md: genuine POS, barcode/cart ready,
 * unique Till combobox still disabled on the loading placeholder.
 */
export const HOSTED_0DFA476B_POS_TILL_PAGE = {
  path: '/pos',
  barcodeVisible: true,
  cartClearVisible: true,
  visibleTillSelectCount: 1,
  tillComboboxName: 'Till',
  tillDisabled: true,
  tillOptions: ['Preparing checkout…'],
  selectedOptionText: 'Preparing checkout…',
  till3OptionCount: 0,
  checkoutTillState: 'loading',
  completeSaleDisabled: true,
  urlTillId: null,
  selectedTillId: '',
  selectedShiftId: '',
} as const;

/**
 * Hosted SHA 4a36d522 error-context.md: sale completed on Till 3.
 * Both "Sale Complete!" and "Ready for next customer" were visible;
 * Playwright strict mode failed getByText(/Sale Complete|Ready for next customer/i).
 */
export const HOSTED_4A36D522_SALE_COMPLETE_PAGE = {
  path: '/pos',
  saleCompleteVisible: true,
  readyForNextVisible: true,
  usedCombinedRegex: true,
  usedSaleCompleteTestId: false,
  invoiceNumber: TILL3_ACCOUNTING_TXN,
  receiptId: TILL3_ACCOUNTING_INVOICE_ID,
  totalDisplay: 'GH₵5.00',
  till3Selected: true,
} as const;

export const HOSTED_MISSING_BUSINESS_TYPE_PICKER = {
  pickerCount: 0,
  selectedValue: '',
  editVisible: false,
} as const;

export function classifyExistingOwnerOnboarding(input: {
  pickerCount: number;
  selectedValue: string;
  editVisible: boolean;
}): 'already-complete' | 'must-not-provision' {
  if (input.editVisible && input.pickerCount === 0) return 'already-complete';
  return 'must-not-provision';
}

export type HostedTill3PosTillPage = {
  path: string;
  barcodeVisible: boolean;
  cartClearVisible: boolean;
  visibleTillSelectCount: number;
  tillComboboxName: string;
  tillDisabled: boolean;
  tillOptions: readonly string[];
  selectedOptionText: string;
  till3OptionCount: number;
  checkoutTillState: string;
  completeSaleDisabled: boolean;
  urlTillId: string | null;
  selectedTillId: string;
  selectedShiftId: string;
};

export type PosTillBindingView = {
  persistedShiftId: string;
  persistedTillId: string;
  urlTillId: string | null;
  selectedTillId: string;
  selectedShiftId: string;
  checkoutTillState: string | null;
  visibleTillSelectCount: number;
  till3OptionCount: number;
  selectedOptionText: string;
};

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

export function findTill3AccountingInvoices(
  snapshot: Till3AccountingSnapshot,
): Till3AccountingInvoice[] {
  return (snapshot.invoices ?? []).filter((invoice) => {
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

export function findTill3AccountingInvoice(
  snapshot: Till3AccountingSnapshot,
): Till3AccountingInvoice | undefined {
  const hits = findTill3AccountingInvoices(snapshot);
  return hits.length === 1 ? hits[0] : undefined;
}

export function requireUniqueTill3AccountingInvoice(snapshot: Till3AccountingSnapshot) {
  const hits = findTill3AccountingInvoices(snapshot);
  if (hits.length === 0) {
    blocked(
      `no Till 3 invoice with ${TILL3_ACCOUNTING_REFS.card} / ${TILL3_ACCOUNTING_REFS.momo} / ${TILL3_ACCOUNTING_REFS.transfer}.`,
    );
  }
  if (hits.length > 1) {
    blocked(`duplicate Till 3 T3ACC invoices (${hits.length}); fail closed.`);
  }
  return hits[0]!;
}

function amountFor(invoice: Till3AccountingInvoice, method: string) {
  return (invoice.payments ?? [])
    .filter((payment) => (payment.method ?? '').toUpperCase() === method)
    .reduce((sum, payment) => sum + (payment.amountPence ?? 0), 0);
}

export function cashSaleDrawerRows(invoice: Till3AccountingInvoice) {
  return (invoice.drawer ?? []).filter((row) => {
    if ((row.entryType ?? '').toUpperCase() !== 'CASH_SALE') return false;
    if (row.shiftId !== invoice.shiftId || row.tillId !== invoice.tillId) return false;
    if (invoice.invoiceId && row.referenceId !== invoice.invoiceId) return false;
    return true;
  });
}

function requireUniquePaymentRef(snapshot: Till3AccountingSnapshot, ref: string) {
  const hits = paymentHits(snapshot).filter((payment) => (payment.reference ?? '').trim() === ref);
  if (hits.length === 0) blocked(`no payment row for ${ref}.`);
  if (hits.length > 1) blocked(`duplicate payment rows for ${ref} (${hits.length}); fail closed.`);
  return hits[0]!;
}

export function formatTill3AccountingTable(invoice: Till3AccountingInvoice) {
  const cashSale = cashSaleDrawerRows(invoice).reduce((sum, row) => sum + (row.amountPence ?? 0), 0);
  const opening = invoice.openingCashPence ?? 0;
  const cashPence = amountFor(invoice, 'CASH');
  const paymentLines = (invoice.payments ?? []).map(
    (payment) =>
      `payment method=${payment.method ?? ''} amountPence=${payment.amountPence ?? 0} reference=${payment.reference ?? ''} invoiceId=${payment.invoiceId ?? invoice.invoiceId ?? ''}`,
  );
  return [
    'Till 3 accounting snapshot (no PII)',
    `invoiceId=${invoice.invoiceId ?? ''} txn=${invoice.transactionNumber ?? ''} status=${invoice.paymentStatus ?? ''}`,
    `tillName=${invoice.tillName ?? ''} tillId=${invoice.tillId ?? ''} tillMatchesShift=${invoice.tillId === invoice.shiftTillId}`,
    `shiftId=${invoice.shiftId ?? ''} shiftStatus=${invoice.shiftStatus ?? ''} openedAt=${invoice.shiftOpenedAt ?? ''}`,
    `salePence=${invoice.totalPence ?? 0} cashPence=${cashPence} cardPence=${amountFor(invoice, 'CARD')} momoPence=${amountFor(invoice, 'MOBILE_MONEY')} transferPence=${amountFor(invoice, 'TRANSFER')}`,
    ...paymentLines,
    `openingCashPence=${opening} cashSaleDrawerPence=${cashSale} expectedCashPence=${invoice.expectedCashPence ?? 0} expectedCashFormula=${opening + cashSale}`,
    `shiftExpectedCashPence=${invoice.expectedCashPence ?? 0} shiftCardPence=${invoice.cardTotalPence ?? 0} shiftMomoPence=${invoice.momoTotalPence ?? 0} shiftTransferPence=${invoice.transferTotalPence ?? 0}`,
  ].join('\n');
}

export function classifySaleCompleteStrictLocator(input: {
  saleCompleteVisible: boolean;
  readyForNextVisible: boolean;
  usedCombinedRegex: boolean;
  usedSaleCompleteTestId: boolean;
}): 'strict-mode-violation' | 'unique-complete' | 'missing' {
  if (input.usedCombinedRegex && input.saleCompleteVisible && input.readyForNextVisible) {
    return 'strict-mode-violation';
  }
  if (input.usedSaleCompleteTestId && input.saleCompleteVisible) return 'unique-complete';
  if (!input.saleCompleteVisible && !input.readyForNextVisible) return 'missing';
  return 'unique-complete';
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

export function classifyHostedTill3PosTillBinding(page: HostedTill3PosTillPage): {
  isPosPage: boolean;
  till3OptionPresent: boolean;
  defectClass: Till3PosTillDefectClass;
} {
  const isPosPage = page.path === '/pos' || page.path.startsWith('/pos/') || page.barcodeVisible;
  const till3OptionPresent = page.till3OptionCount === 1;
  if (!isPosPage) {
    return { isPosPage: false, till3OptionPresent, defectClass: 'stale-pos-state' };
  }
  if (page.visibleTillSelectCount > 1) {
    return { isPosPage: true, till3OptionPresent, defectClass: 'hidden-or-duplicated-controls' };
  }
  if (
    page.checkoutTillState === 'loading' ||
    page.selectedOptionText === 'Preparing checkout…' ||
    page.tillOptions.includes('Preparing checkout…')
  ) {
    return { isPosPage: true, till3OptionPresent: false, defectClass: 'checkout-extras-not-ready' };
  }
  if (page.till3OptionCount === 0 && page.selectedTillId && page.selectedShiftId) {
    return { isPosPage: true, till3OptionPresent: false, defectClass: 'till3-already-bound' };
  }
  if (page.till3OptionCount === 0) {
    return { isPosPage: true, till3OptionPresent: false, defectClass: 'wrong-locator' };
  }
  if (page.till3OptionCount > 1) {
    return { isPosPage: true, till3OptionPresent: true, defectClass: 'hidden-or-duplicated-controls' };
  }
  if (page.selectedTillId && page.selectedTillId !== page.urlTillId && !page.urlTillId) {
    return { isPosPage: true, till3OptionPresent, defectClass: 'stale-pos-state' };
  }
  return { isPosPage: true, till3OptionPresent, defectClass: 'till-selection-defect' };
}

export function assertPosBoundToPersistedTill3(view: PosTillBindingView) {
  if (!view.persistedShiftId || !view.persistedTillId) {
    blocked('persisted Till 3 shift identity is incomplete.');
  }
  if (view.visibleTillSelectCount !== 1) {
    blocked(`POS till control visible=${view.visibleTillSelectCount}; expected exactly one.`);
  }
  if (view.checkoutTillState === 'loading' || view.selectedOptionText === 'Preparing checkout…') {
    blocked('POS checkout extras are still loading; Till 3 is not selectable yet.');
  }
  if (view.checkoutTillState !== 'ready') {
    blocked(`POS till state=${view.checkoutTillState ?? '(none)'}; expected ready on the persisted Till 3 shift.`);
  }
  if (view.urlTillId !== view.persistedTillId) {
    blocked(`POS URL till=${view.urlTillId ?? '(none)'} !== persisted ${view.persistedTillId}.`);
  }
  if (view.selectedTillId !== view.persistedTillId) {
    blocked(`POS selected till=${view.selectedTillId || '(none)'} !== persisted ${view.persistedTillId}.`);
  }
  if (view.selectedShiftId !== view.persistedShiftId) {
    blocked(`POS selected shift=${view.selectedShiftId || '(none)'} !== persisted ${view.persistedShiftId}.`);
  }
  if (view.till3OptionCount !== 1) {
    blocked(`POS Till 3 option count=${view.till3OptionCount}; expected exactly one in the unique till select.`);
  }
  return view;
}

/**
 * Fail closed on the original defect: sale identity present, shift totals still 0.
 */
export function assertReliabilityPreviewQaTenant(snapshot: Till3AccountingSnapshot) {
  if ((snapshot.businessName ?? '').trim() !== RELIABILITY_PREVIEW_QA_BUSINESS_NAME) {
    blocked(
      `tenant businessName=${snapshot.businessName ?? '(none)'}; expected ${RELIABILITY_PREVIEW_QA_BUSINESS_NAME}.`,
    );
  }
  if ((snapshot.userRole ?? '') !== 'OWNER') {
    blocked(`tenant role=${snapshot.userRole ?? '(none)'}; expected OWNER.`);
  }
  if ((snapshot.userQaTag ?? '') !== RELIABILITY_PREVIEW_QA_TAG) {
    blocked(`tenant qaTag=${snapshot.userQaTag ?? '(none)'}; expected ${RELIABILITY_PREVIEW_QA_TAG}.`);
  }
  return snapshot;
}

export function fingerprintTill3Evidence(snapshot: Till3AccountingSnapshot) {
  return JSON.stringify({
    businessName: snapshot.businessName ?? '',
    userRole: snapshot.userRole ?? '',
    userQaTag: snapshot.userQaTag ?? '',
    productCount: snapshot.productCount ?? 0,
    purchaseInvoiceCount: snapshot.purchaseInvoiceCount ?? 0,
    saleInvoiceCount: snapshot.saleInvoiceCount ?? 0,
    salesPaymentCount: snapshot.salesPaymentCount ?? 0,
    cashSaleDrawerCount: snapshot.cashSaleDrawerCount ?? 0,
    sellableSku: snapshot.sellableProduct?.sku ?? '',
    sellableQty: snapshot.sellableProduct?.qtyOnHandBase ?? 0,
    invoices: [...(snapshot.invoices ?? [])]
      .map((invoice) => ({
        invoiceId: invoice.invoiceId ?? '',
        txn: invoice.transactionNumber ?? '',
        totalPence: invoice.totalPence ?? 0,
        tillId: invoice.tillId ?? '',
        shiftId: invoice.shiftId ?? '',
        expectedCashPence: invoice.expectedCashPence ?? 0,
        cardTotalPence: invoice.cardTotalPence ?? 0,
        momoTotalPence: invoice.momoTotalPence ?? 0,
        transferTotalPence: invoice.transferTotalPence ?? 0,
        payments: [...(invoice.payments ?? [])]
          .map((row) => `${row.method}:${row.amountPence}:${row.reference ?? ''}:${row.invoiceId ?? ''}`)
          .sort(),
        drawer: [...(invoice.drawer ?? [])]
          .map((row) => `${row.entryType}:${row.amountPence}:${row.shiftId ?? ''}:${row.referenceId ?? ''}`)
          .sort(),
        stock: [...(invoice.stockMovements ?? [])]
          .map((row) => `${row.id ?? ''}:${row.productId ?? ''}:${row.qtyBase ?? 0}`)
          .sort(),
      }))
      .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId)),
    openShifts: [...(snapshot.openShifts ?? [])]
      .map((row) => ({
        id: row.id ?? '',
        tillId: row.tillId ?? '',
        tillName: row.tillName ?? '',
        status: row.status ?? '',
        expectedCashPence: row.expectedCashPence ?? 0,
        cardTotalPence: row.cardTotalPence ?? 0,
        momoTotalPence: row.momoTotalPence ?? 0,
        transferTotalPence: row.transferTotalPence ?? 0,
        salesCount: row.salesCount ?? 0,
        openedAt: String(row.openedAt ?? ''),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    money: [...(snapshot.moneyIdempotency ?? [])].map((row) => `${row.commandKind}:${row.createdAt ?? ''}`),
    expenses: [...(snapshot.expenses ?? [])].map((row) => `${row.reference ?? ''}:${row.amountPence ?? 0}`).sort(),
    openingMovements: [...(snapshot.openingMovements ?? [])]
      .map((row) => `${row.productSku ?? ''}:${row.qtyBase ?? 0}`)
      .sort(),
    productImports: [...(snapshot.productImports ?? [])]
      .map((row) => `${row.id ?? ''}:${row.status ?? ''}:${row.rowsImported ?? 0}`)
      .sort(),
    purchases: [...(snapshot.purchaseInvoices ?? [])]
      .map((row) => `${row.id ?? ''}:${row.paymentStatus ?? ''}:${row.totalPence ?? 0}`)
      .sort(),
  });
}

export function assertTill3AccountingNoWrites(
  before: Till3AccountingSnapshot,
  after: Till3AccountingSnapshot,
) {
  const left = fingerprintTill3Evidence(before);
  const right = fingerprintTill3Evidence(after);
  if (left !== right) {
    blocked('before/after reliability snapshots differ; evidence-only run performed a write.');
  }
}

export function assertTill3AccountingPersisted(snapshot: Till3AccountingSnapshot) {
  const cardRow = requireUniquePaymentRef(snapshot, TILL3_ACCOUNTING_REFS.card);
  const momoRow = requireUniquePaymentRef(snapshot, TILL3_ACCOUNTING_REFS.momo);
  const transferRow = requireUniquePaymentRef(snapshot, TILL3_ACCOUNTING_REFS.transfer);
  const invoice = requireUniqueTill3AccountingInvoice(snapshot);
  if ((invoice.transactionNumber ?? '') !== TILL3_ACCOUNTING_TXN) {
    blocked(`invoice txn=${invoice.transactionNumber ?? '(none)'}; expected ${TILL3_ACCOUNTING_TXN}.`);
  }
  if ((invoice.invoiceId ?? '') !== TILL3_ACCOUNTING_INVOICE_ID) {
    blocked(`invoiceId=${invoice.invoiceId ?? '(none)'}; expected hosted ${TILL3_ACCOUNTING_INVOICE_ID}.`);
  }
  if ((invoice.paymentStatus ?? '') !== 'PAID') {
    blocked(`invoice paymentStatus=${invoice.paymentStatus ?? '(none)'}; expected PAID.`);
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
  for (const row of [cardRow, momoRow, transferRow]) {
    if (row.invoiceId && invoice.invoiceId && row.invoiceId !== invoice.invoiceId) {
      blocked(`payment ${row.reference ?? ''} invoiceId does not match the unique T3ACC invoice.`);
    }
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

  const cashSale = cashSaleDrawerRows(invoice);
  if (cashSale.length !== 1) {
    blocked(`CASH_SALE CashDrawerEntry rows for the Till 3 invoice=${cashSale.length}; fail closed.`);
  }
  const cashSalePence = cashSale[0]!.amountPence ?? 0;
  if (cashSalePence !== TILL3_ACCOUNTING_SPLIT.cashPence) {
    blocked(`CASH_SALE CashDrawerEntry on Till 3 shift is ${cashSalePence}p.`);
  }
  if (cashSale[0]!.tillId !== invoice.tillId || cashSale[0]!.shiftId !== invoice.shiftId) {
    blocked('CASH_SALE drawer row is not on the Till 3 shift.');
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
  if ((invoice.cardTotalPence ?? 0) !== cardPence) {
    blocked(`shift cardTotal ${invoice.cardTotalPence ?? 0}p !== invoice CARD ${cardPence}p.`);
  }
  if ((invoice.momoTotalPence ?? 0) !== momoPence) {
    blocked(`shift momoTotal ${invoice.momoTotalPence ?? 0}p !== invoice MOBILE_MONEY ${momoPence}p.`);
  }
  if ((invoice.transferTotalPence ?? 0) !== transferPence) {
    blocked(`shift transferTotal ${invoice.transferTotalPence ?? 0}p !== invoice TRANSFER ${transferPence}p.`);
  }
  if (invoice.openingCashPence != null) {
    const expectedFromOpenAndCash = invoice.openingCashPence + cashSalePence;
    if ((invoice.expectedCashPence ?? 0) !== expectedFromOpenAndCash) {
      blocked(
        `shift expectedCash ${invoice.expectedCashPence ?? 0}p !== opening ${invoice.openingCashPence}p + CASH_SALE ${cashSalePence}p.`,
      );
    }
  } else if ((invoice.expectedCashPence ?? 0) < TILL3_ACCOUNTING_SPLIT.cashPence) {
    blocked(
      `shift expectedCash ${invoice.expectedCashPence ?? 0}p does not include the Till 3 cash tender.`,
    );
  }

  return invoice;
}
