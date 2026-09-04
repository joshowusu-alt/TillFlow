import {
  coerceExistingStoredStatus,
  parseStoredStatusForMutation,
  type CanonicalStoredStatus,
} from '@/lib/vendor/control-commercial-status';
import { assertSupportedCurrency } from '@/lib/vendor/control-money';

export const MAX_CONTROL_PAYMENT_GHS = 1_000_000;

export function parseExplicitPaymentAmountGhs(raw: string | null | undefined): number {
  if (raw == null || !String(raw).trim()) {
    throw new Error('Payment amount must be explicit and greater than zero. Blank amounts are rejected.');
  }
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Payment amount must be explicit and greater than zero.');
  }
  if (parsed > MAX_CONTROL_PAYMENT_GHS) {
    throw new Error(`Payment amount exceeds the allowed upper bound of GHS ${MAX_CONTROL_PAYMENT_GHS.toLocaleString('en-GH')}.`);
  }
  return Math.round(parsed);
}

export function parseRequiredIdempotencyKey(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (value.length < 8) {
    throw new Error('A unique payment reference / idempotency key is required.');
  }
  return value.slice(0, 120);
}

export function parseRequiredCurrency(raw: string | null | undefined): 'GHS' {
  return assertSupportedCurrency(raw || 'GHS');
}

export type PaymentSettlement = {
  grantsPaidAccess: boolean;
  outstandingAfterGhs: number;
  kind: 'full' | 'partial';
};

export function settleControlPayment(args: {
  amountGhs: number;
  recommendedIntervalChargeGhs: number;
  currentOutstandingGhs: number;
}): PaymentSettlement {
  if (args.amountGhs >= args.recommendedIntervalChargeGhs && args.recommendedIntervalChargeGhs > 0) {
    return { grantsPaidAccess: true, outstandingAfterGhs: 0, kind: 'full' };
  }
  const currentOutstanding = args.currentOutstandingGhs > 0
    ? args.currentOutstandingGhs
    : args.recommendedIntervalChargeGhs;
  return {
    grantsPaidAccess: false,
    outstandingAfterGhs: Math.max(0, currentOutstanding - args.amountGhs),
    kind: 'partial',
  };
}

export function preserveStatusWhenAssigningSoldPlan(existingStatus: string | null | undefined): CanonicalStoredStatus {
  return coerceExistingStoredStatus(existingStatus);
}

export function parseSubscriptionEditorStatus(raw: string | null | undefined): CanonicalStoredStatus {
  return parseStoredStatusForMutation(raw);
}

export function statusFamilyUnchanged(previous: string | null | undefined, next: CanonicalStoredStatus): boolean {
  try {
    return coerceExistingStoredStatus(previous) === next;
  } catch {
    return false;
  }
}
