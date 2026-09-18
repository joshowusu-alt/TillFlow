export const HISTORIC_SOURCE_UNAVAILABLE = 'Historic record — source unavailable.';

export type SourceKind =
  | 'SALE'
  | 'PURCHASE'
  | 'SALES_RETURN'
  | 'PURCHASE_RETURN'
  | 'STOCKTAKE'
  | 'ADJUSTMENT'
  | 'ADJUSTMENT_REVERSAL'
  | 'TRANSFER'
  | 'OPENING_STOCK'
  | 'SUPPLIER_PAYMENT'
  | 'EXPENSE_PAYMENT'
  | 'CUSTOMER_RECEIPT'
  | 'UNKNOWN';

export type SourceLinkInput = {
  type?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type SourceLink =
  | { kind: SourceKind; href: string; label: string; historic: false }
  | { kind: SourceKind; href: null; label: typeof HISTORIC_SOURCE_UNAVAILABLE; historic: true };

const SALE_TYPES = new Set(['SALE', 'SALE_AMENDMENT', 'SALE_VOID']);
const SALE_RETURN_TYPES = new Set(['SALE_RETURN', 'SALES_RETURN']);
const PURCHASE_TYPES = new Set(['PURCHASE']);
const PURCHASE_RETURN_TYPES = new Set(['PURCHASE_RETURN']);
const ADJUSTMENT_TYPES = new Set([
  'ADJUSTMENT',
  'ADJUSTMENT_INCREASE',
  'ADJUSTMENT_DECREASE',
]);
const TRANSFER_TYPES = new Set(['TRANSFER', 'TRANSFER_IN', 'TRANSFER_OUT']);

export const SOURCE_LINK_MATRIX: Record<
  Exclude<SourceKind, 'UNKNOWN'>,
  { referenceTypes: readonly string[]; href: (id: string) => string; label: string }
> = {
  SALE: {
    referenceTypes: ['SALES_INVOICE', 'SALE'],
    href: (id) => `/sales/${id}`,
    label: 'View sale',
  },
  PURCHASE: {
    referenceTypes: ['PURCHASE_INVOICE', 'PURCHASE'],
    href: (id) => `/purchases/${id}`,
    label: 'View purchase',
  },
  SALES_RETURN: {
    referenceTypes: ['SALES_RETURN', 'SALE_RETURN'],
    href: (id) => `/sales/return/${id}`,
    label: 'View sales return',
  },
  PURCHASE_RETURN: {
    referenceTypes: ['PURCHASE_RETURN'],
    href: (id) => `/purchases/return/${id}`,
    label: 'View purchase return',
  },
  STOCKTAKE: {
    referenceTypes: ['STOCKTAKE'],
    href: (id) => `/inventory/stocktake?stocktakeId=${encodeURIComponent(id)}`,
    label: 'View stocktake',
  },
  ADJUSTMENT: {
    referenceTypes: ['STOCK_ADJUSTMENT', 'ADJUSTMENT'],
    href: (id) => `/inventory/adjustments?adjustmentId=${encodeURIComponent(id)}`,
    label: 'View adjustment',
  },
  ADJUSTMENT_REVERSAL: {
    referenceTypes: ['STOCK_ADJUSTMENT_REVERSAL', 'ADJUSTMENT_REVERSAL'],
    href: (id) => `/inventory/adjustments?adjustmentId=${encodeURIComponent(id)}`,
    label: 'View reversal',
  },
  TRANSFER: {
    referenceTypes: ['STOCK_TRANSFER', 'TRANSFER'],
    href: (id) => `/transfers?transferId=${encodeURIComponent(id)}`,
    label: 'View transfer',
  },
  OPENING_STOCK: {
    referenceTypes: ['OPENING_STOCK', 'OPENING'],
    href: (id) => `/setup/opening-stock?movementId=${encodeURIComponent(id)}`,
    label: 'View opening stock',
  },
  SUPPLIER_PAYMENT: {
    referenceTypes: ['PURCHASE_PAYMENT', 'SUPPLIER_PAYMENT'],
    href: (id) => `/payments/supplier-payments?paymentId=${encodeURIComponent(id)}`,
    label: 'View supplier payment',
  },
  EXPENSE_PAYMENT: {
    referenceTypes: ['EXPENSE_PAYMENT'],
    href: (id) => `/payments/expense-payments?paymentId=${encodeURIComponent(id)}`,
    label: 'View expense payment',
  },
  CUSTOMER_RECEIPT: {
    referenceTypes: ['CUSTOMER_RECEIPT', 'SALES_PAYMENT'],
    href: (id) => `/sales/${id}`,
    label: 'View customer receipt',
  },
};

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function resolveSourceKind(input: SourceLinkInput): SourceKind {
  const type = normalize(input.type);
  const referenceType = normalize(input.referenceType);

  if (type === 'ADJUSTMENT_REVERSAL' || referenceType.includes('REVERSAL')) {
    return 'ADJUSTMENT_REVERSAL';
  }
  if (SALE_RETURN_TYPES.has(type) || referenceType === 'SALES_RETURN' || referenceType === 'SALE_RETURN') {
    return 'SALES_RETURN';
  }
  if (PURCHASE_RETURN_TYPES.has(type) || referenceType === 'PURCHASE_RETURN') {
    return 'PURCHASE_RETURN';
  }
  if (type === 'STOCKTAKE' || referenceType === 'STOCKTAKE') return 'STOCKTAKE';
  if (type === 'OPENING' || referenceType === 'OPENING' || referenceType === 'OPENING_STOCK') {
    return 'OPENING_STOCK';
  }
  if (TRANSFER_TYPES.has(type) || referenceType.includes('TRANSFER')) return 'TRANSFER';
  if (ADJUSTMENT_TYPES.has(type) || referenceType.includes('ADJUSTMENT')) return 'ADJUSTMENT';
  if (referenceType === 'PURCHASE_PAYMENT' || referenceType === 'SUPPLIER_PAYMENT') {
    return 'SUPPLIER_PAYMENT';
  }
  if (referenceType === 'EXPENSE_PAYMENT') return 'EXPENSE_PAYMENT';
  if (referenceType === 'CUSTOMER_RECEIPT' || referenceType === 'SALES_PAYMENT') {
    return 'CUSTOMER_RECEIPT';
  }
  if (SALE_TYPES.has(type) || referenceType === 'SALES_INVOICE' || referenceType === 'SALE') {
    return 'SALE';
  }
  if (PURCHASE_TYPES.has(type) || referenceType === 'PURCHASE_INVOICE' || referenceType === 'PURCHASE') {
    return 'PURCHASE';
  }
  return 'UNKNOWN';
}

export function resolveSourceLink(input: SourceLinkInput): SourceLink {
  const kind = resolveSourceKind(input);
  const referenceId = input.referenceId?.trim() ?? '';
  if (!referenceId || kind === 'UNKNOWN') {
    return { kind: kind === 'UNKNOWN' ? 'UNKNOWN' : kind, href: null, label: HISTORIC_SOURCE_UNAVAILABLE, historic: true };
  }
  const spec = SOURCE_LINK_MATRIX[kind];
  return {
    kind,
    href: spec.href(referenceId),
    label: spec.label,
    historic: false,
  };
}

export function isSaleAmendmentHref(href: string | null | undefined): boolean {
  return Boolean(href && href.includes('/sales/amend/'));
}
