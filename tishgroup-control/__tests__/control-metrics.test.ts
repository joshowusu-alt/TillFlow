import { describe, it, expect } from 'vitest';
import { getPortfolioSummaryFor, getCollectionQueuesFor, getActionChecklist, formatCedi } from '../lib/control-metrics';
import type { ManagedBusiness } from '../lib/control-data';

function makeBusiness(overrides: Partial<ManagedBusiness> = {}): ManagedBusiness {
  return {
    id: 'test-id',
    name: 'Test Business',
    ownerName: 'Test Owner',
    ownerPhone: '+233201234567',
    ownerEmail: 'owner@test.com',
    plan: 'STARTER',
    effectivePlan: 'STARTER',
    state: 'PAID_ACTIVE',
    billingCadence: 'MONTHLY',
    signedUpAt: '2026-01-01',
    planSetAt: '2026-01-01',
    monthlyValue: 500,
    outstandingAmount: 0,
    nextDueAt: '2026-06-01',
    lastPaymentAt: null,
    assignedManager: 'Unassigned',
    needsReview: false,
    reviewedAt: null,
    reviewedBy: null,
    lastActivityAt: '2026-05-01',
    branches: 1,
    notes: '',
    health: 'HEALTHY',
    ...overrides,
  };
}

describe('getPortfolioSummaryFor', () => {
  it('counts MRR across active businesses only', () => {
    const businesses = [
      makeBusiness({ state: 'PAID_ACTIVE', monthlyValue: 500 }),
      makeBusiness({ state: 'PAID_ACTIVE', monthlyValue: 300 }),
      makeBusiness({ state: 'INACTIVE', monthlyValue: 400 }),
    ];
    const summary = getPortfolioSummaryFor(businesses);
    expect(summary.mrr).toBe(800);
    expect(summary.arr).toBe(9600);
  });

  it('counts grace and fallback states separately', () => {
    const businesses = [
      makeBusiness({ state: 'PAYMENT_OVERDUE_GRACE' }),
      makeBusiness({ state: 'TRIAL_EXPIRED_GRACE' }),
      makeBusiness({ state: 'PAYMENT_RESTRICTED' }),
      makeBusiness({ state: 'TRIAL_RESTRICTED' }),
      makeBusiness({ state: 'READ_ONLY' }),
      makeBusiness({ state: 'PAID_ACTIVE' }),
    ];
    const summary = getPortfolioSummaryFor(businesses);
    expect(summary.grace).toBe(2);
    expect(summary.fallback).toBe(2);
    expect(summary.readOnly).toBe(1);
    expect(summary.activePaid).toBe(1);
  });

  it('counts totalBusinesses including inactive', () => {
    const businesses = [
      makeBusiness({ state: 'PAID_ACTIVE' }),
      makeBusiness({ state: 'INACTIVE' }),
      makeBusiness({ state: 'CANCELLED' }),
    ];
    expect(getPortfolioSummaryFor(businesses).totalBusinesses).toBe(3);
  });

  it('returns zeros for empty portfolio', () => {
    const summary = getPortfolioSummaryFor([]);
    expect(summary.mrr).toBe(0);
    expect(summary.grace).toBe(0);
    expect(summary.totalBusinesses).toBe(0);
  });
});

describe('getCollectionQueuesFor', () => {
  it('routes healthy accounts correctly', () => {
    const businesses = [
      makeBusiness({ state: 'PAID_ACTIVE' }),
      makeBusiness({ state: 'TRIAL_ACTIVE' }),
    ];
    const queues = getCollectionQueuesFor(businesses);
    expect(queues.healthy).toHaveLength(2);
    expect(queues.dueSoon).toHaveLength(0);
    expect(queues.overdue).toHaveLength(0);
    expect(queues.locked).toHaveLength(0);
  });

  it('routes overdue accounts correctly', () => {
    const businesses = [
      makeBusiness({ state: 'PAYMENT_OVERDUE_GRACE' }),
      makeBusiness({ state: 'TRIAL_EXPIRED_GRACE' }),
      makeBusiness({ state: 'PAYMENT_RESTRICTED' }),
      makeBusiness({ state: 'TRIAL_RESTRICTED' }),
    ];
    const queues = getCollectionQueuesFor(businesses);
    expect(queues.overdue).toHaveLength(4);
    expect(queues.locked).toHaveLength(0);
  });

  it('routes locked accounts separately from overdue', () => {
    const businesses = [
      makeBusiness({ state: 'READ_ONLY' }),
      makeBusiness({ state: 'PAYMENT_OVERDUE_GRACE' }),
    ];
    const queues = getCollectionQueuesFor(businesses);
    expect(queues.locked).toHaveLength(1);
    expect(queues.overdue).toHaveLength(1);
  });
});

describe('getActionChecklist', () => {
  it('returns reminder steps for due-soon states', () => {
    const dueSoonStates = ['TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY', 'RENEWAL_DUE_SOON', 'PAYMENT_DUE_TODAY'] as const;
    for (const state of dueSoonStates) {
      const checklist = getActionChecklist(makeBusiness({ state }));
      expect(checklist[0]).toMatch(/reminder/i);
    }
  });

  it('returns escalation steps for overdue states', () => {
    const overdueStates = ['TRIAL_EXPIRED_GRACE', 'PAYMENT_OVERDUE_GRACE', 'TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED'] as const;
    for (const state of overdueStates) {
      const checklist = getActionChecklist(makeBusiness({ state }));
      expect(checklist[0]).toMatch(/call/i);
    }
  });

  it('returns escalation steps for locked state', () => {
    const checklist = getActionChecklist(makeBusiness({ state: 'READ_ONLY' }));
    expect(checklist[0]).toMatch(/escalate/i);
  });

  it('returns safe fallback for unknown state', () => {
    const checklist = getActionChecklist(makeBusiness({ state: 'NONEXISTENT_STATE' as any }));
    expect(checklist[0]).toMatch(/unknown/i);
  });

  it('returns monitoring steps for healthy paid state', () => {
    const checklist = getActionChecklist(makeBusiness({ state: 'PAID_ACTIVE' }));
    expect(checklist[0]).toMatch(/monitor/i);
  });

  it('returns conversion steps for trial state', () => {
    const checklist = getActionChecklist(makeBusiness({ state: 'TRIAL_ACTIVE' }));
    expect(checklist[0]).toMatch(/conversion|meeting/i);
  });
});

describe('formatCedi', () => {
  it('formats zero correctly', () => {
    expect(formatCedi(0)).toContain('GHc');
  });

  it('formats large amounts with locale separator', () => {
    const result = formatCedi(150000);
    expect(result).toContain('GHc');
    expect(result).toContain('150');
  });
});
