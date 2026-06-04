import { describe, expect, it } from 'vitest';
import { computePortfolioHealth } from './business-health';
import type { ScaleBusinessRecord } from '@/lib/scale-cockpit/types';

function baseRecord(overrides: Partial<ScaleBusinessRecord> = {}): ScaleBusinessRecord {
  return {
    businessId: 'b1',
    businessName: 'Test Mart',
    ownerName: 'Owner',
    ownerPhone: '0240000000',
    ownerEmail: '',
    location: null,
    businessType: null,
    branchCount: 1,
    plan: 'GROWTH',
    billingCadence: 'MONTHLY',
    trialStartAt: null,
    trialEndAt: null,
    billingAccessState: 'PAID_ACTIVE',
    billingDaysRemaining: null,
    activationStatus: 'ACTIVE_BUSINESS',
    activationStatusLabel: 'Active',
    setupProgressPercent: 80,
    stuckReason: null,
    stuckMessage: null,
    nextAction: 'Keep selling',
    controlMessage: '',
    onboardingStage: 'active',
    onboardingStageLabel: 'Active',
    productCount: 10,
    hasOpeningStock: true,
    staffCount: 2,
    purchaseCount: 1,
    saleCount: 20,
    salesLast7Days: 10,
    lastSaleAt: new Date().toISOString(),
    lastOwnerDashboardViewAt: null,
    lastReportViewAt: null,
    lastLoginAt: new Date().toISOString(),
    supportStatus: 'HEALTHY',
    openSupportIssueCount: 0,
    highestSupportPriority: null,
    hasCriticalSupportIssue: false,
    hasStaleSupportIssue: false,
    repeatSupportIssues: false,
    referralSource: null,
    referredBy: null,
    referredByName: null,
    referredByPhone: null,
    sourceChannel: null,
    referralStatus: null,
    referralNextFollowUpAt: null,
    referralNotes: null,
    assignedAgent: 'Agent',
    assignedManagerId: null,
    healthLabel: 'Healthy',
    portfolioHealth: 'Healthy',
    portfolioHealthReasons: [],
    churnRisk: false,
    isActivated: true,
    isHealthy: true,
    storefrontEnabled: false,
    monthlyValue: 349,
    outstandingAmount: 0,
    signedUpAt: '2026-01-01',
    completedSteps: [],
    missingSteps: [],
    ...overrides,
  };
}

describe('computePortfolioHealth', () => {
  it('returns Healthy for active paid business', () => {
    const r = computePortfolioHealth(baseRecord());
    expect(r.status).toBe('Healthy');
    expect(r.reasons).toHaveLength(0);
  });

  it('returns Critical for critical support', () => {
    const r = computePortfolioHealth(baseRecord({ hasCriticalSupportIssue: true }));
    expect(r.status).toBe('Critical');
    expect(r.reasons.some((x) => x.includes('Critical support'))).toBe(true);
  });

  it('returns At Risk when no sales in 14+ days', () => {
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const r = computePortfolioHealth(
      baseRecord({ lastSaleAt: old, salesLast7Days: 2, saleCount: 5 })
    );
    expect(['At Risk', 'Critical']).toContain(r.status);
    expect(r.reasons.some((x) => x.includes('No sale in'))).toBe(true);
  });
});
