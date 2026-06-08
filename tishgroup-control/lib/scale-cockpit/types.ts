import type { PortfolioHealthStatus } from '@/lib/business-health';
import type { SupportIssueRow } from '@/lib/support-issues/types';
import type { ActivationReadinessStatus, ActivationStuckReason } from '@/lib/vendor/activation-readiness';
import type { BillingAccessState } from '@/lib/vendor/subscription-lifecycle';

export type ScaleHealthLabel =
  | 'Healthy'
  | 'Needs setup help'
  | 'Low usage'
  | 'Churn risk'
  | 'Payment risk'
  | 'Support risk';

export type ScaleBusinessRecord = {
  businessId: string;
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  location: string | null;
  businessType: string | null;
  branchCount: number;
  plan: string;
  billingCadence: string;
  trialStartAt: string | null;
  trialEndAt: string | null;
  billingAccessState: BillingAccessState;
  billingDaysRemaining: number | null;
  activationStatus: ActivationReadinessStatus;
  activationStatusLabel: string;
  setupProgressPercent: number;
  stuckReason: ActivationStuckReason;
  stuckMessage: string | null;
  nextAction: string;
  controlMessage: string;
  onboardingStage: string;
  onboardingStageLabel: string;
  productCount: number;
  hasOpeningStock: boolean;
  staffCount: number;
  purchaseCount: number;
  saleCount: number;
  salesLast7Days: number;
  lastSaleAt: string | null;
  lastOwnerDashboardViewAt: string | null;
  lastReportViewAt: string | null;
  lastLoginAt: string | null;
  supportStatus: string;
  openSupportIssueCount: number;
  highestSupportPriority: string | null;
  hasCriticalSupportIssue: boolean;
  hasStaleSupportIssue: boolean;
  repeatSupportIssues: boolean;
  referralSource: string | null;
  referredBy: string | null;
  referredByName: string | null;
  referredByPhone: string | null;
  sourceChannel: string | null;
  referralStatus: string | null;
  referralNextFollowUpAt: string | null;
  referralNotes: string | null;
  assignedAgent: string;
  assignedManagerId: string | null;
  healthLabel: ScaleHealthLabel;
  portfolioHealth: PortfolioHealthStatus;
  portfolioHealthReasons: string[];
  churnRisk: boolean;
  isActivated: boolean;
  isHealthy: boolean;
  storefrontEnabled: boolean;
  addonOnlineStorefront: boolean;
  storefrontMode: 'none' | 'addon' | 'included';
  pricingLabel: string;
  annualEquivalentGhs: number;
  intervalCharge: number;
  monthlyValue: number;
  outstandingAmount: number;
  signedUpAt: string;
  completedSteps: string[];
  missingSteps: string[];
};

export type ScalePipelineStage = {
  key: string;
  label: string;
  count: number;
  percent: number;
  businesses: Array<{ id: string; name: string; nextAction: string }>;
};

export type ScaleActionItem = {
  businessId: string;
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  reason: string;
  nextAction: string;
  assignedAgent: string;
  priority: 'critical' | 'high' | 'normal';
  category: string;
};

export type ScaleCockpitData = {
  supportByBusiness: Record<string, SupportIssueRow[]>;
  overview: {
    totalBusinesses: number;
    newSignupsThisWeek: number;
    inSetup: number;
    activeBusinesses: number;
    inTrial: number;
    paidBusinesses: number;
    overdueBusinesses: number;
    restrictedBusinesses: number;
    needSetupHelp: number;
    openSupportIssues: number;
    expectedMrr: number;
    expectedCollectionsThisWeek: number;
    healthCritical: number;
    healthAtRisk: number;
    healthNeedsAttention: number;
    healthHealthy: number;
  };
  pipeline: ScalePipelineStage[];
  actionItems: ScaleActionItem[];
  businesses: ScaleBusinessRecord[];
};

export type ScaleFilter =
  | 'all'
  | 'new_signups'
  | 'setup_in_progress'
  | 'stuck_setup'
  | 'ready_to_sell'
  | 'active_business'
  | 'needs_help'
  | 'trial_ending_soon'
  | 'due_today'
  | 'overdue'
  | 'restricted'
  | 'active_week'
  | 'inactive_week'
  | 'no_products'
  | 'no_stock'
  | 'no_sales'
  | 'reports_not_viewed'
  | 'needs_support'
  | 'referred'
  | 'assigned_agent'
  | 'demo_requested'
  | 'demo_completed'
  | 'referral_trial'
  | 'referral_paid'
  | 'referral_follow_up'
  | 'health_critical'
  | 'health_at_risk'
  | 'health_needs_attention'
  | 'health_healthy';
