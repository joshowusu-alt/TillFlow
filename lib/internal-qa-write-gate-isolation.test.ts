import { describe, expect, it, afterEach } from 'vitest';
import { getBillingEntitlement } from '@/lib/billing-entitlements';
import { isInternalQaBusinessId, BUILTIN_INTERNAL_QA_BUSINESS_IDS } from '@/lib/internal-qa-access';
import {
  createInventoryDecrease,
  InventoryDecreaseError,
  INVENTORY_DECREASE_ERROR,
} from '@/lib/services/inventory-decrease';
import { isInventoryDecreasePhase1Enabled } from '@/lib/inventory-decrease-flag';

const QA_ID = BUILTIN_INTERNAL_QA_BUSINESS_IDS[0];

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

describe('internal-QA isolation and Phase 1 flag-off boundaries', () => {
  const previousFlag = process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1;
  const previousAllow = process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1;
    else process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1 = previousFlag;
    if (previousAllow === undefined) delete process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;
    else process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS = previousAllow;
  });

  it('does not grant access from tenant name strings', () => {
    expect(isInternalQaBusinessId('TillFlow QA Demo')).toBe(false);
    expect(isInternalQaBusinessId('TillFlow QA Demo', QA_ID)).toBe(false);
  });

  it('does not grant access from email-like strings or @tillflow.app alone', () => {
    expect(isInternalQaBusinessId('qa-owner@tillflow.app')).toBe(false);
    expect(isInternalQaBusinessId('owner@tillflow.app', QA_ID)).toBe(false);
    expect(isInternalQaBusinessId('cmtillflowapp000000000001')).toBe(false);
  });

  it('with flag off, direct decrease returns FLAG_DISABLED and creates no durable intent', async () => {
    delete process.env.TILLFLOW_INVENTORY_ADJUST_PHASE1;
    expect(isInventoryDecreasePhase1Enabled()).toBe(false);

    await expect(
      createInventoryDecrease({
        businessId: QA_ID,
        storeId: 'store-x',
        productId: 'product-x',
        unitId: 'unit-x',
        qtyInUnit: 1,
        reasonCode: 'DAMAGED',
        reason: 'must not write',
        idempotencyKey: 'write-gate-fix-flagoff',
        userId: 'user-x',
        userName: 'QA Owner',
        userRole: 'OWNER',
      }),
    ).rejects.toMatchObject({
      code: INVENTORY_DECREASE_ERROR.FLAG_DISABLED,
    });

    try {
      await createInventoryDecrease({
        businessId: QA_ID,
        storeId: 'store-x',
        productId: 'product-x',
        unitId: 'unit-x',
        qtyInUnit: 1,
        reasonCode: 'DAMAGED',
        reason: 'must not write',
        idempotencyKey: 'write-gate-fix-flagoff-2',
        userId: 'user-x',
        userName: 'QA Owner',
        userRole: 'OWNER',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryDecreaseError);
      expect((error as InventoryDecreaseError).code).toBe(INVENTORY_DECREASE_ERROR.FLAG_DISABLED);
    }
  });

  it('QA entitlement remains truthful PAYMENT_RESTRICTED with banner while canWrite', () => {
    delete process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS;
    const now = new Date('2026-08-03T12:00:00.000Z');
    const qa = getBillingEntitlement(overduePaidInput(QA_ID), now);
    expect(qa.accessState).toBe('PAYMENT_RESTRICTED');
    expect(qa.canWrite).toBe(true);
    expect(qa.primaryBanner).toBe('Access restricted until payment is confirmed.');
  });
});
