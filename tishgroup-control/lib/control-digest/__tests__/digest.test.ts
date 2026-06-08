import { describe, expect, it } from 'vitest';
import { buildDigestPriorities } from '../priorities';
import { computeDigestCounts } from '../buckets';
import { formatWhatsAppDigest, validateFocusNumbering } from '../whatsapp';
import type { ScaleBusinessRecord } from '@/lib/scale-cockpit/types';

function baseRecord(overrides: Partial<ScaleBusinessRecord> = {}): ScaleBusinessRecord {
  return {
    businessId: 'b1',
    businessName: 'Adom Retail',
    ownerName: 'Kojo',
    ownerPhone: '0244123456',
    ownerEmail: 'k@example.com',
    location: null,
    businessType: null,
    branchCount: 1,
    plan: 'STARTER',
    billingCadence: 'MONTHLY',
    trialStartAt: null,
    trialEndAt: null,
    billingAccessState: 'TRIAL_ACTIVE',
    billingDaysRemaining: 10,
    activationStatus: 'SETUP_IN_PROGRESS',
    activationStatusLabel: 'Setup',
    setupProgressPercent: 40,
    stuckReason: null,
    stuckMessage: null,
    nextAction: 'Add products',
    controlMessage: '',
    onboardingStage: 'signed_up',
    onboardingStageLabel: 'Signed up',
    productCount: 0,
    hasOpeningStock: false,
    staffCount: 1,
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
    assignedAgent: 'Agent A',
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
    pricingLabel: 'Starter · GHS 199/mo',
    annualEquivalentGhs: 1990,
    intervalCharge: 99,
    monthlyValue: 99,
    outstandingAmount: 0,
    signedUpAt: '2026-06-01',
    completedSteps: [],
    missingSteps: [],
    ...overrides,
  };
}

describe('buildDigestPriorities', () => {
  it('ranks critical support before normal setup', () => {
    const now = new Date('2026-06-05T12:00:00Z');
    const items = buildDigestPriorities(
      [
        baseRecord({ businessId: 'a', stuckReason: 'STUCK_NO_PRODUCTS' }),
        baseRecord({ businessId: 'b', hasCriticalSupportIssue: true, openSupportIssueCount: 1 }),
      ],
      now
    );
    expect(items[0]?.priority).toBe('critical');
    expect(items[0]?.businessId).toBe('b');
  });

  it('flags trial due today as high', () => {
    const now = new Date('2026-06-05T12:00:00Z');
    const items = buildDigestPriorities(
      [baseRecord({ billingAccessState: 'TRIAL_DUE_TODAY', billingDaysRemaining: 0 })],
      now
    );
    expect(items.some((i) => i.reason.includes('due today'))).toBe(true);
    expect(items.find((i) => i.reason.includes('due today'))?.priority).toBe('high');
  });
});

describe('formatWhatsAppDigest', () => {
  it('produces copyable short text', () => {
    const text = formatWhatsAppDigest({
      dateLabel: '5 June',
      counts: {
        newSignupsToday: 1,
        newSignupsThisWeek: 2,
        stuckSetup: 2,
        noProducts: 1,
        noStock: 0,
        noSales: 2,
        noReportViewed: 0,
        trialsEndingToday: 3,
        trialsEndingIn3Days: 1,
        overdue: 0,
        restricted: 0,
        openCriticalSupport: 1,
        openHighSupport: 0,
        staleSupport: 0,
        demoRequestedNotBooked: 0,
        demoCompletedNoTrial: 0,
        trialStartedNoSale: 1,
        activeYesterday: 0,
        inactive7Days: 0,
        expectedCollectionsThisWeek: 1247,
        paidThisWeek: 2,
        healthy: 5,
        portfolioCritical: 0,
        portfolioAtRisk: 1,
        portfolioNeedsAttention: 2,
        portfolioHealthy: 2,
      },
      priorities: [
        {
          businessId: 'b1',
          businessName: 'Adom Retail',
          ownerName: 'Kojo',
          ownerPhone: '0244',
          reason: 'Trial ends today',
          nextAction: 'Call for payment',
          assignedAgent: 'Agent',
          priority: 'high',
          category: 'billing',
        },
      ],
      weekly: {
        onboardedThisWeek: 2,
        trialsStarted: 1,
        demosBooked: 0,
        demosCompleted: 0,
        paidConversions: 1,
        activeWeekly: 3,
        firstSaleThisWeek: 1,
        setupCompletedThisWeek: 0,
        supportOpened: 2,
        supportResolved: 1,
        topSources: [],
        topAgents: [],
        expectedMrr: 5000,
        collectionsExpectedNextWeek: 800,
      },
    });
    expect(text).toContain('TillFlow Daily Digest');
    expect(text).toContain('Trials ending today: 3');
    expect(text).toContain('Critical support open: 1');
    expect(text).toContain('/command/digest');
    expect(validateFocusNumbering(text)).toBe(true);
  });
});

describe('computeDigestCounts', () => {
  it('excludes demo via scale records (caller filters isDemo)', () => {
    const now = new Date('2026-06-05T12:00:00Z');
    const counts = computeDigestCounts([baseRecord({ referralStatus: 'DEMO_REQUESTED' })], now);
    expect(counts.demoRequestedNotBooked).toBe(1);
  });
});
