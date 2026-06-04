import type { ScaleBusinessRecord } from '@/lib/scale-cockpit/types';

export type DigestPriority = 'critical' | 'high' | 'normal';

export type DigestActionRow = {
  businessId: string;
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  reason: string;
  nextAction: string;
  assignedAgent: string;
  priority: DigestPriority;
  category: string;
};

export type DigestBucket = {
  key: string;
  label: string;
  count: number;
  rows: DigestActionRow[];
};

export type DigestCounts = {
  newSignupsToday: number;
  newSignupsThisWeek: number;
  stuckSetup: number;
  noProducts: number;
  noStock: number;
  noSales: number;
  noReportViewed: number;
  trialsEndingToday: number;
  trialsEndingIn3Days: number;
  overdue: number;
  restricted: number;
  openCriticalSupport: number;
  openHighSupport: number;
  staleSupport: number;
  demoRequestedNotBooked: number;
  demoCompletedNoTrial: number;
  trialStartedNoSale: number;
  activeYesterday: number;
  inactive7Days: number;
  expectedCollectionsThisWeek: number;
  paidThisWeek: number;
  healthy: number;
  portfolioCritical: number;
  portfolioAtRisk: number;
  portfolioNeedsAttention: number;
  portfolioHealthy: number;
};

/** Shape designed for optional future ControlDigestSnapshot table persistence. */
export type DigestSnapshotMeta = {
  date: string;
  totalBusinesses: number;
  activeBusinesses: number;
  newSignups: number;
  paidBusinesses: number;
  trialsEnding: number;
  overdue: number;
  stuckSetup: number;
  openSupportIssues: number;
  expectedCollections: number;
  actionCount: number;
};

export type WeeklyRolloutSummary = {
  onboardedThisWeek: number;
  trialsStarted: number;
  demosBooked: number;
  demosCompleted: number;
  paidConversions: number;
  activeWeekly: number;
  firstSaleThisWeek: number;
  setupCompletedThisWeek: number;
  supportOpened: number;
  supportResolved: number;
  topSources: Array<{ label: string; count: number }>;
  topAgents: Array<{ agent: string; count: number }>;
  expectedMrr: number;
  collectionsExpectedNextWeek: number;
};

export type ControlDigestData = {
  generatedAt: string;
  dateLabel: string;
  counts: DigestCounts;
  priorities: DigestActionRow[];
  buckets: DigestBucket[];
  weekly: WeeklyRolloutSummary;
  snapshotMeta: DigestSnapshotMeta;
  healthyBusinesses: ScaleBusinessRecord[];
  whatsappText: string;
};
