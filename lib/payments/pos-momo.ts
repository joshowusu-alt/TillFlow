export type PosPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';

const BASE_PAYMENT_METHODS: PosPaymentMethod[] = ['CASH', 'CARD', 'TRANSFER'];

export function getEnabledPosPaymentMethods(momoEnabled?: boolean | null): PosPaymentMethod[] {
  void momoEnabled;
  return [...BASE_PAYMENT_METHODS, 'MOBILE_MONEY'];
}

export function getMomoManualGuidance(provider?: string | null): string {
  const normalized = (provider ?? '').trim().toUpperCase();
  if (normalized === 'MTN') {
    return 'Manual recording mode: enter the MoMo amount, payer number, and optional reference. Verify receipt in the merchant account or statement before completing the sale. A customer screenshot alone is not confirmation; recording does not independently confirm provider settlement.';
  }

  if (normalized === 'TELECEL' || normalized === 'AIRTELTIGO') {
    return 'Manual recording mode: enter the MoMo amount, payer number, and optional reference. Verify receipt in the merchant account or statement before completing the sale. Recording does not independently confirm provider settlement. Provider automation is not connected yet.';
  }

  return 'Manual recording mode: enter the MoMo amount, payer number, and optional reference. Verify receipt in the merchant account or statement before completing the sale. Recording does not independently confirm provider settlement. Reconciliation can be reviewed later.';
}
