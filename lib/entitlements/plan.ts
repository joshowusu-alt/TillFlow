import {
  getBusinessPlan,
  type BusinessMode,
  type BusinessPlan,
  type StoreMode,
} from '@/lib/features';

/**
 * D.3 canonical entitlement plan: `plan ?? mode`, then the existing
 * `getBusinessPlan` legacy mapping. `selectedPlan` is not an input.
 *
 * The live `getBillingEntitlement` helper still reads `selectedPlan ?? plan ?? mode`.
 * Stage 1 does not switch that helper: it is on every authenticated request,
 * and the contract's pre-ship divergence count is a release record, not a
 * Production query this stage performs.
 */

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

export function resolveCanonicalPlan(source: PlanSource): BusinessPlan {
  const planOrMode = asPlanOrMode(blankToNull(source.plan) ?? blankToNull(source.mode));
  return getBusinessPlan(planOrMode, asStoreMode(blankToNull(source.storeMode)));
}
