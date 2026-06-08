import { describe, expect, it } from 'vitest';
import { matchesScaleFilter } from '../labels';
import type { ScaleBusinessRecord } from '../types';

function sampleRecord(overrides: Partial<ScaleBusinessRecord> = {}): ScaleBusinessRecord {
  return {
    businessId: 'b1',
    businessName: 'Test Shop',
    ownerName: 'Ama',
    ownerPhone: '+233200000000',
    ownerEmail: 'ama@test.com',
    location: 'Accra',
    businessType: 'SUPERMARKET',
    branchCount: 1,
    plan: 'GROWTH',
    billingCadence: 'MONTHLY',
    trialStartAt: '2026-06-01',
    trialEndAt: '2026-06-15',
    billingAccessState: 'TRIAL_ACTIVE',
    billingDaysRemaining: 5,
    activationStatus: 'SETUP_IN_PROGRESS',
    activationStatusLabel: 'Setup in progress',
    setupProgressPercent: 45,
    stuckReason: 'STUCK_NO_STOCK',
    stuckMessage: 'Add opening stock so TillFlow knows what you have.',
    nextAction: 'Help record opening stock',
    controlMessage: 'Products added but no opening stock',
    onboardingStage: 'products_added',
    onboardingStageLabel: 'Products added',
    productCount: 12,
    hasOpeningStock: false,
    staffCount: 2,
    purchaseCount: 0,
    saleCount: 0,
    salesLast7Days: 0,
    lastSaleAt: null,
    lastOwnerDashboardViewAt: null,
    lastReportViewAt: null,
    lastLoginAt: null,
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
    assignedAgent: 'Unassigned',
    assignedManagerId: null,
    healthLabel: 'Needs setup help',
    portfolioHealth: 'Needs Attention',
    portfolioHealthReasons: [],
    churnRisk: false,
    isActivated: false,
    isHealthy: false,
    storefrontEnabled: false,
    addonOnlineStorefront: false,
    storefrontMode: 'none',
    pricingLabel: 'Growth · GHS 349/mo',
    annualEquivalentGhs: 3490,
    monthlyValue: 349,
    outstandingAmount: 0,
    signedUpAt: '2026-06-01',
    completedSteps: [],
    missingSteps: [],
    ...overrides,
  };
}

describe('scale cockpit filters', () => {
  it('filters stuck setup', () => {
    expect(matchesScaleFilter(sampleRecord(), 'stuck_setup', new Date())).toBe(true);
    expect(matchesScaleFilter(sampleRecord({ activationStatus: 'ACTIVE_BUSINESS', stuckReason: null }), 'stuck_setup', new Date())).toBe(false);
  });

  it('filters no products', () => {
    expect(matchesScaleFilter(sampleRecord({ productCount: 0 }), 'no_products', new Date())).toBe(true);
  });

  it('filters needs support', () => {
    expect(matchesScaleFilter(sampleRecord({ openSupportIssueCount: 2 }), 'needs_support', new Date())).toBe(true);
    expect(matchesScaleFilter(sampleRecord(), 'needs_support', new Date())).toBe(false);
  });

  it('filters demo completed referral status', () => {
    expect(
      matchesScaleFilter(sampleRecord({ referralStatus: 'DEMO_COMPLETED' }), 'demo_completed', new Date())
    ).toBe(true);
  });
});
