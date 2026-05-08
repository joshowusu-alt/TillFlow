import { describe, expect, it } from 'vitest';
import {
  activateSubscriptionAfterPayment,
  addDays,
  calculateNextBillingDate,
  canUseFeature,
  createTrialSubscription,
  getSubscriptionStatus,
  getTrialDaysLeft,
} from './subscription-lifecycle';

describe('subscription lifecycle', () => {
  const signupAt = new Date('2026-05-01T09:00:00.000Z');

  it('creates a 7-day trial for a new business', () => {
    const trial = createTrialSubscription('GROWTH', signupAt);

    expect(trial.selectedPlan).toBe('GROWTH');
    expect(trial.subscriptionStatus).toBe('TRIAL_ACTIVE');
    expect(trial.trialStartedAt).toEqual(signupAt);
    expect(trial.trialEndsAt).toEqual(new Date('2026-05-08T09:00:00.000Z'));
  });

  it('calculates trial countdown', () => {
    const trial = createTrialSubscription('STARTER', signupAt);

    expect(getTrialDaysLeft(trial, new Date('2026-05-05T08:00:00.000Z'))).toBe(3);
    expect(getSubscriptionStatus(trial, new Date('2026-05-05T08:00:00.000Z'))).toBe('TRIAL_EXPIRING_SOON');
  });

  it('moves expired trials to payment pending', () => {
    const trial = createTrialSubscription('PRO', signupAt);

    expect(getSubscriptionStatus(trial, new Date('2026-05-09T09:00:00.000Z'))).toBe('PAYMENT_PENDING');
  });

  it('keeps an expired account in grace while configured', () => {
    const input = {
      ...createTrialSubscription('PRO', signupAt),
      paymentGraceEndsAt: new Date('2026-05-10T09:00:00.000Z'),
    };

    expect(getSubscriptionStatus(input, new Date('2026-05-09T10:00:00.000Z'))).toBe('GRACE_PERIOD');
  });

  it('activates subscription after first payment and sets next billing one month later', () => {
    const paymentDate = new Date('2026-05-08T10:00:00.000Z');
    const activation = activateSubscriptionAfterPayment({
      selectedPlan: 'GROWTH',
      billingInterval: 'MONTHLY',
      paymentDate,
    });

    expect(activation.subscriptionStatus).toBe('ACTIVE');
    expect(activation.firstPaymentAt).toEqual(paymentDate);
    expect(activation.currentPeriodStartedAt).toEqual(paymentDate);
    expect(activation.nextBillingDate).toEqual(new Date('2026-06-08T10:00:00.000Z'));
  });

  it('marks paid subscriptions due today, overdue, and suspended after grace', () => {
    const paid = activateSubscriptionAfterPayment({
      selectedPlan: 'STARTER',
      paymentDate: new Date('2026-05-08T10:00:00.000Z'),
    });
    const base = { selectedPlan: 'STARTER', firstPaymentAt: paid.firstPaymentAt, nextBillingDate: paid.nextBillingDate };

    expect(getSubscriptionStatus(base, new Date('2026-06-08T08:00:00.000Z'))).toBe('DUE_TODAY');
    expect(getSubscriptionStatus(base, new Date('2026-06-09T08:00:00.000Z'))).toBe('OVERDUE');
    expect(getSubscriptionStatus({ ...base, paymentGraceEndsAt: addDays(paid.nextBillingDate, 2) }, new Date('2026-06-09T08:00:00.000Z'))).toBe('GRACE_PERIOD');
    expect(getSubscriptionStatus({ ...base, paymentGraceEndsAt: addDays(paid.nextBillingDate, 2) }, new Date('2026-06-11T12:00:00.000Z'))).toBe('SUSPENDED');
  });

  it('restricts blocked features only after suspension', () => {
    const suspended = { selectedPlan: 'PRO', subscriptionStatus: 'SUSPENDED' };

    expect(canUseFeature('billing', suspended)).toBe(true);
    expect(canUseFeature('sales', suspended)).toBe(false);
    expect(canUseFeature('reports', suspended)).toBe(false);
  });

  it('calculates monthly renewal dates from the payment day', () => {
    expect(calculateNextBillingDate(new Date('2026-08-08T10:00:00.000Z'))).toEqual(new Date('2026-09-08T10:00:00.000Z'));
  });
});
