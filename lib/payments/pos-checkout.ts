export type PosPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
export type PosDiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';
export type PosMomoCollectionState = 'IDLE' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'TIMEOUT';

export type PosCheckoutTotals = {
  subtotal: number;
  lineDiscount: number;
  promoDiscount: number;
  netSubtotal: number;
  vat: number;
};

type CalculateCheckoutSummaryParams = {
  totals: PosCheckoutTotals;
  orderDiscountType: PosDiscountType;
  orderDiscountInput: string;
  vatEnabled: boolean;
  discountApprovalThresholdBps?: number | null;
  discountManagerPin?: string;
  discountReasonCode?: string | null;
  discountReason?: string | null;
  paymentMethods: PosPaymentMethod[];
  cashTendered: string;
  cardPaid: string;
  transferPaid: string;
  momoPaid: string;
  momoNetwork: string;
  momoPayerMsisdn: string;
  momoCollectionStatus: PosMomoCollectionState;
};

function hasMethod(paymentMethods: PosPaymentMethod[], method: PosPaymentMethod) {
  return paymentMethods.includes(method);
}

export function parseCurrencyToPence(value: string | undefined | null) {
  if (!value) return 0;
  const trimmed = String(value).replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

export function parsePercent(value: string | undefined | null) {
  if (!value) return 0;
  const trimmed = String(value).replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function computeDiscount(subtotal: number, type?: PosDiscountType, value?: string) {
  if (!subtotal || !type || type === 'NONE') return 0;
  if (type === 'PERCENT') {
    const pct = Math.min(Math.max(parsePercent(value ?? ''), 0), 100);
    return Math.round((subtotal * pct) / 100);
  }
  if (type === 'AMOUNT') {
    const amount = Math.max(parseCurrencyToPence(value ?? ''), 0);
    return Math.min(amount, subtotal);
  }
  return 0;
}

export function calculateCheckoutSummary({
  totals,
  orderDiscountType,
  orderDiscountInput,
  vatEnabled,
  discountApprovalThresholdBps,
  discountManagerPin,
  discountReasonCode,
  discountReason,
  paymentMethods,
  cashTendered,
  cardPaid,
  transferPaid,
  momoPaid,
  momoNetwork,
  momoPayerMsisdn,
  momoCollectionStatus,
}: CalculateCheckoutSummaryParams) {
  const orderDiscount = computeDiscount(
    totals.netSubtotal,
    orderDiscountType,
    orderDiscountInput
  );
  const totalDiscountPence = totals.lineDiscount + totals.promoDiscount + orderDiscount;
  const discountBps =
    totals.subtotal > 0 ? Math.round((totalDiscountPence * 10_000) / totals.subtotal) : 0;
  const requiresDiscountApproval = discountBps > (discountApprovalThresholdBps ?? 1500);
  const discountApprovalReady =
    !requiresDiscountApproval ||
    (!!(discountManagerPin ?? '').trim() && (!!discountReasonCode || !!(discountReason ?? '').trim()));
  const netAfterOrderDiscount = Math.max(totals.netSubtotal - orderDiscount, 0);
  const vatRatio = vatEnabled && totals.netSubtotal > 0
    ? netAfterOrderDiscount / totals.netSubtotal
    : 1;
  const vatTotal = vatEnabled ? Math.round(totals.vat * vatRatio) : 0;
  const totalDue = netAfterOrderDiscount + vatTotal;

  const cashTenderedValue = hasMethod(paymentMethods, 'CASH') ? parseCurrencyToPence(cashTendered) : 0;
  const cardPaidValue = hasMethod(paymentMethods, 'CARD') ? parseCurrencyToPence(cardPaid) : 0;
  const transferPaidValue = hasMethod(paymentMethods, 'TRANSFER') ? parseCurrencyToPence(transferPaid) : 0;
  const momoPaidValue = hasMethod(paymentMethods, 'MOBILE_MONEY') ? parseCurrencyToPence(momoPaid) : 0;
  const nonCashRaw = cardPaidValue + transferPaidValue + momoPaidValue;
  const nonCashOverpay = nonCashRaw > totalDue;
  const nonCashPaid = nonCashRaw;
  const cashDue = Math.max(totalDue - nonCashPaid, 0);
  const cashApplied = Math.min(cashTenderedValue, cashDue);
  const changeDue = Math.max(cashTenderedValue - cashDue, 0);
  const totalPaid = cashApplied + nonCashPaid;
  const balanceRemaining = Math.max(totalDue - totalPaid, 0);
  const momoMethodEnabled = hasMethod(paymentMethods, 'MOBILE_MONEY');
  const needsMomoConfirmation = momoMethodEnabled && momoPaidValue > 0;
  const momoConfirmed = momoCollectionStatus === 'CONFIRMED';
  const momoSignature = `${momoPaidValue}|${momoNetwork}|${momoPayerMsisdn.trim().replace(/\s+/g, '')}`;

  return {
    orderDiscount,
    totalDiscountPence,
    discountBps,
    requiresDiscountApproval,
    discountApprovalReady,
    netAfterOrderDiscount,
    vatTotal,
    totalDue,
    cashTenderedValue,
    cardPaidValue,
    transferPaidValue,
    momoPaidValue,
    nonCashOverpay,
    totalPaid,
    balanceRemaining,
    cashApplied,
    changeDue,
    needsMomoConfirmation,
    momoConfirmed,
    momoSignature,
  };
}