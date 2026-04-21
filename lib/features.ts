export type BusinessMode = 'SIMPLE' | 'ADVANCED';
export type StoreMode = 'SINGLE_STORE' | 'MULTI_STORE';
export type BusinessPlan = 'STARTER' | 'GROWTH' | 'PRO';

const PLAN_RANK: Record<BusinessPlan, number> = {
  STARTER: 0,
  GROWTH: 1,
  PRO: 2,
};

export function getBusinessPlan(planOrMode?: BusinessPlan | BusinessMode | null, storeMode?: StoreMode | null): BusinessPlan {
  if (planOrMode === 'STARTER' || planOrMode === 'GROWTH' || planOrMode === 'PRO') {
    return planOrMode;
  }

  const advanced = planOrMode === 'ADVANCED';
  const multi = storeMode === 'MULTI_STORE';

  if (advanced && multi) return 'PRO';
  if (advanced) return 'GROWTH';
  return 'STARTER';
}

export function hasPlanAccess(plan: BusinessPlan, minimumPlan: BusinessPlan) {
  return PLAN_RANK[plan] >= PLAN_RANK[minimumPlan];
}

export function getPlanSummary(plan: BusinessPlan) {
  switch (plan) {
    case 'PRO':
      return {
        name: 'Pro',
        summary: 'Everything in Growth, plus stronger owner oversight, deeper audit visibility, and broader operational command.',
      };
    case 'GROWTH':
      return {
        name: 'Growth',
        summary: 'Everything in Starter, plus richer reporting, fuller expense categories, and stronger financial visibility.',
      };
    case 'STARTER':
    default:
      return {
        name: 'Starter',
        summary: 'Core POS, inventory, receipts, offline selling, and clean day-to-day operations for a lean retail setup.',
      };
  }
}

export function getFeatures(planOrMode?: BusinessPlan | BusinessMode | null, storeMode?: StoreMode | null) {
  const plan = getBusinessPlan(planOrMode, storeMode);
  const multi = storeMode === 'MULTI_STORE' && hasPlanAccess(plan, 'PRO');
  const growth = hasPlanAccess(plan, 'GROWTH');
  const pro = hasPlanAccess(plan, 'PRO');

  return {
    plan,
    planLabel: getPlanSummary(plan).name,
    advancedReports: growth,
    advancedOps: growth,
    financialReports: growth,
    detailedExpenseCategories: growth,
    riskMonitor: growth,
    loyaltyPoints: growth,
    ownerIntelligence: pro,
    cashflowForecast: pro,
    auditLog: pro,
    multiStore: multi,
  };
}

export function isAdvancedMode(planOrMode?: BusinessPlan | BusinessMode | null, storeMode?: StoreMode | null) {
  return hasPlanAccess(getBusinessPlan(planOrMode, storeMode), 'GROWTH');
}
