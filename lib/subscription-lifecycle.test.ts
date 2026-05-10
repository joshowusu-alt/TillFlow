import { describe, expect, it } from 'vitest';
import {
  activateSubscriptionAfterPayment,
  addDays,
  calculateNextBillingDate,
  canUseFeature,
  createTrialSubscription,
  computeBillingAccessState,
  getSubscriptionStatus,
  getTrialDaysLeft,
  getMerchantSubscriptionMessage,
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
    expect(getSubscriptionStatus(trial, new Date('2026-05-05T08:00:00.000Z'))).toBe('TRIAL_DUE_SOON');
  });

  it('shows a trial as due today on the final day', () => {
    const trial = createTrialSubscription('PRO', signupAt);

    expect(getSubscriptionStatus(trial, new Date('2026-05-08T08:00:00.000Z'))).toBe('TRIAL_DUE_TODAY');
    expect(getMerchantSubscriptionMessage(trial, new Date('2026-05-08T08:00:00.000Z'))).toContain('ends today');
  });

  it('moves expired trials into grace before restriction', () => {
    const trial = createTrialSubscription('PRO', signupAt);

    expect(getSubscriptionStatus({ ...trial, paymentGraceEndsAt: new Date('2026-05-11T09:00:00.000Z') }, new Date('2026-05-09T10:00:00.000Z'))).toBe('TRIAL_EXPIRED_GRACE');
  });

  it('restricts expired trials once grace ends', () => {
    const trial = createTrialSubscription('PRO', signupAt);

    expect(getSubscriptionStatus(trial, new Date('2026-05-09T09:00:00.000Z'))).toBe('TRIAL_RESTRICTED');
  });

  it('activates subscription after first payment and sets next billing one month later', () => {
    const paymentDate = new Date('2026-05-08T10:00:00.000Z');
    const activation = activateSubscriptionAfterPayment({
      selectedPlan: 'GROWTH',
      billingInterval: 'MONTHLY',
      paymentDate,
    });

    expect(activation.subscriptionStatus).toBe('PAID_ACTIVE');
    expect(activation.firstPaymentAt).toEqual(paymentDate);
    expect(activation.currentPeriodStartedAt).toEqual(paymentDate);
    expect(activation.nextBillingDate).toEqual(new Date('2026-06-08T10:00:00.000Z'));
  });

  it('computes paid access, renewal warnings, overdue states, and restriction flags', () => {
    const paid = activateSubscriptionAfterPayment({
      selectedPlan: 'STARTER',
      paymentDate: new Date('2026-05-08T10:00:00.000Z'),
    });
    const base = { selectedPlan: 'STARTER', firstPaymentAt: paid.firstPaymentAt, nextBillingDate: paid.nextBillingDate };

    expect(getSubscriptionStatus(base, new Date('2026-06-01T08:00:00.000Z'))).toBe('RENEWAL_DUE_SOON');
    expect(getSubscriptionStatus(base, new Date('2026-06-08T08:00:00.000Z'))).toBe('PAYMENT_DUE_TODAY');
    expect(getSubscriptionStatus(base, new Date('2026-06-09T08:00:00.000Z'))).toBe('PAYMENT_RESTRICTED');
    expect(getSubscriptionStatus({ ...base, paymentGraceEndsAt: addDays(paid.nextBillingDate, 2) }, new Date('2026-06-09T08:00:00.000Z'))).toBe('PAYMENT_OVERDUE_GRACE');
    expect(getSubscriptionStatus({ ...base, paymentGraceEndsAt: addDays(paid.nextBillingDate, 2) }, new Date('2026-06-11T12:00:00.000Z'))).toBe('PAYMENT_RESTRICTED');
    expect(computeBillingAccessState({ ...base, timezone: 'Africa/Accra' }, new Date('2026-06-01T08:00:00.000Z')).primaryBanner).toContain('renews');
    expect(computeBillingAccessState({ ...base, timezone: 'Africa/Accra' }, new Date('2026-06-09T08:00:00.000Z')).isOverdue).toBe(true);
  });

  it('allows only support, billing, account, and dashboard access when restricted', () => {
    const restricted = computeBillingAccessState({
      selectedPlan: 'PRO',
      subscriptionStatus: 'PAYMENT_RESTRICTED',
      firstPaymentAt: new Date('2026-04-08T10:00:00.000Z'),
      nextBillingDate: new Date('2026-05-09T10:00:00.000Z'),
      timezone: 'Africa/Accra',
    }, new Date('2026-05-10T08:00:00.000Z'));

    expect(restricted.isRestricted).toBe(true);
    expect(restricted.allowedFeatures).toEqual(['billing', 'support', 'account_settings', 'dashboard_read']);
    expect(restricted.restrictedFeatures).toContain('sales');
    expect(restricted.nextActionLabel).toBe('View billing');
  });

  it('keeps full access active after payment confirmation', () => {
    const active = computeBillingAccessState({
      selectedPlan: 'GROWTH',
      firstPaymentConfirmedAt: new Date('2026-05-08T10:00:00.000Z'),
      nextPaymentDueAt: new Date('2026-06-08T10:00:00.000Z'),
      billingCadence: 'MONTHLY',
      timezone: 'Africa/Accra',
    }, new Date('2026-05-10T08:00:00.000Z'));

    expect(active.accessState).toBe('PAID_ACTIVE');
    expect(active.isPaid).toBe(true);
    expect(active.primaryBanner).toBeNull();
  });

  it('does not trust stale active labels when payment was due yesterday', () => {
    const access = computeBillingAccessState({
      selectedPlan: 'PRO',
      subscriptionStatus: 'PAID_ACTIVE',
      planStatus: 'PAID_ACTIVE',
      firstPaymentConfirmedAt: new Date('2026-04-09T10:00:00.000Z'),
      nextPaymentDueAt: new Date('2026-05-09T10:00:00.000Z'),
      timezone: 'Africa/Accra',
    }, new Date('2026-05-10T08:00:00.000Z'));

    expect(access.accessState).toBe('PAYMENT_RESTRICTED');
    expect(access.displayStatus).toBe('Payment restricted');
    expect(access.primaryBanner).toBe('Access restricted until payment is confirmed.');
    expect(access.isRestricted).toBe(true);
  });

  it('does not show trial-due-today copy after the trial has ended', () => {
    const access = computeBillingAccessState({
      selectedPlan: 'GROWTH',
      subscriptionStatus: 'TRIAL_ACTIVE',
      trialStartedAt: new Date('2026-05-01T09:00:00.000Z'),
      trialEndsAt: new Date('2026-05-09T09:00:00.000Z'),
      paymentGraceEndsAt: new Date('2026-05-11T09:00:00.000Z'),
      timezone: 'Africa/Accra',
    }, new Date('2026-05-10T08:00:00.000Z'));

    expect(access.accessState).toBe('TRIAL_EXPIRED_GRACE');
    expect(access.primaryBanner).toBe('Your trial has ended. Complete payment before access is restricted.');
    expect(access.primaryBanner).not.toContain('ends today');
  });

  it('supports annual renewal reminders without changing the state model', () => {
    const active = computeBillingAccessState({
      selectedPlan: 'PRO',
      firstPaymentAt: new Date('2026-01-02T10:00:00.000Z'),
      nextBillingDate: new Date('2027-01-02T10:00:00.000Z'),
      billingCadence: 'ANNUAL',
      timezone: 'Africa/Accra',
    }, new Date('2026-12-10T08:00:00.000Z'));

    expect(active.accessState).toBe('RENEWAL_DUE_SOON');
    expect(active.primaryBanner).toContain('renews in');
  });

  it('treats same local day as due today even when UTC dates differ', () => {
    const access = computeBillingAccessState({
      selectedPlan: 'GROWTH',
      firstPaymentAt: new Date('2026-04-10T00:00:00.000Z'),
      nextPaymentDueAt: new Date('2026-05-10T00:30:00.000Z'),
      timezone: 'Africa/Lagos',
    }, new Date('2026-05-09T23:30:00.000Z'));

    expect(access.accessState).toBe('PAYMENT_DUE_TODAY');
    expect(access.daysRemaining).toBe(0);
  });

  it('calculates monthly renewal dates from the payment day', () => {
    expect(calculateNextBillingDate(new Date('2026-08-08T10:00:00.000Z'))).toEqual(new Date('2026-09-08T10:00:00.000Z'));
  });

  it('restricts blocked features only in restricted states', () => {
    const restricted = { selectedPlan: 'PRO', subscriptionStatus: 'PAYMENT_RESTRICTED' };

    expect(canUseFeature('billing', restricted)).toBe(true);
    expect(canUseFeature('sales', restricted)).toBe(false);
    expect(canUseFeature('reports', restricted)).toBe(false);
  });
});
