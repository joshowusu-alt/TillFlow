import { describe, expect, it, afterEach } from 'vitest';
import { getBillingEntitlement } from '@/lib/billing-entitlements';

const QA_ID = 'cmr2h7pna55f22d2288316407';
const CUSTOMER_ID = 'cmcustomer000000000000001';

function overduePaidInput(id: string) {
  return {
    id,
    selectedPlan: 'GROWTH' as const,
    subscriptionStatus: 'PAID_ACTIVE',
    firstPaymentAt: new Date('2026-07-01T19:54:03.773Z'),
    lastPaymentAt: new Date('2026-07-01T19:54:03.773Z'),
    nextBillingDate: new Date('2026-08-01T19:54:03.773Z'),
    paymentGraceEndsAt: null,
  };
}

describe('internal QA billing access entitlement', () => {
  const previous = process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;

  afterEach(() => {
    if (previous === undefined) delete process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;
    else process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS = previous;
  });

  it('lifts write restriction only for exact allowlisted business IDs', () => {
    process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS = QA_ID;
    const now = new Date('2026-08-03T12:00:00.000Z');

    const qa = getBillingEntitlement(overduePaidInput(QA_ID), now);
    expect(qa.accessState).toBe('PAYMENT_RESTRICTED');
    expect(qa.internalQaAccess).toBe(true);
    expect(qa.canWrite).toBe(true);
    expect(qa.isReadOnly).toBe(false);
    expect(qa.nextPaymentDueAt?.toISOString()).toBe('2026-08-01T19:54:03.773Z');

    const customer = getBillingEntitlement(overduePaidInput(CUSTOMER_ID), now);
    expect(customer.accessState).toBe('PAYMENT_RESTRICTED');
    expect(customer.internalQaAccess).toBe(false);
    expect(customer.canWrite).toBe(false);
    expect(customer.isReadOnly).toBe(true);
  });

  it('does not unlock overdue customers when allowlist is empty', () => {
    delete process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;
    const now = new Date('2026-08-03T12:00:00.000Z');
    const qa = getBillingEntitlement(overduePaidInput(QA_ID), now);
    expect(qa.internalQaAccess).toBe(false);
    expect(qa.canWrite).toBe(false);
  });

  it('does not unlock from isDemo-like naming alone (ID must match)', () => {
    process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS = QA_ID;
    const now = new Date('2026-08-03T12:00:00.000Z');
    const otherDemo = getBillingEntitlement(overduePaidInput('cmmm6apt40000t9bepahhkehw'), now);
    expect(otherDemo.internalQaAccess).toBe(false);
    expect(otherDemo.canWrite).toBe(false);
  });
});
