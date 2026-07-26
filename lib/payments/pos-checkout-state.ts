import type { PosPaymentMethod } from '@/lib/payments/pos-checkout';

export type PosPaymentStatus = 'PAID' | 'PART_PAID' | 'UNPAID';
export type DueDateDecision = 'unset' | 'none' | 'date';

export const POS_QUICK_CASH_DENOMINATIONS_GHS = [1, 5, 10, 20, 50, 100, 200] as const;

export function paymentMethodLabel(method: PosPaymentMethod): string {
  switch (method) {
    case 'CASH':
      return 'Cash';
    case 'CARD':
      return 'Card';
    case 'TRANSFER':
      return 'Bank Transfer';
    case 'MOBILE_MONEY':
      return 'MoMo';
    default:
      return method;
  }
}

export function isSingleMethod(
  methods: PosPaymentMethod[],
  method: PosPaymentMethod,
): boolean {
  return methods.length === 1 && methods[0] === method;
}

export function isCashOnly(methods: PosPaymentMethod[]): boolean {
  return isSingleMethod(methods, 'CASH');
}

export type TenderDefaultsInput = {
  paymentStatus: PosPaymentStatus;
  paymentMethods: PosPaymentMethod[];
  totalDuePence: number;
  cashTendered: string;
  cardPaid: string;
  transferPaid: string;
  momoPaid: string;
};

/**
 * For Paid single-method sales, empty amount fields imply the full total.
 * Explicit cashier entry still wins.
 */
export function applyPaidSingleMethodDefaults(input: TenderDefaultsInput): {
  cashTendered: string;
  cardPaid: string;
  transferPaid: string;
  momoPaid: string;
  usedExactCashDefault: boolean;
} {
  const totalUnits = (input.totalDuePence / 100).toFixed(2);
  if (input.paymentStatus !== 'PAID' || input.paymentMethods.length !== 1) {
    return {
      cashTendered: input.cashTendered,
      cardPaid: input.cardPaid,
      transferPaid: input.transferPaid,
      momoPaid: input.momoPaid,
      usedExactCashDefault: false,
    };
  }

  const method = input.paymentMethods[0];
  if (method === 'CASH' && !input.cashTendered.trim()) {
    return {
      cashTendered: totalUnits,
      cardPaid: '',
      transferPaid: '',
      momoPaid: '',
      usedExactCashDefault: true,
    };
  }
  if (method === 'CARD' && !input.cardPaid.trim()) {
    return {
      cashTendered: '',
      cardPaid: totalUnits,
      transferPaid: '',
      momoPaid: '',
      usedExactCashDefault: false,
    };
  }
  if (method === 'TRANSFER' && !input.transferPaid.trim()) {
    return {
      cashTendered: '',
      cardPaid: '',
      transferPaid: totalUnits,
      momoPaid: '',
      usedExactCashDefault: false,
    };
  }
  if (method === 'MOBILE_MONEY' && !input.momoPaid.trim()) {
    return {
      cashTendered: '',
      cardPaid: '',
      transferPaid: '',
      momoPaid: totalUnits,
      usedExactCashDefault: false,
    };
  }

  return {
    cashTendered: input.cashTendered,
    cardPaid: input.cardPaid,
    transferPaid: input.transferPaid,
    momoPaid: input.momoPaid,
    usedExactCashDefault: false,
  };
}

export function resolveDueDateForSubmit(input: {
  paymentStatus: PosPaymentStatus;
  dueDateDecision: DueDateDecision;
  dueDate: string;
}): { ok: true; dueDate: string } | { ok: false; error: string } {
  if (input.paymentStatus === 'PAID') {
    return { ok: true, dueDate: '' };
  }
  if (input.dueDateDecision === 'none') {
    return { ok: true, dueDate: '' };
  }
  if (input.dueDateDecision === 'date') {
    if (!input.dueDate.trim()) {
      return { ok: false, error: 'Select a due date or choose No due date.' };
    }
    return { ok: true, dueDate: input.dueDate.trim() };
  }
  return { ok: false, error: 'Choose a due date or No due date for credit sales.' };
}

export function primaryCheckoutLabel(input: {
  paymentStatus: PosPaymentStatus;
  paymentMethods: PosPaymentMethod[];
  isCompletingSale: boolean;
  totalLabel: string;
}): string {
  if (input.isCompletingSale) return 'Processing…';
  if (input.paymentStatus === 'UNPAID') return 'Complete Credit Sale';
  if (input.paymentStatus === 'PART_PAID') return 'Complete Part-Paid Sale';
  if (isCashOnly(input.paymentMethods)) {
    return `Complete Cash Sale — ${input.totalLabel}`;
  }
  return `Complete Sale — ${input.totalLabel}`;
}

export function nonCashConfirmInstruction(): string {
  return 'Confirm that payment has been received before completing the sale.';
}

export function buildOnlineSaleExternalRef(attemptId: string): string {
  return `POS_ONLINE:${attemptId}`;
}

export function nextSaleAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
