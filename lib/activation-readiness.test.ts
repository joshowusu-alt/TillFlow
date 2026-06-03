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
  it('computes progress from required steps', () => {
    const steps = buildActivationSteps(baseSnapshot());
    const pct = getSetupProgressPercent(steps);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('detects stuck when no products after 24h', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const snapshot = baseSnapshot({
      createdAt: new Date('2026-06-08T12:00:00Z'),
      productCount: 0,
      now,
    });
    const steps = buildActivationSteps(snapshot);
    const stuck = detectStuckReason(snapshot, steps, 'TRIAL_ACTIVE', now);
    expect(stuck).toBe('STUCK_NO_PRODUCTS');
  });

  it('marks activated when core milestones met', () => {
    const snapshot = baseSnapshot({
      productCount: 10,
      ownerLastDashboardViewAt: new Date('2026-06-09T12:00:00Z'),
    });
    expect(isBusinessActivated(snapshot)).toBe(true);
  });

  it('returns owner and control messages', () => {
    const result = computeActivationReadiness(
      baseSnapshot({ productCount: 0, createdAt: new Date('2026-06-01T12:00:00Z') })
    );
    expect(result.ownerMessage.length).toBeGreaterThan(10);
    expect(result.controlMessage.length).toBeGreaterThan(10);
    expect(result.nextAction.length).toBeGreaterThan(3);
  });

  it('lists completed and missing steps', () => {
    const result = computeActivationReadiness(baseSnapshot());
    expect(result.completedSteps.length).toBeGreaterThan(0);
    expect(Array.isArray(result.missingSteps)).toBe(true);
  });

  it('counts inventory on hand toward opening-stock step', () => {
    const steps = buildActivationSteps(
      baseSnapshot({ purchaseCount: 0, openingCapitalPence: 0, inventoryOnHandBase: 24 })
    );
    const opening = steps.find((s) => s.key === 'opening-stock');
    expect(opening?.done).toBe(true);
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
});
