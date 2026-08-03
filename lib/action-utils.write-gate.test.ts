import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { COMMERCIAL_BILLING_SELECT } from '@/lib/billing-db-compat';
import { BUILTIN_INTERNAL_QA_BUSINESS_IDS } from '@/lib/internal-qa-access';
import { getBillingEntitlement } from '@/lib/billing-entitlements';
import { UserError } from '@/lib/action-utils';

const QA_ID = BUILTIN_INTERNAL_QA_BUSINESS_IDS[0];
const CUSTOMER_ID = 'cmcustomer000000000000001';
const OTHER_DEMO_ID = 'cmmm6apt40000t9bepahhkehw';
const SIMILAR_NAME_ID = 'cmsimilarqa00000000000001';

const findBusinessCommercialSnapshot = vi.fn();

vi.mock('@/lib/billing-db-compat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing-db-compat')>();
  return {
    ...actual,
    findBusinessCommercialSnapshot: (...args: unknown[]) =>
      findBusinessCommercialSnapshot(...args),
  };
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

function overdueCommercialSnapshot(id: string) {
  return {
    id,
    mode: 'GROWTH',
    storeMode: 'SINGLE_STORE',
    plan: 'GROWTH',
    selectedPlan: 'GROWTH',
    subscriptionStatus: 'PAID_ACTIVE',
    firstPaymentAt: new Date('2026-07-01T19:54:03.773Z'),
    lastPaymentAt: new Date('2026-07-01T19:54:03.773Z'),
    nextBillingDate: new Date('2026-08-01T19:54:03.773Z'),
    paymentGraceEndsAt: null,
  };
}

describe('COMMERCIAL_BILLING_SELECT identity', () => {
  it('includes business id so write-gate entitlements can match exact QA IDs', () => {
    expect(COMMERCIAL_BILLING_SELECT).toMatchObject({ id: true });
  });
});

describe('commercial snapshot → internal-QA write gate', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const previous = process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;

  beforeEach(() => {
    delete process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;
    findBusinessCommercialSnapshot.mockReset();
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;
    else process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS = previous;
  });

  it('QA Demo commercial snapshot yields PAYMENT_RESTRICTED + canWrite via exact ID', () => {
    const snapshot = overdueCommercialSnapshot(QA_ID);
    expect(snapshot.id).toBe(QA_ID);

    const entitlement = getBillingEntitlement(snapshot as any, now);
    expect(entitlement.accessState).toBe('PAYMENT_RESTRICTED');
    expect(entitlement.internalQaAccess).toBe(true);
    expect(entitlement.canWrite).toBe(true);
    expect(entitlement.primaryBanner).toMatch(/Access restricted until payment is confirmed/i);
    expect(entitlement.merchantMessage).toMatch(/Access restricted until payment is confirmed/i);
  });

  it('overdue genuine customer remains canWrite=false', () => {
    const entitlement = getBillingEntitlement(overdueCommercialSnapshot(CUSTOMER_ID) as any, now);
    expect(entitlement.accessState).toBe('PAYMENT_RESTRICTED');
    expect(entitlement.internalQaAccess).toBe(false);
    expect(entitlement.canWrite).toBe(false);
  });

  it('different isDemo-like tenant ID remains restricted', () => {
    const entitlement = getBillingEntitlement(overdueCommercialSnapshot(OTHER_DEMO_ID) as any, now);
    expect(entitlement.internalQaAccess).toBe(false);
    expect(entitlement.canWrite).toBe(false);
  });

  it('similarly named business ID remains restricted', () => {
    const entitlement = getBillingEntitlement(overdueCommercialSnapshot(SIMILAR_NAME_ID) as any, now);
    expect(entitlement.internalQaAccess).toBe(false);
    expect(entitlement.canWrite).toBe(false);
  });

  it('omitting id from commercial snapshot reproduces the Production write-gate defect', () => {
    const { id: _omit, ...withoutId } = overdueCommercialSnapshot(QA_ID);
    const entitlement = getBillingEntitlement(withoutId as any, now);
    expect(entitlement.accessState).toBe('PAYMENT_RESTRICTED');
    expect(entitlement.internalQaAccess).toBe(false);
    expect(entitlement.canWrite).toBe(false);
  });

  it('assertBusinessWriteAllowed allows TillFlow QA Demo when snapshot includes id', async () => {
    findBusinessCommercialSnapshot.mockResolvedValue({
      business: overdueCommercialSnapshot(QA_ID),
      billingSchemaReady: true,
    });

    const { assertBusinessWriteAllowed } = await import('@/lib/action-utils');
    await expect(assertBusinessWriteAllowed(QA_ID)).resolves.toBeUndefined();
    expect(findBusinessCommercialSnapshot).toHaveBeenCalledWith(QA_ID);
  });

  it('assertBusinessWriteAllowed rejects overdue customer (failed write path)', async () => {
    findBusinessCommercialSnapshot.mockResolvedValue({
      business: overdueCommercialSnapshot(CUSTOMER_ID),
      billingSchemaReady: true,
    });

    const { assertBusinessWriteAllowed } = await import('@/lib/action-utils');
    await expect(assertBusinessWriteAllowed(CUSTOMER_ID)).rejects.toBeInstanceOf(UserError);
    await expect(assertBusinessWriteAllowed(CUSTOMER_ID)).rejects.toThrow(/read-only/i);
  });

  it('assertBusinessWriteAllowed rejects when commercial snapshot omits id (regression of defect)', async () => {
    const { id: _omit, ...withoutId } = overdueCommercialSnapshot(QA_ID);
    findBusinessCommercialSnapshot.mockResolvedValue({
      business: withoutId,
      billingSchemaReady: true,
    });

    const { assertBusinessWriteAllowed } = await import('@/lib/action-utils');
    await expect(assertBusinessWriteAllowed(QA_ID)).rejects.toBeInstanceOf(UserError);
  });
});
