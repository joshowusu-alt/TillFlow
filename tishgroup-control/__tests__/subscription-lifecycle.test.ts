import { describe, expect, it } from 'vitest';
import { activateSubscriptionAfterPayment, calculateNextBillingDate, computeBillingAccessState } from '../lib/subscription-lifecycle';

describe('calculateNextBillingDate', () => {
  it('adds one month for monthly billing', () => {
    const next = calculateNextBillingDate(new Date('2026-05-15T00:00:00Z'), 'MONTHLY');
    expect(next.toISOString().slice(0, 10)).toBe('2026-06-15');
  });

  it('adds one year for annual billing', () => {
    const next = calculateNextBillingDate(new Date('2026-05-15T00:00:00Z'), 'ANNUAL');
    expect(next.toISOString().slice(0, 10)).toBe('2027-05-15');
  });
});

describe('computeBillingAccessState', () => {
  const now = new Date('2026-05-15T00:00:00Z');

  it('marks trial due soon inside the three-day window', () => {
    const snapshot = computeBillingAccessState({ trialEndsAt: '2026-05-17T00:00:00Z' }, now);
    expect(snapshot.accessState).toBe('TRIAL_DUE_SOON');
    expect(snapshot.isRestricted).toBe(false);
  });

  it('marks unpaid expired trial restricted after grace', () => {
    const snapshot = computeBillingAccessState({ trialEndsAt: '2026-05-10T00:00:00Z' }, now);
    expect(snapshot.accessState).toBe('TRIAL_RESTRICTED');
    expect(snapshot.isRestricted).toBe(true);
  });

  it('marks paid subscription due today', () => {
    const snapshot = computeBillingAccessState({
      firstPaymentAt: '2026-04-15T00:00:00Z',
      lastPaymentAt: '2026-04-15T00:00:00Z',
      nextBillingDate: '2026-05-15T00:00:00Z',
    }, now);
    expect(snapshot.accessState).toBe('PAYMENT_DUE_TODAY');
  });

  it('respects explicit cancellation', () => {
    const snapshot = computeBillingAccessState({ subscriptionStatus: 'CANCELLED' }, now);
    expect(snapshot.accessState).toBe('CANCELLED');
    expect(snapshot.isRestricted).toBe(true);
  });
});

describe('activateSubscriptionAfterPayment', () => {
  it('returns paid active entitlement fields with annual next billing date', () => {
    const paymentDate = new Date('2026-05-15T00:00:00Z');
    const activation = activateSubscriptionAfterPayment({
      selectedPlan: 'PRO',
      paymentDate,
      billingCadence: 'ANNUAL',
      amountPence: 120000,
    });

    expect(activation.subscriptionStatus).toBe('PAID_ACTIVE');
    expect(activation.planStatus).toBe('PAID_ACTIVE');
    expect(activation.nextBillingDate.toISOString().slice(0, 10)).toBe('2027-05-15');
    expect(activation.billingAmount).toBe(120000);
  });
});
