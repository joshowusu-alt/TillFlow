import type { TodaySnapshot } from '@/lib/reports/today/model';
import { stage3aExplore, stage3aLinks, type Stage3aLink, type Stage3aSection } from '@/lib/reports/today/stage3a-nav';
import { CONSOLIDATED_LABEL } from '@/lib/reports/scope-labels';

/** Synthetic figures for the review surface. Not used by `/reports`. */
export type ReviewPlan = 'STARTER' | 'GROWTH' | 'PRO';
export type ReviewRole = 'OWNER' | 'MANAGER';
export type ReviewScenario = 'empty' | 'healthy' | 'attention' | 'partial' | 'missing-cost' | 'error' | 'restricted' | 'cancelled';

const SAMPLE = 'Sample';

function days(today: number): TodaySnapshot['days'] {
  return [
    { key: '2026-09-24', label: 'Thu', salesPence: 0 },
    { key: '2026-09-25', label: 'Fri', salesPence: 40000 },
    { key: '2026-09-26', label: 'Sat', salesPence: 90000 },
    { key: '2026-09-27', label: 'Sun', salesPence: 20000 },
    { key: '2026-09-28', label: 'Mon', salesPence: 55000 },
    { key: '2026-09-29', label: 'Tue', salesPence: 80000 },
    { key: '2026-09-30', label: 'Wed', salesPence: today },
  ];
}

function base(overrides: Partial<TodaySnapshot> = {}): TodaySnapshot {
  return {
    readCount: 0,
    salesTodayPence: 150000,
    salesCount: 4,
    yesterdayPence: 80000,
    days: days(150000),
    moneyReceivedPence: 120000,
    methods: [
      { method: 'CASH', label: 'Cash', amountPence: 70000 },
      { method: 'MOBILE_MONEY', label: 'Mobile Money', amountPence: 50000 },
    ],
    cashDifferencePence: -200,
    comparison: { last30Pence: 2400000, previous30Pence: 2100000 },
    branches: null,
    profit: { state: 'ready', grossProfitPence: 45000 },
    topProducts: [{ name: `${SAMPLE} rice`, salesPence: 50000 }],
    attention: [],
    ...overrides,
  };
}

export function reviewSnapshot(scenario: ReviewScenario, plan: ReviewPlan, consolidated: boolean): TodaySnapshot | null {
  if (scenario === 'error' || scenario === 'cancelled') return null;
  if (scenario === 'empty') {
    return base({
      salesTodayPence: 0,
      salesCount: 0,
      yesterdayPence: 0,
      days: days(0).map((day) => ({ ...day, salesPence: 0 })),
      moneyReceivedPence: 0,
      methods: [],
      cashDifferencePence: null,
      comparison: plan === 'STARTER' ? null : { last30Pence: 0, previous30Pence: 0 },
      branches: null,
      profit: { state: 'omitted', grossProfitPence: null },
      topProducts: [],
      attention: [],
    });
  }
  const attention = scenario === 'attention' || scenario === 'healthy'
    ? scenario === 'attention'
      ? [{
        rank: 2 as const,
        severity: 'high' as const,
        title: `${SAMPLE}: cash counted is GH₵35.00 less than expected`,
        detail: 'Front till · sample branch',
        action: 'Review cash',
        href: '/reports/cash-drawer',
        occurredAt: '2026-09-30T18:00:00.000Z',
      }]
      : []
    : [];
  const partial = scenario === 'partial'
    ? base({
      moneyReceivedPence: 0,
      methods: [],
      cashDifferencePence: null,
      attention: [],
      profit: { state: 'omitted', grossProfitPence: null },
    })
    : null;
  const costs = scenario === 'missing-cost'
    ? base({ profit: { state: 'incomplete', grossProfitPence: null }, attention: [] })
    : null;
  const snapshot = partial ?? costs ?? base({
    attention,
    comparison: plan === 'STARTER' ? null : { last30Pence: 2400000, previous30Pence: 2100000 },
    profit: plan === 'STARTER' ? { state: 'omitted', grossProfitPence: null } : { state: 'ready', grossProfitPence: 45000 },
    branches: consolidated && plan === 'PRO'
      ? [
        { storeId: 'sample-a', name: `${SAMPLE} Madina`, salesPence: 90000 },
        { storeId: 'sample-b', name: `${SAMPLE} Kaneshie`, salesPence: 60000 },
      ]
      : null,
  });
  return snapshot;
}

export function reviewScopeLabel(plan: ReviewPlan, consolidated: boolean): string {
  if (consolidated && plan === 'PRO') return CONSOLIDATED_LABEL;
  return `${SAMPLE} Main Branch`;
}

/** Presentation mirror of catalogue minimums. Not an entitlement decision. */
export function reviewAllowedHrefs(plan: ReviewPlan, role: ReviewRole): Set<string> {
  const starter = [
    '/reports/dashboard',
    '/reports/business-movement',
    '/reports/money-received',
    '/reports/momo-confirmation',
    '/reports/cash-drawer',
    '/reports/stock-movements',
    '/reports/exports',
  ];
  const growth = [
    ...starter,
    '/reports/analytics',
    '/reports/margins',
    '/reports/reorder-suggestions',
    '/reports/sales-by-supplier',
    '/reports/risk-monitor',
    '/reports/income-statement',
  ];
  const owner = role === 'OWNER' ? ['/reports/owner', '/reports/audit-log'] : [];
  if (plan === 'STARTER') return new Set(starter);
  if (plan === 'GROWTH') return new Set(growth);
  return new Set([...growth, ...owner]);
}

export function reviewLinks(input: {
  section: Stage3aSection;
  plan: ReviewPlan;
  role: ReviewRole;
  analyticsVisible: boolean;
}): { links: Stage3aLink[]; explore: Stage3aLink[] } {
  const allowed = reviewAllowedHrefs(input.plan, input.role);
  const options = {
    tradingReplacesSalesAnalytics: !input.analyticsVisible,
    showNetworkQueue: true,
  };
  return {
    links: stage3aLinks(input.section, allowed, options),
    explore: stage3aExplore(allowed, options),
  };
}
