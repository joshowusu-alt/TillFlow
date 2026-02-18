export const VOID_RETURN_REASON_CODES = [
  'CUSTOMER_CHANGED_MIND',
  'WRONG_ITEM_SCANNED',
  'WRONG_PRICE_CAPTURED',
  'DAMAGED_GOODS',
  'DUPLICATE_TRANSACTION',
  'PAYMENT_FAILURE',
  'OTHER',
] as const;

export const DISCOUNT_REASON_CODES = [
  'CUSTOMER_LOYALTY',
  'PRICE_MATCH',
  'DAMAGED_PACK',
  'PROMO_OVERRIDE',
  'OTHER',
] as const;

export type VoidReturnReasonCode = (typeof VOID_RETURN_REASON_CODES)[number];
export type DiscountReasonCode = (typeof DISCOUNT_REASON_CODES)[number];

export function isVoidReturnReasonCode(value: string | null | undefined): value is VoidReturnReasonCode {
  return !!value && VOID_RETURN_REASON_CODES.includes(value as VoidReturnReasonCode);
}

export function isDiscountReasonCode(value: string | null | undefined): value is DiscountReasonCode {
  return !!value && DISCOUNT_REASON_CODES.includes(value as DiscountReasonCode);
}
