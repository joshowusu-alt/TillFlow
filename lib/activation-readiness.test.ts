import { describe, expect, it } from 'vitest';
import { ACTIVATION_STEP_DEFINITIONS } from './activation-steps';
import {
  buildActivationSteps,
  computeActivationReadiness,
  detectStuckReason,
  getSetupProgressPercent,
  isBusinessActivated,
  type ActivationBusinessSnapshot,
} from './activation-readiness';

function baseSnapshot(overrides: Partial<ActivationBusinessSnapshot> = {}): ActivationBusinessSnapshot {
  const now = new Date('2026-06-10T12:00:00Z');
  return {
    businessId: 'biz-1',
    createdAt: new Date('2026-06-08T12:00:00Z'),
    name: 'Test Shop',
    address: 'Accra',
    phone: '+233200000000',
    businessCategory: 'SUPERMARKET',
    selectedPlan: 'GROWTH',
    momoEnabled: true,
    momoNumber: '0244000000',
    openingCapitalPence: 100_000,
    onboardingCompletedAt: null,
    ownerLastDashboardViewAt: null,
    ownerLastReportViewAt: null,
    trialAcknowledgedAt: null,
    productCount: 12,
    validProductCount: 12,
    sellableProductCount: 8,
    inventoryOnHandBase: 100,
    staffCount: 2,
    purchaseCount: 1,
    saleCount: 3,
    salesLast7Days: 3,
    lastSaleAt: new Date('2026-06-09T12:00:00Z'),
    openSupportIssueCount: 0,
    hasCriticalSupportIssue: false,
    ownerLastLoginAt: new Date('2026-06-09T08:00:00Z'),
    subscription: {
      selectedPlan: 'GROWTH',
      subscriptionStatus: 'TRIAL_ACTIVE',
      trialStartedAt: new Date('2026-06-08T12:00:00Z'),
      trialEndsAt: new Date('2026-06-15T12:00:00Z'),
    },
    now,
    ...overrides,
  };
}

describe('activation-readiness', () => {
  it('computes progress from journey stages only', () => {
    const steps = buildActivationSteps(baseSnapshot());
    const pct = getSetupProgressPercent(steps);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
    expect(steps.map((s) => s.key)).toEqual(['business', 'products', 'stock', 'selling', 'complete']);
  });

  it('keeps soft stuck signals for control when products are missing', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const snapshot = baseSnapshot({
      createdAt: new Date('2026-06-08T12:00:00Z'),
      productCount: 0,
      validProductCount: 0,
      sellableProductCount: 0,
      saleCount: 0,
      now,
    });
    const steps = buildActivationSteps(snapshot);
    const stuck = detectStuckReason(snapshot, steps, 'TRIAL_ACTIVE', now);
    expect(stuck).toBe('STUCK_NO_PRODUCTS');
    const result = computeActivationReadiness(snapshot);
    expect(result.activationStatus).not.toBe('STUCK');
    expect(result.stuckReason).toBe('STUCK_NO_PRODUCTS');
  });

  it('marks activated when first sale or onboarding timestamp exists', () => {
    expect(isBusinessActivated(baseSnapshot({ saleCount: 1 }))).toBe(true);
    expect(
      isBusinessActivated(
        baseSnapshot({
          saleCount: 0,
          onboardingCompletedAt: new Date('2026-06-09T12:00:00Z'),
        })
      )
    ).toBe(true);
  });

  it('returns owner and control messages without Stuck owner state', () => {
    const result = computeActivationReadiness(
      baseSnapshot({
        productCount: 0,
        validProductCount: 0,
        sellableProductCount: 0,
        saleCount: 0,
        createdAt: new Date('2026-06-01T12:00:00Z'),
      })
    );
    expect(result.activationStatus).toBe('SETUP_IN_PROGRESS');
    expect(result.activationStatus).not.toBe('STUCK');
    expect(result.ownerMessage.length).toBeGreaterThan(10);
    expect(result.controlMessage.length).toBeGreaterThan(10);
    expect(result.nextAction.length).toBeGreaterThan(3);
  });

  it('lists completed and missing journey steps', () => {
    const result = computeActivationReadiness(baseSnapshot());
    expect(result.completedSteps.length).toBeGreaterThan(0);
    expect(Array.isArray(result.missingSteps)).toBe(true);
  });

  it('counts sellable products toward stock stage', () => {
    const steps = buildActivationSteps(
      baseSnapshot({
        purchaseCount: 0,
        openingCapitalPence: 0,
        inventoryOnHandBase: 0,
        validProductCount: 2,
        sellableProductCount: 1,
        saleCount: 0,
      })
    );
    const stock = steps.find((s) => s.key === 'stock');
    expect(stock?.done).toBe(true);
  });

  it('setup progress percent matches counted activation steps', () => {
    const steps = buildActivationSteps(baseSnapshot());
    const counted = steps.filter((step) => {
      const def = ACTIVATION_STEP_DEFINITIONS.find((d) => d.key === step.key);
      return def?.countsTowardProgress;
    });
    const doneCount = counted.filter((s) => s.done).length;
    expect(getSetupProgressPercent(steps)).toBe(Math.round((doneCount / counted.length) * 100));
  });

  it('ignores staff, suppliers, payments and billing for readiness status', () => {
    const result = computeActivationReadiness(
      baseSnapshot({
        staffCount: 0,
        purchaseCount: 0,
        momoEnabled: false,
        momoNumber: null,
        trialAcknowledgedAt: null,
        saleCount: 0,
        validProductCount: 1,
        sellableProductCount: 1,
      })
    );
    expect(result.activationStatus).toBe('READY_TO_SELL');
  });
});
