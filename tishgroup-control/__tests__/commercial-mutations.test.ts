import { describe, expect, it } from 'vitest';
import {
  coerceExistingStoredStatus,
  parseStoredStatusForMutation,
  UnknownCommercialStatusError,
} from '../lib/vendor/control-commercial-status';
import {
  parseExplicitPaymentAmountGhs,
  preserveStatusWhenAssigningSoldPlan,
  settleControlPayment,
  statusFamilyUnchanged,
} from '../lib/commercial-mutations';

describe('Phase 0 commercial mutation negatives', () => {
  it('trial + review + Growth remains trial', () => {
    expect(preserveStatusWhenAssigningSoldPlan('TRIAL')).toBe('TRIAL_ACTIVE');
    expect(preserveStatusWhenAssigningSoldPlan('TRIAL_ACTIVE')).toBe('TRIAL_ACTIVE');
  });

  it('trial + bulk review remains trial', () => {
    expect(preserveStatusWhenAssigningSoldPlan('TRIAL_ACTIVE')).toBe('TRIAL_ACTIVE');
  });

  it('suspended edit never becomes paid', () => {
    expect(parseStoredStatusForMutation('SUSPENDED')).toBe('READ_ONLY');
  });

  it('unknown status throws', () => {
    expect(() => parseStoredStatusForMutation('STARTER_FALLBACK')).toThrow(UnknownCommercialStatusError);
    expect(() => parseStoredStatusForMutation('ACTIVE')).toThrow(UnknownCommercialStatusError);
  });

  it('plan-only edit does not activate paid when status is unchanged', () => {
    expect(statusFamilyUnchanged('TRIAL_ACTIVE', 'TRIAL_ACTIVE')).toBe(true);
    expect(statusFamilyUnchanged('TRIAL', 'TRIAL_ACTIVE')).toBe(true);
  });

  it('no payment means no paid activation from blank amount', () => {
    expect(() => parseExplicitPaymentAmountGhs('')).toThrow(/explicit and greater than zero/);
    expect(() => parseExplicitPaymentAmountGhs(null)).toThrow(/explicit and greater than zero/);
    expect(settleControlPayment({
      amountGhs: 50,
      recommendedIntervalChargeGhs: 199,
      currentOutstandingGhs: 199,
    })).toEqual({ grantsPaidAccess: false, outstandingAfterGhs: 149, kind: 'partial' });
  });

  it('full catalog payment grants paid access and zeros outstanding', () => {
    expect(settleControlPayment({
      amountGhs: 199,
      recommendedIntervalChargeGhs: 199,
      currentOutstandingGhs: 199,
    })).toEqual({ grantsPaidAccess: true, outstandingAfterGhs: 0, kind: 'full' });
  });

  it('legacy TRIAL coercion never becomes PAID_ACTIVE', () => {
    expect(coerceExistingStoredStatus('TRIAL')).toBe('TRIAL_ACTIVE');
    expect(coerceExistingStoredStatus('ACTIVE')).toBe('TRIAL_ACTIVE');
  });
});
