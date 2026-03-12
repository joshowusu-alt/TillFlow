export type PosPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';

const BASE_PAYMENT_METHODS: PosPaymentMethod[] = ['CASH', 'CARD', 'TRANSFER'];

export function getEnabledPosPaymentMethods(momoEnabled?: boolean | null): PosPaymentMethod[] {
  void momoEnabled;
  return [...BASE_PAYMENT_METHODS, 'MOBILE_MONEY'];
}

export function getMomoManualGuidance(provider?: string | null): string {
  const normalized = (provider ?? '').trim().toUpperCase();
  if (normalized === 'MTN') {
    return 'Manual recording mode: enter the MoMo amount, payer number, and optional reference. Verify the customer\'s confirmation on their phone before completing the sale.';
  }

  if (normalized === 'TELECEL' || normalized === 'AIRTELTIGO') {
    return 'Manual recording mode: enter the MoMo amount, payer number, and optional reference. Verify the customer\'s confirmation on their phone before completing the sale. Provider automation is not connected yet.';
  }

  return 'Manual recording mode: enter the MoMo amount, payer number, and optional reference. Verify the customer\'s confirmation on their phone before completing the sale. Reconciliation can be reviewed later.';
}