import { UserError } from '@/lib/action-utils';

// Server-side release restriction. Keep this identical in candidate and fallback.
export function manualPaymentsOnly(): boolean {
  return process.env.TILLFLOW_PILOT_MANUAL_PAYMENTS === '1';
}

export function assertAutomatedPaymentsAllowed(): void {
  if (manualPaymentsOnly()) {
    throw new UserError('Automated MoMo collections are disabled for this pilot. Record a payment only after checking the merchant account; recording does not independently confirm settlement.');
  }
}
