export const SUPPORT_ISSUE_TYPES = [
  'LOGIN',
  'PRODUCT_SETUP',
  'IMPORT_STOCK',
  'STOCK_ISSUE',
  'POS_ISSUE',
  'REPORT_ISSUE',
  'BILLING_ISSUE',
  'ONLINE_STOREFRONT',
  'ORDER_MANAGEMENT',
  'TRAINING_NEEDED',
  'BUG',
  'FEATURE_REQUEST',
  'OTHER',
] as const;

export const SUPPORT_PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;

export const SUPPORT_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;

export const SUPPORT_SOURCES = [
  'WHATSAPP',
  'PHONE',
  'IN_APP',
  'AGENT',
  'EMAIL',
  'CONTROL',
  'OTHER',
] as const;

export type SupportIssueType = (typeof SUPPORT_ISSUE_TYPES)[number];
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportSource = (typeof SUPPORT_SOURCES)[number];

export const OPEN_SUPPORT_STATUSES: SupportStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_CUSTOMER',
];

export type SupportIssueRow = {
  id: string;
  businessId: string;
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  issueType: string;
  priority: string;
  status: string;
  title: string;
  description: string | null;
  source: string;
  relatedRoute: string | null;
  nextAction: string | null;
  assignedAgentName: string | null;
  assignedStaffId: string | null;
  createdAt: string;
  lastUpdatedAt: string;
  isStale: boolean;
  openAgeHours: number;
  slaLabel: string | null;
};

export type SupportCockpitOverview = {
  openIssues: number;
  criticalIssues: number;
  highPriorityIssues: number;
  waitingOnCustomer: number;
  resolvedThisWeek: number;
  averageOpenAgeHours: number;
  businessesWithOpenIssues: number;
  slaAttentionCount: number;
};

export type SupportCockpitData = {
  overview: SupportCockpitOverview;
  issues: SupportIssueRow[];
};

export type BusinessSupportSummary = {
  openCount: number;
  highestPriority: SupportPriority | null;
  hasCritical: boolean;
  hasStale: boolean;
  issueCountLast30Days: number;
  latestIssue: SupportIssueRow | null;
  openIssues: SupportIssueRow[];
};
