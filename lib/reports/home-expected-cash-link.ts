/**
 * Owner Home "Expected Cash" → cash drawer.
 *
 * The cash drawer is a Starter report and may be consolidated on Pro.
 * Starter and Growth reject storeId=ALL (SCOPE_CONSOLIDATED_FORBIDDEN),
 * including a business with one branch. ALL is only used when Pro
 * multi-branch consolidation is allowed. Every other link uses the
 * operational (header) store, or the sole owned store.
 *
 * Plan matches the cash drawer gate: plan, otherwise mode. selectedPlan
 * is not an input.
 */
import {
  getBusinessPlan,
  type BusinessMode,
  type BusinessPlan,
  type StoreMode,
} from '@/lib/features';
import {
  buildReportingScopeSearchParams,
  type ReportingScope,
} from '@/lib/reports/reporting-scope';

export type HomeExpectedCashScope = {
  plan: BusinessPlan;
  ownedStoreIds: readonly string[];
  operationalStoreId?: string | null;
};

type PlanSource = {
  plan?: string | null;
  mode?: string | null;
  storeMode?: string | null;
};

function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPlanOrMode(value: string | null): BusinessPlan | BusinessMode | null {
  if (
    value === 'STARTER' ||
    value === 'GROWTH' ||
    value === 'PRO' ||
    value === 'SIMPLE' ||
    value === 'ADVANCED'
  ) {
    return value;
  }
  return null;
}

function asStoreMode(value: string | null): StoreMode | null {
  if (value === 'SINGLE_STORE' || value === 'MULTI_STORE') return value;
  return null;
}

export function cashDrawerLinkPlan(source: PlanSource): BusinessPlan {
  const planOrMode = asPlanOrMode(blankToNull(source.plan) ?? blankToNull(source.mode));
  return getBusinessPlan(planOrMode, asStoreMode(blankToNull(source.storeMode)));
}

function distinctStoreIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const owned: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || trimmed === 'ALL' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    owned.push(trimmed);
  }
  return owned;
}

/**
 * Store id for the Expected Cash link.
 * `ALL` only when this plan can consolidate more than one branch.
 */
export function homeExpectedCashStoreId(input: HomeExpectedCashScope): 'ALL' | string | null {
  const owned = distinctStoreIds(input.ownedStoreIds);
  if (input.plan === 'PRO' && owned.length > 1) return 'ALL';

  const operational = distinctStoreIds([input.operationalStoreId ?? ''])[0] ?? null;
  if (operational && owned.includes(operational)) return operational;
  if (owned.length === 1) return owned[0];
  return null;
}

export function homeExpectedCashHref(
  scope: Pick<ReportingScope, 'periodKey' | 'fromInputValue' | 'toInputValue'>,
  input: HomeExpectedCashScope,
): string {
  const storeId = homeExpectedCashStoreId(input);
  if (!storeId) {
    const params = new URLSearchParams();
    params.set('period', scope.periodKey);
    params.set('from', scope.fromInputValue);
    params.set('to', scope.toInputValue);
    return `/reports/cash-drawer?${params.toString()}`;
  }
  return `/reports/cash-drawer?${buildReportingScopeSearchParams({ ...scope, storeId }).toString()}`;
}
